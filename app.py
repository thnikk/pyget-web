#!/usr/bin/env python3
"""
Anime RSS feed manager with Transmission integration.
Main entry point for the application.
"""
import threading
from flask import Flask
from flask_cors import CORS
from database import init_db
from routes import api_bp
from services import (
    check_and_download_torrents,
    update_cached_shows,
    update_cached_shows_once
)

def create_app():
    app = Flask(__name__, static_folder='static', static_url_path='')
    CORS(app)
    
    # Register blueprint
    app.register_blueprint(api_bp)
    
    return app

if __name__ == '__main__':
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

    app.run(debug=True, host='0.0.0.0', port=5000)