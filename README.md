# 🍊 sbc-fetch

A zero-dependency, 60 FPS real-time 3D animated system fetch and interactive MOTD / terminal welcome screen built for **Linux** Single Board Computers (Orange Pi, Raspberry Pi, Radxa, Banana Pi, Jetson) and Linux distributions (Debian, Ubuntu, Arch, Fedora, Armbian).

**Requirements:** Linux OS with Node.js v18+ and Fastfetch  
Powered by **Node.js** and **Fastfetch** with synchronized terminal rendering (`\x1b[?2026h`), dirty-row diffing, and automatic hardware/OS detection.

---

## ✨ Features

* **Automatic SBC & OS Detection:** Reads `/proc/device-tree/model` and `/etc/os-release`. Prioritizes SBC logos & themes (Orange Pi, Raspberry Pi, Radxa, Jetson, Banana Pi) over generic OS themes (Debian, Ubuntu, Arch, Fedora, Armbian).
* **60 FPS Synchronized 3D Engine:** Uses backpressure-aware pacing and dirty-row diffing so animations run smoothly even over Wi-Fi SSH sessions.
* **Multiple Render Styles (`--look`):**
  * `blocks` — High-definition Unicode half-blocks (`▀`, `▄`, `█`) with pinhole anti-aliasing
  * `ascii` — Classic shaded ASCII (`.,-~:;=!*#$@`)
  * `binary` — Matrix-style `0` and `1` streams
  * `braille` — Ultra-fine Braille dot matrix (`⣿`)
* **Multiple 3D Motions (`--anim`):**
  * `rotate` — Continuous 360° Y-axis spin with subtle tilt
  * `pendulum` — Readable ±38° 3D sweep
  * `bounce` — Floating vertical bob with gentle rotation
  * `pulse` — Rhythmic 3D zoom/breathing scale
  * `tumble` — Multi-axis 3D rotation
* **Customizable Borders (`--border`):** `rounded` (`╭─╮`), `sharp` (`┌─┐`), `double` (`╔═╗`), `heavy` (`┏━┓`), `ascii` (`+-+`), or `none`.
* **Flexible Trigger Modes (`--trigger`):**
  * `every` — Run on every new interactive terminal tab / SSH session
  * `daily` — Run once per day (cached via `~/.cache/sbc-fetch-daily`)
  * `login` — Run on login shells only (`shopt -q login_shell`)
  * `manual` — Only run when you type `sbc-fetch`
* **Custom Post-Exit Greeting:** Prints a personalized welcome message (e.g., `Welcome back, $USER!`) and optional system tip after pressing any key to exit.

---

## 🚀 Quick Install

**Linux (one-liner):**
```bash
sudo bash -c 'git clone https://github.com/wereallmadhereblip/sbc-fetch /tmp/sbc-fetch && cd /tmp/sbc-fetch && chmod +x install.sh && ./install.sh'
```

**Or manually:**
```bash
git clone https://github.com/wereallmadhereblip/sbc-fetch
cd sbc-fetch
chmod +x install.sh
sudo ./install.sh
```

*(Note: Running with `sudo` installs `sbc-fetch` globally to `/usr/local/bin/sbc-fetch`, installs `fastfetch` and `nodejs` via your package manager if missing, and configures `/etc/profile.d/sbc-fetch.sh` so SSH logins trigger your welcome screen automatically.)*

---

## ⚙️ Interactive Settings Menu & CLI Flags

Open the interactive terminal settings menu anytime to change your logo, theme, animation style, border, trigger frequency, or greeting:

```bash
sbc-fetch config
```

### Direct CLI Overrides
You can also preview or save settings directly from the command line:

```bash
# Run with current saved settings
sbc-fetch

# Preview specific options without saving
sbc-fetch --logo orangepi --theme orangepi --anim rotate --look blocks

# Save new defaults permanently
sbc-fetch --set-logo debian --set-theme red --set-anim bounce --set-look binary
sbc-fetch --set-trigger daily --set-greeting "Welcome back, \$USER!"
```

| Option | Available Values |
| :--- | :--- |
| **Logos** | `auto`, `orangepi`, `raspberrypi`, `debian`, `ubuntu`, `arch`, `fedora`, `tux` |
| **Themes** | `auto`, `orangepi`, `raspberrypi`, `red`, `debian`, `ubuntu`, `arch`, `matrix`, `cyberpunk`, `nord` |
| **Animations** | `rotate`, `pendulum`, `bounce`, `pulse`, `tumble`, `static` |
| **Looks** | `blocks`, `ascii`, `binary`, `braille` |
| **Borders** | `rounded`, `sharp`, `double`, `heavy`, `ascii`, `none` |
| **Triggers** | `every` (new tab), `daily` (once a day), `login` (login shells only), `manual` |
| **Duration** | `0` (continuous until keypress), or `1`–`60` seconds auto-exit |

---

## 🔄 Update to Latest Version

Check for updates and automatically pull the latest changes:

```bash
sbc-fetch --update
# or
sbc-fetch --upgrade
```

This command:
1. Checks if your installation is a git repository
2. Fetches latest changes from the remote repository
3. Pulls and applies updates if a newer version is available
4. Reports the current and latest commit hashes

**Example:**
```
📦 Checking for updates...
⬇️  Updating from abc1234 to def5678...
✅ Update complete! sbc-fetch has been updated to the latest version.
💡 Run "sbc-fetch" to see the latest features!
```

---

## 🎯 System MOTD (Message of the Day) Management

**sbc-fetch** automatically detects and suppresses system MOTD (Message of the Day) during animation for a clean, distraction-free full-screen display. After you exit the animation, your system MOTD is automatically restored.

Check your current MOTD configuration:

```bash
sbc-fetch --motd-info
```

**Example:**
```
🎯 MOTD Configuration Status:
  /etc/motd:       ✗ Not found
  /etc/motd.d:     ✓ Directory exists
  PAM MOTD:        ✓ Enabled
  Systemd MOTD:    ✗ Not available

ℹ️  sbc-fetch automatically suppresses MOTD during animation for clean display.
```

---

