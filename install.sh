#!/usr/bin/env bash
# OpenWeb — Bash installer
# Secure installation:
#   curl -fsSL -o install.sh https://raw.githubusercontent.com/QWKiks/openweb/main/install.sh
#   cat install.sh # inspect script integrity
#   bash install.sh

REPO="https://github.com/QWKiks/openweb.git"
DIR="$HOME/.openweb"

echo ""
echo "  OpenWeb — Install"
echo ""

if [ -f "$DIR/package.json" ]; then
  echo "  ✓ Already installed at $DIR"
else
  echo "  Cloning from GitHub..."
  git clone "$REPO" "$DIR" || {
    echo "  ✗ Git clone failed. Install git or clone manually:"
    echo "    git clone $REPO \"$DIR\""
    exit 1
  }
fi

echo "  Installing dependencies..."
cd "$DIR" && npm install

echo ""
echo "  Registering MCP server with AI tools..."
cd "$DIR" && node setup-mcp.js --all || true

echo ""
echo "  ─────────────────────────────────────────────"
echo "  Next steps:"
echo "    1. Open chrome://extensions"
echo "    2. Enable Developer mode (top right)"
echo "    3. Click 'Load unpacked' → select:"
echo "       $DIR"
echo "    4. Click the OpenWeb icon → Connect"
echo "    5. Start the daemon:  node $DIR/daemon.js"
echo ""
echo "  Done! Restart your AI tool to pick up MCP."
echo ""
