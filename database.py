import sqlite3
from config import DB_PATH

def init_db():
    """Initialize SQLite database with required tables."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    c = conn.cursor()

    # Enable WAL mode for better concurrency
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')

    # Feed profiles table
    c.execute('''
        CREATE TABLE IF NOT EXISTS feed_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            uploader TEXT,
            quality TEXT,
            color TEXT DEFAULT '#88c0d0',
            interval INTEGER DEFAULT 30,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add color column if it doesn't exist (for existing databases)
    try:
        c.execute('ALTER TABLE feed_profiles ADD COLUMN color TEXT DEFAULT "#88c0d0"')
        print("Added color column to feed_profiles")
    except sqlite3.OperationalError:
        pass  # Column already exists

    # Add interval column if it doesn't exist (for existing databases)
    try:
        c.execute('ALTER TABLE feed_profiles ADD COLUMN interval INTEGER DEFAULT 30')
        print("Added interval column to feed_profiles")
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

    # Add episode metadata columns for v2 replacement logic
    try:
        c.execute('ALTER TABLE downloaded_torrents ADD COLUMN episode_number TEXT')
        c.execute('ALTER TABLE downloaded_torrents ADD COLUMN version INTEGER DEFAULT 1')
        c.execute('ALTER TABLE downloaded_torrents ADD COLUMN subgroup TEXT')
        c.execute('ALTER TABLE downloaded_torrents ADD COLUMN replaced_by INTEGER')
        c.execute('ALTER TABLE downloaded_torrents ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE')
        print("Added episode metadata columns to downloaded_torrents")
    except sqlite3.OperationalError:
        pass # Columns already exist

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
    c.execute('''
        INSERT OR IGNORE INTO settings (key, value)
        VALUES ('setup_complete', '0')
    ''')
    c.execute('''
        INSERT OR IGNORE INTO settings (key, value)
        VALUES ('auto_replace_v2', '1')
    ''')
    c.execute('''
        INSERT OR IGNORE INTO settings (key, value)
        VALUES ('notifications_enabled', '0')
    ''')

    # Notifications log table
    c.execute('''
        CREATE TABLE IF NOT EXISTS notification_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            torrent_name TEXT,
            show_name TEXT
        )
    ''')

    # Create index for faster searches
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_cached_shows_name
        ON cached_shows(show_name)
    ''')

    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn
