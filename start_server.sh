#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Lagoon Test Server (Shared Env)..."
~/.local/envs/lagoon/bin/python3 app.py
