import os

# Data directory configuration
DATA_DIR = os.path.expanduser('~/.local/share/pyget')
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, 'art'), exist_ok=True)

# Database initialization
DB_PATH = os.path.join(DATA_DIR, 'anime_tracker.db')
