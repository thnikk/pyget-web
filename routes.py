import os
import sqlite3
import threading
import base64
from datetime import datetime, timedelta, timezone
from flask import Blueprint, jsonify, request, send_from_directory, current_app
from config import DB_PATH, DATA_DIR
from database import get_db_connection
from utils import build_feed_url, extract_episode_number, parse_anime_title
from services import check_single_show, cache_single_profile, get_transmission_client

api_bp = Blueprint('api', __name__)

@api_bp.route('/')
def index():
    """Serve the main HTML page."""
    return send_from_directory('static', 'index.html')


@api_bp.route('/<path:path>')
def serve_static(path):
    """Serve static files."""
    return send_from_directory('static', path)


@api_bp.route('/art/<path:filename>')
def serve_art(filename):
    """Serve artwork from the data directory."""
    return send_from_directory(os.path.join(DATA_DIR, 'art'), filename)


@api_bp.route('/api/profiles/<int:profile_id>', methods=['DELETE', 'PUT'])
def manage_profile_id(profile_id):
    """Delete or update a feed profile."""
    conn = get_db_connection()
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

@api_bp.route('/api/profiles', methods=['GET', 'POST'])
def manage_profiles():
    """Get all profiles or create a new profile."""
    conn = get_db_connection()
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


@api_bp.route('/api/shows', methods=['GET'])
def get_shows():
    """Get list of shows from cached data with optional search."""
    search_query = request.args.get('q', '').lower()

    conn = get_db_connection()
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


@api_bp.route('/api/tracked', methods=['GET', 'POST'])
def manage_tracked_shows():
    """Get tracked shows or add a new tracked show."""
    conn = get_db_connection()
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


@api_bp.route('/api/tracked/<int:tracked_id>/art', methods=['POST'])
def upload_show_art(tracked_id):
    """Upload artwork for a tracked show."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        conn = get_db_connection()
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


@api_bp.route('/api/tracked/<int:tracked_id>', methods=['DELETE', 'PUT'])
def delete_tracked_show(tracked_id):
    """Remove a tracked show."""
    conn = get_db_connection()
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


@api_bp.route('/api/transmission/torrents', methods=['GET'])
def get_torrents():
    """Get list of torrents from Transmission."""
    tc, _ = get_transmission_client()
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


@api_bp.route('/api/settings', methods=['GET', 'POST'])
def manage_settings():
    """Get or update settings."""
    conn = get_db_connection()
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


@api_bp.route('/api/schedule', methods=['GET'])
def get_schedule():
    """Get download history and predicted future releases for tracked shows."""
    try:
        conn = get_db_connection()
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
        now = datetime.now(timezone.utc)
        # Create a date object for comparison (start of today in UTC)
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
                    
                last_date = datetime.strptime(last_rel['release_date'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
                
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


@api_bp.route('/api/settings/artwork/cleanup', methods=['POST'])
def cleanup_artwork():
    """Delete artwork files not associated with any tracked show."""
    try:
        conn = get_db_connection()
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
