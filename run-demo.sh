#!/bin/bash

# This script helps with running the MCP elicitation demo
# Make sure to install dependencies first with: pnpm install

echo "Starting MCP elicitation demo..."

# Kill any existing processes on the relevant ports
echo "Checking for existing processes..."
lsof -i:3000 -i:4000 -t | xargs kill -9 2>/dev/null

# Clear any previous logs
rm -f server.log web.log

# Start the MCP server in the background
echo "Starting MCP server on port 4000..."
cd "$(dirname "$0")"
pnpm --filter mcp-server dev > server.log 2>&1 &
SERVER_PID=$!

# Start the web app in the background
echo "Starting web app on port 3000..."
pnpm --filter web dev > web.log 2>&1 &
WEB_PID=$!

# Function to clean up on exit
cleanup() {
  echo "Shutting down..."
  kill $SERVER_PID $WEB_PID 2>/dev/null
  exit 0
}

# Set up cleanup on script termination
trap cleanup INT TERM

echo "Demo is running!"
echo "MCP Server: http://localhost:4000"
echo "Web App:    http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"

# Show logs in real-time
tail -f server.log web.log

# Keep the script running
wait
