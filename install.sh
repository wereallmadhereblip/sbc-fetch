#!/usr/bin/env bash
set -e

echo "🍊 Installing sbc-fetch..."

# 1. Install dependencies (fastfetch, nodejs, ncurses)
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq nodejs fastfetch ncurses-bin
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nodejs fastfetch ncurses
elif command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm nodejs fastfetch ncurses
else
  echo "⚠️  Unsupported package manager. Please ensure 'node' (v18+) and 'fastfetch' are installed."
fi

# 2. Locate sbc-fetch.mjs (supports either ./sbc-fetch.mjs or ./bin/sbc-fetch.mjs)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/sbc-fetch.mjs" ]; then
  SRC_MJS="$SCRIPT_DIR/sbc-fetch.mjs"
elif [ -f "$SCRIPT_DIR/bin/sbc-fetch.mjs" ]; then
  SRC_MJS="$SCRIPT_DIR/bin/sbc-fetch.mjs"
else
  echo "❌ Could not find sbc-fetch.mjs next to install.sh or inside bin/."
  exit 1
fi

install -m 0755 "$SRC_MJS" /usr/local/bin/sbc-fetch

# 3. Backup and clear static /etc/motd so welcome screen stays clean
if [ -f /etc/motd ] && [ ! -f /etc/motd.sbc-fetch.bak ]; then
  mv /etc/motd /etc/motd.sbc-fetch.bak
  touch /etc/motd
fi

# 4. Install global login/interactive shell hook in /etc/profile.d/sbc-fetch.sh
cat << 'HOOK' > /etc/profile.d/sbc-fetch.sh
# sbc-fetch interactive welcome screen
if [ -t 1 ] && [ -z "$SBC_FETCH_RAN" ] && command -v sbc-fetch >/dev/null 2>&1; then
  export SBC_FETCH_RAN=1
  sbc-fetch --auto-hook
fi
HOOK
chmod 0644 /etc/profile.d/sbc-fetch.sh

# 5. Ensure non-login interactive bash shells (.bashrc) also check the hook for "every new tab" mode
BASHRC_TARGET="${SUDO_USER:+/home/$SUDO_USER/.bashrc}"
[ -z "$BASHRC_TARGET" ] && BASHRC_TARGET="$HOME/.bashrc"

if [ -f "$BASHRC_TARGET" ] && ! grep -q "sbc-fetch --auto-hook" "$BASHRC_TARGET"; then
  cat << 'RC' >> "$BASHRC_TARGET"

# sbc-fetch new tab / interactive shell hook
if [ -t 1 ] && [ -z "$SBC_FETCH_RAN" ] && command -v sbc-fetch >/dev/null 2>&1; then
  export SBC_FETCH_RAN=1
  sbc-fetch --auto-hook
fi
RC
fi

echo "✅ Installation complete!"
echo "👉 Run 'sbc-fetch' to launch now, or 'sbc-fetch config' to customize settings."
