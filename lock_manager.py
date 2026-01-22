import os
import sys
import signal
import atexit
import fcntl
from config import DATA_DIR

LOCK_FILE = os.path.join(DATA_DIR, 'pyget-web.pid')
_lock_file_handle = None


def is_flask_reloader_process():
    """Check if we're running in Flask's reloader subprocess."""
    return os.environ.get('WERKZEUG_RUN_MAIN') != 'true'


def is_process_running(pid):
    """Check if a process with the given PID is still running."""
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def read_pid_from_lock():
    """Read the PID from the lock file."""
    try:
        with open(LOCK_FILE, 'r') as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError, IOError):
        return None


def acquire_lock():
    """Acquire the application lock. Returns True if successful, False otherwise."""
    global _lock_file_handle

    # Skip lock acquisition in Flask's reloader subprocess
    if is_flask_reloader_process():
        print("Skipping lock acquisition (Flask reloader subprocess)")
        return True

    existing_pid = read_pid_from_lock()

    if existing_pid is not None:
        if is_process_running(existing_pid):
            print(f"Another instance is already running with PID {existing_pid}")
            print("Exiting to prevent database conflicts.")
            return False
        else:
            print(f"Found stale lock file (PID {existing_pid} not running). Cleaning up...")
            try:
                os.remove(LOCK_FILE)
            except OSError as e:
                print(f"Warning: Could not remove stale lock file: {e}")

    try:
        _lock_file_handle = open(LOCK_FILE, 'w')

        # Try to get exclusive lock (non-blocking)
        try:
            fcntl.flock(_lock_file_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (IOError, BlockingIOError):
            print("Could not acquire lock file. Another instance may be starting.")
            _lock_file_handle.close()
            _lock_file_handle = None
            return False

        # Write our PID
        _lock_file_handle.write(str(os.getpid()))
        _lock_file_handle.flush()

        print(f"Acquired lock file: {LOCK_FILE}")
        return True

    except IOError as e:
        print(f"Error creating lock file: {e}")
        return False


def release_lock():
    """Release the application lock."""
    global _lock_file_handle

    # Skip lock release in Flask's reloader subprocess
    if is_flask_reloader_process():
        return

    try:
        if _lock_file_handle is not None:
            fcntl.flock(_lock_file_handle.fileno(), fcntl.LOCK_UN)
            _lock_file_handle.close()
            _lock_file_handle = None

        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)
            print(f"Released lock file: {LOCK_FILE}")
    except Exception as e:
        print(f"Error releasing lock: {e}")


def setup_signal_handlers():
    """Setup signal handlers for graceful shutdown."""
    # Only set up handlers in the main process
    if is_flask_reloader_process():
        return

    def signal_handler(signum, frame):
        print(f"\nReceived signal {signum}, shutting down gracefully...")
        release_lock()
        sys.exit(0)

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)


atexit.register(release_lock)
