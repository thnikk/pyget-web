#!/usr/bin/env python3
"""
Anime RSS feed manager with Transmission integration.
Main entry point for the application.
"""
import threading
import argparse
import sys
from flask import Flask
from flask_cors import CORS
from lock_manager import acquire_lock, setup_signal_handlers
from database import init_db
from routes import api_bp
from services import (
    check_and_download_torrents,
    update_cached_shows,
    update_cached_shows_once,
    monitor_downloads_for_replacement
)


def create_app():
    app = Flask(__name__, static_folder='static', static_url_path='')
    CORS(app)

    # Register blueprint
    app.register_blueprint(api_bp)

    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Pyget Web')
    parser.add_argument('--host', type=str,
                        default='0.0.0.0', help='Host to listen on')
    parser.add_argument('--port', type=int, default=5123,
                        help='Port to listen on')
    args, _ = parser.parse_known_args()

    # Acquire lock to prevent multiple instances
    if not acquire_lock():
        sys.exit(1)

    # Setup signal handlers for graceful shutdown
    setup_signal_handlers()

    # Initialize database
    init_db()

    app = create_app()

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

    # Start replacement monitor thread
    replacement_thread = threading.Thread(
        target=monitor_downloads_for_replacement,
        daemon=True
    )
    replacement_thread.start()

    # Detect if running from PyInstaller build
    is_pyinstaller = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')

    # Disable debug mode in PyInstaller builds to prevent reloader subprocess issues
    debug_mode = not is_pyinstaller

    app.run(debug=debug_mode, host=args.host, port=args.port)
