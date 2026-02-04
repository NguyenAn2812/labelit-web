#!/bin/bash
# Labelit FastAPI Server Startup Script

# Create virtual environment if missing, then activate it
if [ ! -d ".venv" ]; then
    echo "[INFO] Creating virtual environment in .venv"
    python3 -m venv .venv
fi

source .venv/bin/activate
echo "[INFO] Virtual environment activated"

# Check if dependencies are installed
.venv/bin/python -c "import fastapi" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing dependencies..."
    .venv/bin/pip install -q -r requirements.txt
    echo "[INFO] Dependencies installed"
fi

# Start the FastAPI server
echo "[INFO] Starting Labelit FastAPI server on http://127.0.0.1:5000"
echo "[INFO] API Documentation: http://127.0.0.1:5000/docs"
echo ""
.venv/bin/python app.py
