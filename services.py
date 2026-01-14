import os
import time
import sqlite3
import calendar
import feedparser
import transmissionrpc
from datetime import datetime, timedelta, timezone
from config import DB_PATH
from utils import parse_anime_title, build_feed_url

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
    Runs periodically to check for new episodes.
    """
    print("Starting torrent checker thread...")

    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()

            # Get all tracked shows
            c.execute('SELECT * FROM tracked_shows')
            tracked_shows = c.fetchall()

            tc, download_dir = get_transmission_client()
            if not tc:
                print("Cannot connect to Transmission, skipping check")
                conn.close()
                time.sleep(300)  # Wait 5 minutes before retry
                continue

            for show in tracked_shows:
                show_id, show_name, feed_url, profile_id, added_at, season_name, max_age, image_path = show
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

                            tc.add_torrent(torrent_url, download_dir=download_path)
                            print(f"Added to Transmission: {entry.title}")

                            # Only record if successfully added
                            try:
                                c.execute('''
                                    INSERT INTO downloaded_torrents
                                    (tracked_show_id, torrent_url,
                                     torrent_name, published_at)
                                    VALUES (?, ?, ?, ?)
                                ''', (show_id, torrent_url, entry.title, published_at))
                                conn.commit()
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

        # Check every 5 minutes
        time.sleep(300)

def update_cached_shows():
    """
    Background task to update cached shows from all profile feeds.
    Runs hourly to keep the show list fresh.
    """
    print("Starting feed cache updater thread...")

    while True:
        try:
            print("Updating cached shows...")
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()

            # Clear old cache
            c.execute('DELETE FROM cached_shows')

            # Get all profiles
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
            print("Cache update complete")

        except Exception as e:
            print(f"Error in cache updater: {e}")

        # Update every hour
        time.sleep(3600)

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

                tc.add_torrent(torrent_url, download_dir=download_path)
                print(f"Added to Transmission: {entry.title}")

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
    if len(profile) >= 6:
        profile_id, name, base_url, uploader, quality, color = profile
    else:
        profile_id, name, base_url, uploader, quality = profile
        color = '#88c0d0'
        
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
