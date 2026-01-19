import os
import time
import sqlite3
import calendar
import feedparser
import transmissionrpc
from datetime import datetime, timedelta, timezone
from config import DB_PATH
from utils import parse_anime_title, build_feed_url, parse_episode_info
from notifications import send_torrent_notification

def get_transmission_client():
    """Connect to Transmission daemon."""
    try:
        # Get settings from database
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT value FROM settings WHERE key = ?',
                  ('transmission_host',))
        host_row = c.fetchone()
        c.execute('SELECT value FROM settings WHERE key = ?',
                  ('transmission_port',))
        port_row = c.fetchone()
        c.execute('SELECT value FROM settings WHERE key = ?',
                  ('download_directory',))
        download_dir_row = c.fetchone()
        conn.close()

        host = host_row[0] if host_row else 'localhost'
        port = int(port_row[0]) if port_row else 9091
        download_dir = download_dir_row[0] if download_dir_row else None

        return transmissionrpc.Client(address=host, port=port), download_dir
    except Exception as e:
        print(f"Transmission connection error: {e}")
        return None, None

def update_cached_shows_once():
    """Run cache update once on startup."""
    time.sleep(2)  # Wait for app to fully start
    try:
        print("Initial cache update...")
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        c.execute('DELETE FROM cached_shows')

        c.execute('SELECT * FROM feed_profiles')
        profiles = c.fetchall()

        for profile in profiles:
            color = profile['color'] or '#88c0d0'
            feed_url = build_feed_url(profile['base_url'], profile['uploader'], profile['quality'])

            try:
                feed = feedparser.parse(feed_url)
                shows_seen = set()

                for entry in feed.entries:
                    show_name = parse_anime_title(entry.title)
                    if show_name and show_name not in shows_seen:
                        shows_seen.add(show_name)

                        c.execute('''
                            INSERT INTO cached_shows
                            (show_name, profile_id, profile_name,
                             base_url, uploader, quality, color)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (show_name, profile['id'], profile['name'], profile['base_url'],
                              profile['uploader'], profile['quality'], color))

                print(f"Cached {len(shows_seen)} shows from {profile['name']}")

            except Exception as e:
                print(f"Error caching feed {profile['name']}: {e}")

        conn.commit()
        conn.close()
        print("Initial cache complete")

    except Exception as e:
        print(f"Error in initial cache: {e}")

def check_and_download_torrents():
    """
    Background task to check RSS feeds and download new torrents.
    Checks each tracked show based on its profile's interval setting.
    """
    print("Starting torrent checker thread...")
    profile_last_checked = {}  # Track when each profile was last checked

    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()

            # Get all tracked shows with their profile intervals
            c.execute('''
                SELECT ts.*, fp.interval as profile_interval
                FROM tracked_shows ts
                LEFT JOIN feed_profiles fp ON ts.profile_id = fp.id
            ''')
            tracked_shows = c.fetchall()

            tc, download_dir = get_transmission_client()
            if not tc:
                print("Cannot connect to Transmission, skipping check")
                conn.close()
                time.sleep(60)  # Wait 1 minute before retry
                continue

            current_time = time.time()
            profiles_to_check = set()

            # First pass: identify which profiles need checking
            for show in tracked_shows:
                profile_id = show['profile_id']
                interval = (show['profile_interval'] or 30) * 60  # Convert minutes to seconds
                
                # Check if this profile needs to be checked
                if (profile_id not in profile_last_checked or 
                    current_time - profile_last_checked[profile_id] >= interval):
                    profiles_to_check.add(profile_id)
                    
                    # Update last checked time for this profile
                    profile_last_checked[profile_id] = current_time

            # Second pass: add all shows for profiles that need checking
            shows_to_check = [show for show in tracked_shows if show['profile_id'] in profiles_to_check]

            if shows_to_check:
                print(f"Checking {len(shows_to_check)} shows due for RSS check")

            for show in shows_to_check:
                show_id, show_name, feed_url, profile_id, added_at, season_name, max_age, image_path = show[:8]
                download_path = os.path.join(download_dir, show_name, season_name) if season_name else os.path.join(download_dir, show_name)

                try:
                    # Parse the RSS feed
                    feed = feedparser.parse(feed_url)

                    for entry in feed.entries:
                        # Check max_age
                        if max_age and hasattr(entry, 'published_parsed'):
                            published_date = datetime.fromtimestamp(
                                calendar.timegm(entry.published_parsed), timezone.utc)
                            if datetime.now(timezone.utc) - published_date > timedelta(days=max_age):
                                continue

                        torrent_url = None

                        # Find torrent link
                        if hasattr(entry, 'links'):
                            for link in entry.links:
                                if (link.get('type') ==
                                        'application/x-bittorrent'):
                                    torrent_url = link.get('href')
                                    break

                        if not torrent_url and hasattr(entry, 'link'):
                            torrent_url = entry.link

                        if not torrent_url:
                            continue

                        # Parse episode info for metadata and replacement logic
                        episode_info = parse_episode_info(entry.title)
                        
                        # Check if this is a potential replacement
                        replacement_candidate = None
                        if episode_info['episode'] and episode_info['subgroup']:
                            # Look for existing episodes from same subgroup with lower version
                            c.execute('''
                                SELECT id, version FROM downloaded_torrents
                                WHERE episode_number = ? AND subgroup = ? 
                                AND is_deleted = FALSE AND tracked_show_id = ?
                                ORDER BY version DESC
                            ''', (episode_info['episode'], episode_info['subgroup'], show_id))
                            
                            existing = c.fetchone()
                            if existing and episode_info['version'] > existing['version']:
                                replacement_candidate = existing['id']
                                print(f"Found replacement candidate: {entry.title} replaces version {existing['version']}")
                        
                        # Check if already downloaded
                        c.execute('''
                            SELECT id FROM downloaded_torrents
                            WHERE torrent_url = ?
                        ''', (torrent_url,))

                        if c.fetchone():
                            continue  # Already added

                        # Add torrent to Transmission
                        try:
                            # Get publication date
                            published_at = None
                            if hasattr(entry, 'published_parsed'):
                                published_at = datetime.fromtimestamp(
                                    calendar.timegm(entry.published_parsed), timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

                            os.makedirs(download_path, exist_ok=True)
                            tc.add_torrent(torrent_url, download_dir=download_path)
                            print(f"Added to Transmission: {entry.title}")

                            # Send notification
                            send_torrent_notification(entry.title, show_name, episode_info)

                            # Only record if successfully added
                            try:
                                c.execute('''
                                    INSERT INTO downloaded_torrents
                                    (tracked_show_id, torrent_url,
                                     torrent_name, published_at, episode_number,
                                     version, subgroup)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                ''', (show_id, torrent_url, entry.title, published_at,
                                      episode_info['episode'], episode_info['version'], 
                                      episode_info['subgroup']))
                                conn.commit()
                                
                                # If this is a replacement, track it for deletion after download completes
                                if replacement_candidate:
                                    new_torrent_id = c.lastrowid
                                    c.execute('''
                                        UPDATE downloaded_torrents
                                        SET replaced_by = ?
                                        WHERE id = ?
                                    ''', (new_torrent_id, replacement_candidate))
                                    conn.commit()
                                    print(f"Scheduled replacement: torrent {replacement_candidate} will be replaced by {new_torrent_id}")
                                    
                            except sqlite3.IntegrityError:
                                # Already in database, skip
                                pass

                        except Exception as e:
                            print(f"Error adding torrent {entry.title}: {e}")

                except Exception as e:
                    print(f"Error checking feed for {show_name}: {e}")

            conn.close()

        except Exception as e:
            print(f"Error in torrent checker: {e}")

        # Check every minute for interval evaluation
        time.sleep(60)

def update_cached_shows():
    """
    Background task to update cached shows from all profile feeds.
    Checks each profile based on its interval setting.
    """
    print("Starting feed cache updater thread...")
    profile_last_cached = {}  # Track when each profile was last cached

    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()

            # Get all profiles
            c.execute('SELECT * FROM feed_profiles')
            profiles = c.fetchall()

            current_time = time.time()
            profiles_to_update = []

            # Check which profiles need to be updated
            for profile in profiles:
                profile_id = profile['id']
                interval = (profile['interval'] if profile['interval'] else 60) * 60  # Convert minutes to seconds, default to 1 hour
                
                # Check if this profile needs to be updated
                if (profile_id not in profile_last_cached or 
                    current_time - profile_last_cached[profile_id] >= interval):
                    profiles_to_update.append(profile)
                    
                    # Update last cached time for this profile
                    profile_last_cached[profile_id] = current_time

            if profiles_to_update:
                print(f"Updating cache for {len(profiles_to_update)} profiles due for refresh")

                for profile in profiles_to_update:
                    # Clear old cache for this profile only
                    c.execute('DELETE FROM cached_shows WHERE profile_id = ?', (profile['id'],))
                    
                    color = profile['color'] or '#88c0d0'
                    feed_url = build_feed_url(profile['base_url'], profile['uploader'], profile['quality'])

                    try:
                        feed = feedparser.parse(feed_url)
                        shows_seen = set()

                        for entry in feed.entries:
                            show_name = parse_anime_title(entry.title)
                            if show_name and show_name not in shows_seen:
                                shows_seen.add(show_name)

                                c.execute('''
                                    INSERT INTO cached_shows
                                    (show_name, profile_id, profile_name,
                                     base_url, uploader, quality, color)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                ''', (show_name, profile['id'], profile['name'], profile['base_url'],
                                      profile['uploader'], profile['quality'], color))

                        print(f"Cached {len(shows_seen)} shows from {profile['name']}")

                    except Exception as e:
                        print(f"Error caching feed {profile['name']}: {e}")

                conn.commit()
                conn.close()
                print("Cache update complete")

        except Exception as e:
            print(f"Error in cache updater: {e}")

        # Check every minute for interval evaluation
        time.sleep(60)

def check_single_show(tracked_show_id):
    """
    Immediately check a single tracked show for torrents.
    Used when first adding a show to get initial episodes.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        c.execute('SELECT * FROM tracked_shows WHERE id = ?',
                  (tracked_show_id,))
        show = c.fetchone()

        if not show:
            conn.close()
            return

        show_id, show_name, feed_url, profile_id, added_at, season_name, max_age, image_path = show

        tc, download_dir = get_transmission_client()
        if not tc:
            print("Cannot connect to Transmission")
            conn.close()
            return

        download_path = os.path.join(download_dir, show_name, season_name) if season_name else os.path.join(download_dir, show_name)

        feed = feedparser.parse(feed_url)

        for entry in feed.entries:
            # Check max_age
            if max_age and hasattr(entry, 'published_parsed'):
                published_date = datetime.fromtimestamp(
                    calendar.timegm(entry.published_parsed), timezone.utc)
                if datetime.now(timezone.utc) - published_date > timedelta(days=max_age):
                    continue

            torrent_url = None

            if hasattr(entry, 'links'):
                for link in entry.links:
                    if link.get('type') == 'application/x-bittorrent':
                        torrent_url = link.get('href')
                        break

            if not torrent_url and hasattr(entry, 'link'):
                torrent_url = entry.link

            if not torrent_url:
                continue

            # Check if already downloaded
            c.execute('''
                SELECT id FROM downloaded_torrents
                WHERE torrent_url = ?
            ''', (torrent_url,))

            if c.fetchone():
                continue

            try:
                # Get publication date
                published_at = None
                if hasattr(entry, 'published_parsed'):
                    published_at = datetime.fromtimestamp(
                        calendar.timegm(entry.published_parsed), timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

                os.makedirs(download_path, exist_ok=True)
                tc.add_torrent(torrent_url, download_dir=download_path)
                print(f"Added to Transmission: {entry.title}")

                # Send notification
                send_torrent_notification(entry.title, show_name)

                # Only record if successfully added
                try:
                    c.execute('''
                        INSERT INTO downloaded_torrents
                        (tracked_show_id, torrent_url, torrent_name, published_at)
                        VALUES (?, ?, ?, ?)
                    ''', (show_id, torrent_url, entry.title, published_at))
                    conn.commit()
                except sqlite3.IntegrityError:
                    # Already in database, skip
                    pass

            except Exception as e:
                print(f"Error adding torrent {entry.title}: {e}")

        conn.close()

    except Exception as e:
        print(f"Error checking show: {e}")

def cache_single_profile(profile):
    """Cache shows from a single profile immediately."""
    if len(profile) >= 7:
        profile_id, name, base_url, uploader, quality, color, interval = profile
    elif len(profile) >= 6:
        profile_id, name, base_url, uploader, quality, color = profile
        interval = 300
    else:
        profile_id, name, base_url, uploader, quality = profile
        color = '#88c0d0'
        interval = 300
        
    feed_url = build_feed_url(base_url, uploader, quality)
    
    try:
        print(f"Caching shows from new profile: {name}")
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        feed = feedparser.parse(feed_url)
        shows_seen = set()
        
        for entry in feed.entries:
            show_name = parse_anime_title(entry.title)
            if show_name and show_name not in shows_seen:
                shows_seen.add(show_name)
                
                c.execute('''
                    INSERT INTO cached_shows
                    (show_name, profile_id, profile_name,
                     base_url, uploader, quality, color)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (show_name, profile_id, name, base_url,
                      uploader, quality, color))
        
        conn.commit()
        conn.close()
        print(f"Cached {len(shows_seen)} shows from {name}")
        
    except Exception as e:
        print(f"Error caching profile {name}: {e}")

def get_replacement_setting():
    """Check if automatic v2 replacement is enabled."""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT value FROM settings WHERE key = ?', ('auto_replace_v2',))
        result = c.fetchone()
        conn.close()
        return result and result[0] == '1'
    except:
        return True  # Default to enabled

def monitor_downloads_for_replacement():
    """
    Background task to monitor completed downloads and perform replacements.
    Runs every minute to check for torrents that have completed downloading.
    """
    print("Starting download monitor for v2 replacements...")
    
    while True:
        try:
            if not get_replacement_setting():
                time.sleep(60)
                continue
                
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            
            # Find torrents that are marked to be replaced
            c.execute('''
                SELECT dt.id, dt.torrent_url, dt.torrent_name, dt.replaced_by
                FROM downloaded_torrents dt
                WHERE dt.replaced_by IS NOT NULL AND dt.is_deleted = FALSE
            ''')
            
            torrents_to_replace = c.fetchall()
            
            if torrents_to_replace:
                tc, _ = get_transmission_client()
                if tc:
                    for torrent_data in torrents_to_replace:
                        old_torrent_id, old_url, old_name, replacement_id = torrent_data
                        
                        # Check if replacement torrent is complete
                        c.execute('''
                            SELECT dt.torrent_url, dt.torrent_name
                            FROM downloaded_torrents dt
                            WHERE dt.id = ?
                        ''', (replacement_id,))
                        
                        replacement_info = c.fetchone()
                        
                        if replacement_info:
                            replacement_url, replacement_name = replacement_info
                            
                            # Get torrent status from Transmission
                            try:
                                torrents = tc.get_torrents()
                                replacement_torrent = None
                                old_torrent = None
                                
                                for torrent in torrents:
                                    if torrent.url == replacement_url:
                                        replacement_torrent = torrent
                                    elif torrent.url == old_url:
                                        old_torrent = torrent
                                
                                # If replacement is complete and old torrent exists
                                if (replacement_torrent and replacement_torrent.progress == 100 and 
                                    old_torrent):
                                    print(f"Replacing {old_name} with {replacement_name}")
                                    
                                    # Remove old torrent from Transmission
                                    tc.remove_torrent(old_torrent, delete_data=True)
                                    
                                    # Mark as deleted in database
                                    c.execute('''
                                        UPDATE downloaded_torrents
                                        SET is_deleted = TRUE
                                        WHERE id = ?
                                    ''', (old_torrent_id,))
                                    conn.commit()
                                    
                                    print(f"Successfully replaced torrent {old_torrent_id}")
                                    
                            except Exception as e:
                                print(f"Error removing old torrent {old_torrent_id}: {e}")
            
            conn.close()
            
        except Exception as e:
            print(f"Error in replacement monitor: {e}")
            
        time.sleep(60)  # Check every minute
