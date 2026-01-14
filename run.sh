#!/bin/bash

# Get the directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || exit

# Semantic version comparison functions
version_gt() { 
    # Remove 'v' prefix if present
    local v1=${1#v}
    local v2=${2#v}
    test "$(printf '%s\n' "$v1" "$v2" | sort -V | head -n1)" != "$v1" 
}

version_le() { 
    local v1=${1#v}
    local v2=${2#v}
    test "$(printf '%s\n' "$v1" "$v2" | sort -V | head -n1)" == "$v1" 
}

# Check for automatic updates
check_for_updates() {
    # Skip if --no-update flag is passed or environment variable is set
    if [[ " $* " =~ " --no-update " ]] || [ "$PYGET_NO_UPDATE" = "1" ]; then
        return 0
    fi

    echo "Checking for updates..."

    # Get latest release from GitHub API (fallback to tags if no releases)
    local latest_release
    local latest_tag="null"
    
    # First try releases endpoint
    latest_release=$(curl -sL "https://api.github.com/repos/thnikk/pyget-web/releases/latest" 2>/dev/null)
    
    # If no releases found, check tags instead
    if [ "$latest_release" = "" ] || echo "$latest_release" | grep -q '"message":"Not Found"'; then
        echo "No releases found, checking tags..."
        latest_release=$(curl -sL "https://api.github.com/repos/thnikk/pyget-web/tags" 2>/dev/null)
        latest_tag=$(echo "$latest_release" | jq -r ".[0].name" 2>/dev/null)
    fi

    # Parse tag_name with fallback methods
    if command -v jq >/dev/null 2>&1; then
        # Use latest_tag if already set from tags, otherwise try releases
        if [ "$latest_tag" = "null" ] || [ "$latest_tag" = "" ]; then
            latest_tag=$(echo "$latest_release" | jq -r ".tag_name" 2>/dev/null)
        fi
    else
        # Fallback to sed/grep if jq not available
        if [ "$latest_tag" = "" ]; then
            latest_tag=$(echo "$latest_release" | grep -o '"tag_name": *"[^"]*"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' 2>/dev/null)
        fi
    fi

    # Get current local tag
    local current_tag
    current_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")

    # Compare versions using semver-aware comparison
    if [ "$latest_tag" != "null" ] && [ "$latest_tag" != "" ] && version_gt "$latest_tag" "$current_tag"; then
        echo "New release available: $latest_tag (current: $current_tag)"
        echo "Updating automatically..."

        # Update the repository - ensure we have all tags and can checkout the specific tag
        git fetch origin --tags >/dev/null 2>&1
        
        # Check if the tag exists locally or fetch it
        if ! git rev-parse --verify "refs/tags/$latest_tag" >/dev/null 2>&1; then
            echo "Tag $latest_tag not found locally, fetching..."
            git fetch origin tag "$latest_tag" >/dev/null 2>&1
        fi
        
        if git checkout "$latest_tag" >/dev/null 2>&1; then
            echo "Updated to tagged release $latest_tag!"
            echo "Restarting with updated version..."
            exec "$0" "$@"  # Restart with new version
        else
            echo "Failed to checkout tag $latest_tag, attempting pull..."
            if git pull origin main >/dev/null 2>&1; then
                echo "Updated to latest main branch!"
                echo "Restarting with updated version..."
                exec "$0" "$@"  # Restart with new version
            else
                echo "Failed to update, continuing with current version..."
            fi
        fi
    else
        echo "Running latest version: $current_tag"
    fi
}

# Handle service installation/uninstallation
install_service() {
    local SERVICE_FILE="pyget-web.service"
    local TARGET_PATH="$HOME/.config/systemd/user/$SERVICE_FILE"

    echo "Installing Pyget Web as a systemd user service..."
    mkdir -p "$HOME/.config/systemd/user"

    # Replace TARGET_DIR placeholder with actual script directory
    sed "s|TARGET_DIR|$SCRIPT_DIR|g" "$SERVICE_FILE" > "$TARGET_PATH"

    systemctl --user daemon-reload
    systemctl --user enable "$SERVICE_FILE"
    systemctl --user restart "$SERVICE_FILE"

    echo "Service installed and started!"
    echo "Check status with: systemctl --user status $SERVICE_FILE"
}

uninstall_service() {
    local SERVICE_FILE="pyget-web.service"
    echo "Uninstalling Pyget Web service..."
    systemctl --user stop "$SERVICE_FILE"
    systemctl --user disable "$SERVICE_FILE"
    rm -f "$HOME/.config/systemd/user/$SERVICE_FILE"
    systemctl --user daemon-reload
    echo "Service uninstalled."
}

# Check for service flags in any position
for arg in "$@"; do
    case "$arg" in
        --install)
            install_service
            exit 0
            ;;
        --uninstall)
            uninstall_service
            exit 0
            ;;
        --no-update)
            export PYGET_NO_UPDATE=1
            ;;
    esac
done

VENV_DIR=".venv"

# Check if venv exists and is functional
if [ -d "$VENV_DIR" ]; then
    # Try to run pip to see if the venv is broken (e.g. after a python update)
    if ! "$VENV_DIR/bin/pip" --version > /dev/null 2>&1; then
        echo "Virtual environment appears to be broken (possibly due to a Python update). Re-initializing..."
        rm -rf "$VENV_DIR"
    fi
fi

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment in $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
    if [ $? -ne 0 ]; then
        echo "Failed to create virtual environment. Please ensure python3-venv is installed."
        exit 1
    fi

    echo "Installing requirements..."
    "$VENV_DIR/bin/pip" install --upgrade pip
    "$VENV_DIR/bin/pip" install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "Failed to install requirements."
        exit 1
    fi
    echo "Setup complete!"
else
    # Always check requirements in case they changed (e.g. after a git pull)
    echo "Checking dependencies..."
    "$VENV_DIR/bin/pip" install -r requirements.txt > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "Dependency check failed. Attempting to fix by re-installing..."
        "$VENV_DIR/bin/pip" install -r requirements.txt
    fi
fi

# Check for updates before starting the application
check_for_updates "$@"

# Run the application
echo "Starting Pyget Web..."
"$VENV_DIR/bin/python3" app.py "$@"
