import sqlite3
from datetime import datetime
from config import DB_PATH

def get_notification_settings():
    """Get notification settings from database."""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        c.execute('SELECT value FROM settings WHERE key = ?', ('notifications_enabled',))
        enabled_row = c.fetchone()
        enabled = enabled_row[0] == '1' if enabled_row else False
        
        conn.close()
        return enabled
    except Exception as e:
        print(f"Error getting notification settings: {e}")
        return False

def log_notification(message, notification_type='info', torrent_name=None, show_name=None):
    """Store notification in database log."""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO notification_log (message, type, torrent_name, show_name)
            VALUES (?, ?, ?, ?)
        ''', (message, notification_type, torrent_name, show_name))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging notification: {e}")

def send_torrent_notification(torrent_name, show_name, episode_info=None):
    """
    Send notification when a new torrent is added to Transmission.
    
    Args:
        torrent_name: Name of the torrent
        show_name: Name of the show
        episode_info: Dictionary containing episode metadata (optional)
    """
    enabled = get_notification_settings()
    
    try:
        # Create notification message
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        if episode_info and episode_info.get('episode'):
            episode_num = episode_info['episode']
            version = episode_info.get('version', 1)
            subgroup = episode_info.get('subgroup', '')
            
            if version > 1:
                message = f"{show_name} - Episode {episode_num} (v{version})"
                if subgroup:
                    message += f" by {subgroup}"
                notification_type = 'replacement'
            else:
                message = f"{show_name} - Episode {episode_num}"
                if subgroup:
                    message += f" by {subgroup}"
                notification_type = 'new'
        else:
            message = f"{show_name}"
            notification_type = 'new'
        
        # Log to database
        log_notification(message, notification_type, torrent_name, show_name)
        
        # Print to console if enabled
        if enabled:
            icon = "🔄" if notification_type == 'replacement' else "✅"
            console_message = f"{icon} {message}"
            if torrent_name:
                console_message += f"\n   📁 {torrent_name}"
            print(f"[{timestamp}] {console_message}")
        
        return True, "Test notification sent to console"
            
    except Exception as e:
        return False, f"Error sending torrent notification: {e}"

def send_test_notification():
    """
    Send a test notification to verify notification system is working.
    
    Returns:
        tuple: (success: bool, message: str)
    """
    enabled = get_notification_settings()
    
    try:
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        message = "Test notification - system is working!"
        
        # Log to database
        log_notification(message, 'test')
        
        # Print to console if enabled
        if enabled:
            print(f"[{timestamp}] 🔔 {message}")
            return True, "Test notification sent to console"
        else:
            return True, "Test notification logged (notifications disabled in settings)"
            
    except Exception as e:
        return False, f"Error sending test notification: {e}"