#!/usr/bin/env python3
"""
Anime RSS feed manager with Transmission integration.
Provides API endpoints for managing RSS feed profiles and tracked shows.
"""
import os
import re
import sqlite3
import threading
import time
import base64
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import feedparser
import transmissionrpc
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS


app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Data directory configuration
DATA_DIR = os.path.expanduser('~/.local/share/pyget')
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, 'art'), exist_ok=True)

# Database initialization
DB_PATH = os.path.join(DATA_DIR, 'anime_tracker.db')


def init_db():
    """Initialize SQLite database with required tables."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Feed profiles table
    c.execute('''
        CREATE TABLE IF NOT EXISTS feed_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            uploader TEXT,
            quality TEXT,
            color TEXT DEFAULT '#88c0d0',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add color column if it doesn't exist (for existing databases)
    try:
        c.execute('ALTER TABLE feed_profiles ADD COLUMN color TEXT DEFAULT "#88c0d0"')
        print("Added color column to feed_profiles")
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Tracked shows table
    c.execute('''
        CREATE TABLE IF NOT EXISTS tracked_shows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_name TEXT NOT NULL,
            feed_url TEXT NOT NULL,
            profile_id INTEGER,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            season_name TEXT,
            max_age INTEGER,
            image_path TEXT,
            FOREIGN KEY (profile_id) REFERENCES feed_profiles (id)
        )
    ''')

    # Add season_name, max_age, and image_path columns if they don't exist
    try:
        c.execute('ALTER TABLE tracked_shows ADD COLUMN season_name TEXT')
        c.execute('ALTER TABLE tracked_shows ADD COLUMN max_age INTEGER')
        c.execute('ALTER TABLE tracked_shows ADD COLUMN image_path TEXT')
        print("Added columns to tracked_shows")
    except sqlite3.OperationalError:
        pass # Columns already exist

    # Downloaded torrents table to track what we've already added
    c.execute('''
        CREATE TABLE IF NOT EXISTS downloaded_torrents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracked_show_id INTEGER NOT NULL,
            torrent_url TEXT NOT NULL,
            torrent_name TEXT NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            published_at TIMESTAMP,
            UNIQUE(torrent_url),
            FOREIGN KEY (tracked_show_id) REFERENCES tracked_shows (id)
        )
    ''')

    # Add published_at column if it doesn't exist
    try:
        c.execute('ALTER TABLE downloaded_torrents ADD COLUMN published_at TIMESTAMP')
        print("Added published_at column to downloaded_torrents")
    except sqlite3.OperationalError:
        pass # Column already exists

    # Cached shows table for profile feed caching
    c.execute('''
        CREATE TABLE IF NOT EXISTS cached_shows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_name TEXT NOT NULL,
            profile_id INTEGER NOT NULL,
            profile_name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            uploader TEXT,
            quality TEXT,
            color TEXT,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES feed_profiles (id)
        )
    ''')

    # Add color column to cached_shows if it doesn't exist
    try:
        c.execute('ALTER TABLE cached_shows ADD COLUMN color TEXT')
        print("Added color column to cached_shows")
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Settings table for transmission config
    c.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # Insert default transmission settings if not exists
    c.execute('''
        INSERT OR IGNORE INTO settings (key, value)
        VALUES ('transmission_host', 'localhost')
    ''')
    c.execute('''
        INSERT OR IGNORE INTO settings (key, value)
        VALUES ('transmission_port', '9091')
    ''')
    c.execute('''
        INSERT OR IGNORE INTO settings (key, value)
        VALUES ('download_directory', '')
    ''')

    # Create index for faster searches
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_cached_shows_name
        ON cached_shows(show_name)
    ''')

    conn.commit()
    conn.close()


init_db()


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


def parse_anime_title(title: str) -> Optional[str]:
    """
    Extract show name from anime title format.
    Expected: [SubGroup] Show name - episode (quality) [id].mkv
    """
    # Remove brackets and their contents from the start
    match = re.search(r'\[.*?\]\s*(.*?)\s*-\s*\d+', title)
    if match:
        return match.group(1).strip()
    return None


def build_feed_url(base_url: str, uploader: str = None,
                   quality: str = None, show: str = None) -> str:
    """Build RSS feed URL with query parameters."""
    params = {}

    if show:
        search_terms = [show]
        if quality:
            search_terms.append(quality)
        params['q'] = ' '.join(search_terms)
    elif quality:
        params['q'] = quality

    if uploader:
        params['u'] = uploader

    if params:
        return f"{base_url}/?page=rss&{urlencode(params)}"
    return f"{base_url}/?page=rss"


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
                                time.mktime(entry.published_parsed))
                            if datetime.now() - published_date > timedelta(days=max_age):
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
                                    time.mktime(entry.published_parsed)).strftime('%Y-%m-%d %H:%M:%S')

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
                    time.mktime(entry.published_parsed))
                if datetime.now() - published_date > timedelta(days=max_age):
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
                        time.mktime(entry.published_parsed)).strftime('%Y-%m-%d %H:%M:%S')

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


@app.route('/')
def index():
    """Serve the main HTML page."""
    return send_from_directory('static', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    """Serve static files."""
    return send_from_directory('static', path)


@app.route('/art/<path:filename>')
def serve_art(filename):
    """Serve artwork from the data directory."""
    return send_from_directory(os.path.join(DATA_DIR, 'art'), filename)


@app.route('/api/profiles/<int:profile_id>', methods=['DELETE', 'PUT'])
def manage_profile_id(profile_id):
    """Delete or update a feed profile."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    if request.method == 'DELETE':
        c.execute('DELETE FROM feed_profiles WHERE id = ?', (profile_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'deleted'})
    
    elif request.method == 'PUT':
        data = request.json
        c.execute('''
            UPDATE feed_profiles
            SET name = ?, base_url = ?, uploader = ?, quality = ?, color = ?
            WHERE id = ?
        ''', (
            data['name'],
            data['base_url'],
            data.get('uploader'),
            data.get('quality'),
            data.get('color', '#88c0d0'),
            profile_id
        ))
        conn.commit()

        # Get the updated profile details for caching
        profile = (profile_id, data['name'], data['base_url'],
                   data.get('uploader'), data.get('quality'),
                   data.get('color', '#88c0d0'))

        conn.close()

        # Immediately update cache for this profile
        threading.Thread(
            target=cache_single_profile,
            args=(profile,),
            daemon=True
        ).start()
        
        return jsonify({'id': profile_id, 'status': 'updated'}), 200

@app.route('/api/profiles', methods=['GET', 'POST'])
def manage_profiles():
    """Get all profiles or create a new profile."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    if request.method == 'GET':
        c.execute('SELECT id, name, base_url, uploader, quality, color, created_at FROM feed_profiles ORDER BY created_at DESC')
        profiles = []
        for row in c.fetchall():
            profiles.append({
                'id': row['id'],
                'name': row['name'],
                'base_url': row['base_url'],
                'uploader': row['uploader'],
                'quality': row['quality'],
                'color': row['color'] or '#88c0d0',
                'created_at': row['created_at']
            })
        conn.close()
        return jsonify(profiles)

    elif request.method == 'POST':
        data = request.json
        c.execute('''
            INSERT INTO feed_profiles (name, base_url, uploader, quality, color)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            data['name'],
            data['base_url'],
            data.get('uploader'),
            data.get('quality'),
            data.get('color', '#88c0d0')
        ))
        conn.commit()
        profile_id = c.lastrowid
        
        # Get the profile details
        profile = (profile_id, data['name'], data['base_url'],
                   data.get('uploader'), data.get('quality'),
                   data.get('color', '#88c0d0'))
        
        conn.close()
        
        # Immediately update cache for this profile
        threading.Thread(
            target=cache_single_profile,
            args=(profile,),
            daemon=True
        ).start()
        
        return jsonify({'id': profile_id, 'status': 'created'}), 201


@app.route('/api/shows', methods=['GET'])
def get_shows():
    """Get list of shows from cached data with optional search."""
    search_query = request.args.get('q', '').lower()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    if search_query:
        c.execute('''
            SELECT show_name, profile_id, profile_name, base_url, uploader, quality, color
            FROM cached_shows
            WHERE LOWER(show_name) LIKE ?
            ORDER BY show_name
        ''', (f'%{search_query}%',))
    else:
        c.execute('SELECT show_name, profile_id, profile_name, base_url, uploader, quality, color FROM cached_shows ORDER BY show_name')

    cached = c.fetchall()
    conn.close()

    # Group by show name
    shows_dict = {}
    for row in cached:
        show_name = row['show_name']
        if show_name not in shows_dict:
            shows_dict[show_name] = []

        shows_dict[show_name].append({
            'profile_id': row['profile_id'],
            'profile_name': row['profile_name'],
            'base_url': row['base_url'],
            'uploader': row['uploader'],
            'quality': row['quality'],
            'color': row['color'] or '#88c0d0'
        })

    shows = []
    for show_name, sources in shows_dict.items():
        # Deduplicate sources by profile_id
        unique_sources = {s['profile_id']: s for s in sources}
        shows.append({
            'name': show_name,
            'sources': list(unique_sources.values())
        })

    return jsonify(shows)


@app.route('/api/tracked', methods=['GET', 'POST'])
def manage_tracked_shows():
    """Get tracked shows or add a new tracked show."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    if request.method == 'GET':
        c.execute('''
            SELECT ts.id, ts.show_name, ts.feed_url, ts.profile_id, ts.added_at,
                   ts.season_name, ts.max_age, ts.image_path,
                   fp.name as profile_name, fp.base_url, fp.uploader, fp.quality, fp.color
            FROM tracked_shows ts
            LEFT JOIN feed_profiles fp ON ts.profile_id = fp.id
            ORDER BY ts.added_at DESC
        ''')
        tracked = []
        for row in c.fetchall():
            tracked.append({
                'id': row['id'],
                'show_name': row['show_name'],
                'feed_url': row['feed_url'],
                'profile_id': row['profile_id'],
                'added_at': row['added_at'],
                'season_name': row['season_name'],
                'max_age': row['max_age'],
                'image_path': row['image_path'],
                'profile_name': row['profile_name'],
                'base_url': row['base_url'],
                'uploader': row['uploader'],
                'quality': row['quality'],
                'color': row['color'] or '#88c0d0'
            })
        conn.close()
        return jsonify(tracked)

    elif request.method == 'POST':
        data = request.json
        show_name = data['show_name']
        profile_id = data['profile_id']
        season_name = data.get('season_name')
        max_age = data.get('max_age')

        # Get profile details
        c.execute('SELECT * FROM feed_profiles WHERE id = ?',
                  (profile_id,))
        profile = c.fetchone()

        if not profile:
            conn.close()
            return jsonify({'error': 'Profile not found'}), 404

        # Handle both old and new schema
        if len(profile) >= 7:
            _, _, base_url, uploader, quality, color, _ = profile
        else:
            _, _, base_url, uploader, quality, _ = profile
            
        feed_url = build_feed_url(base_url, uploader, quality, show_name)

        c.execute('''
            INSERT INTO tracked_shows (show_name, feed_url, profile_id, season_name, max_age)
            VALUES (?, ?, ?, ?, ?)
        ''', (show_name, feed_url, profile_id, season_name, max_age))
        conn.commit()
        tracked_id = c.lastrowid
        conn.close()

        # Trigger immediate check for new torrents
        threading.Thread(
            target=check_single_show,
            args=(tracked_id,),
            daemon=True
        ).start()

        return jsonify({
            'id': tracked_id,
            'status': 'tracked',
            'feed_url': feed_url
        }), 201


@app.route('/api/tracked/<int:tracked_id>/art', methods=['POST'])
def upload_show_art(tracked_id):
    """Upload artwork for a tracked show."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT show_name FROM tracked_shows WHERE id = ?', (tracked_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Show not found'}), 404
        
        show_name = row[0]
        
        # Create art directory
        art_dir = os.path.join(DATA_DIR, 'art')
        os.makedirs(art_dir, exist_ok=True)
        
        # Generate filename
        # User requested base64-encoded name
        ext = os.path.splitext(file.filename)[1]
        if not ext:
            ext = '.jpg' # Default fallback
            
        safe_name = base64.urlsafe_b64encode(show_name.encode()).decode()
        # Remove padding characters to make it cleaner
        safe_name = safe_name.rstrip('=')
        
        filename = f"{safe_name}{ext}"
        filepath = os.path.join(art_dir, filename)
        
        file.save(filepath)
        
        # Save relative path to DB
        rel_path = f"art/{filename}"
        c.execute('UPDATE tracked_shows SET image_path = ? WHERE id = ?', (rel_path, tracked_id))
        conn.commit()
        conn.close()
        
        return jsonify({'image_path': rel_path})


@app.route('/api/tracked/<int:tracked_id>', methods=['DELETE', 'PUT'])
def delete_tracked_show(tracked_id):
    """Remove a tracked show."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    if request.method == 'DELETE':
        # First, delete associated downloaded torrents
        c.execute('DELETE FROM downloaded_torrents WHERE tracked_show_id = ?', (tracked_id,))
        
        # Then, delete the show itself
        c.execute('DELETE FROM tracked_shows WHERE id = ?', (tracked_id,))
        
        conn.commit()
        conn.close()
        return jsonify({'status': 'removed'})

    elif request.method == 'PUT':
        data = request.json
        c.execute('''
            UPDATE tracked_shows
            SET show_name = ?, season_name = ?, max_age = ?
            WHERE id = ?
        ''', (
            data['show_name'],
            data.get('season_name'),
            data.get('max_age'),
            tracked_id
        ))
        conn.commit()
        conn.close()
        return jsonify({'id': tracked_id, 'status': 'updated'}), 200


@app.route('/api/transmission/torrents', methods=['GET'])
def get_torrents():
    """Get list of torrents from Transmission."""
    tc = get_transmission_client()
    if not tc:
        return jsonify({'error': 'Cannot connect to Transmission'}), 503

    try:
        torrents = tc.get_torrents()
        result = []
        for t in torrents:
            result.append({
                'id': t.id,
                'name': t.name,
                'status': t.status,
                'progress': t.progress,
                'download_rate': t.rateDownload,
                'upload_rate': t.rateUpload
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/settings', methods=['GET', 'POST'])
def manage_settings():
    """Get or update settings."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    if request.method == 'GET':
        c.execute('SELECT key, value FROM settings')
        settings = {row[0]: row[1] for row in c.fetchall()}
        conn.close()
        return jsonify(settings)

    elif request.method == 'POST':
        data = request.json

        for key, value in data.items():
            c.execute('''
                INSERT OR REPLACE INTO settings (key, value)
                VALUES (?, ?)
            ''', (key, value))

        conn.commit()
        conn.close()
        return jsonify({'status': 'updated'})


def extract_episode_number(title: str) -> Optional[str]:
    """Extract episode number from anime title format."""
    # Expected: [SubGroup] Show name - 01 (quality) [id].mkv
    match = re.search(r'-\s*(\d+)', title)
    if match:
        return match.group(1)
    return None


@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    """Get download history and predicted future releases for tracked shows."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Get all tracked shows
        c.execute('''
            SELECT ts.id, ts.show_name, ts.image_path, fp.color
            FROM tracked_shows ts
            LEFT JOIN feed_profiles fp ON ts.profile_id = fp.id
        ''')
        shows = {row['id']: dict(row) for row in c.fetchall()}

        # Get download history
        c.execute('''
            SELECT tracked_show_id, torrent_name, added_at, published_at
            FROM downloaded_torrents
            ORDER BY COALESCE(published_at, added_at) DESC
        ''')
        history = c.fetchall()
        
        # Group history by show
        show_history = {}
        for row in history:
            sid = row['tracked_show_id']
            if sid not in shows:
                continue
            if sid not in show_history:
                show_history[sid] = []
            
            item = dict(row)
            item['release_date'] = row['published_at'] or row['added_at']
            item['episode'] = extract_episode_number(row['torrent_name'])
            show_history[sid].append(item)

        schedule = []
        now = datetime.now()
        # Create a date object for comparison (start of today)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)

        for sid, info in shows.items():
            releases = show_history.get(sid, [])
            predictions = []
            
            if releases:
                # Use the latest release as the anchor
                last_rel = releases[0]
                try:
                    last_ep_num = int(last_rel.get('episode') or 0)
                except ValueError:
                    last_ep_num = 0
                    
                last_date = datetime.strptime(last_rel['release_date'], '%Y-%m-%d %H:%M:%S')
                
                # Start predicting from the next episode
                current_ep = last_ep_num + 1
                # Base expected date is 1 week after last release
                current_date = last_date + timedelta(days=7)
                
                # If the expected date is in the past, it means a release was missed.
                # Shift all subsequent releases by a week until the expected date is today or in the future.
                while current_date < today:
                    current_date += timedelta(days=7)
                
                # Predict until end of season (assume 12 episodes)
                # If we're already past 12, predict 3 more
                max_ep = max(12, last_ep_num + 3)
                
                ep_padding = len(last_rel.get('episode') or '01')
                
                while current_ep <= max_ep:
                    predictions.append({
                        'episode': str(current_ep).zfill(ep_padding),
                        'date': current_date.strftime('%Y-%m-%d %H:%M:%S')
                    })
                    current_ep += 1
                    current_date += timedelta(days=7)

            schedule.append({
                'id': sid,
                'show_name': info['show_name'],
                'image_path': info['image_path'],
                'color': info['color'],
                'history': releases[:20],
                'predictions': predictions
            })

        conn.close()
        return jsonify(schedule)
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/settings/artwork/cleanup', methods=['POST'])
def cleanup_artwork():
    """Delete artwork files not associated with any tracked show."""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT image_path FROM tracked_shows WHERE image_path IS NOT NULL')
        used_images = {row[0] for row in c.fetchall()}
        conn.close()

        art_dir = os.path.join(DATA_DIR, 'art')
        if not os.path.exists(art_dir):
            return jsonify({'count': 0})

        deleted_count = 0
        for filename in os.listdir(art_dir):
            filepath = os.path.join(art_dir, filename)
            # image_path in DB is like "art/filename.jpg", so check "art/" + filename
            rel_path = f"art/{filename}"
            
            if rel_path not in used_images:
                try:
                    os.remove(filepath)
                    deleted_count += 1
                except OSError as e:
                    print(f"Error deleting {filepath}: {e}")

        return jsonify({'count': deleted_count})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Start background torrent checker
    checker_thread = threading.Thread(
        target=check_and_download_torrents,
        daemon=True
    )
    checker_thread.start()

    # Start background cache updater
    cache_thread = threading.Thread(
        target=update_cached_shows,
        daemon=True
    )
    cache_thread.start()

    # Do initial cache update
    threading.Thread(target=update_cached_shows_once, daemon=True).start()

    app.run(debug=True, host='0.0.0.0', port=5000)
