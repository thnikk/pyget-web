#!/bin/bash

# Get the directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

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

# Run the application
echo "Starting Pyget Web..."
"$VENV_DIR/bin/python3" app.py "$@"
