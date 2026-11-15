#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';

const CONFIG_DIR = join(homedir(), '.config', 'sbc-fetch');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CACHE_DIR = join(homedir(), '.cache');
const DAILY_FILE = join(CACHE_DIR, 'sbc-fetch-daily');

const DEFAULT_CONFIG = {
  logo: 'auto',         // auto, orangepi, raspberrypi, radxa, jetson, bananapi, debian, ubuntu, arch, fedora, tux
  theme: 'auto',        // auto, orangepi, raspberrypi, radxa, jetson, bananapi, debian, ubuntu, arch, fedora, red, matrix, cyberpunk, nord, dracula
  anim: 'rotate',       // rotate, pendulum, bounce, pulse, tumble, wave, static
  look: 'blocks',       // blocks, ascii, binary, braille
  border: 'rounded',    // rounded, sharp, double, heavy, ascii, none
  trigger: 'every',     // every (new tab), daily (once a day), login (login shells only), manual
  duration: 0,          // 0 = run until keypress, or 1-60 seconds auto-exit
  greeting: 'Welcome back, $USER!',
  showTip: true
};

const OPTIONS = {
  logo: ['auto', 'orangepi', 'raspberrypi', 'radxa', 'jetson', 'bananapi', 'debian', 'ubuntu', 'arch', 'fedora', 'tux'],
  theme: ['auto', 'orangepi', 'raspberrypi', 'radxa', 'jetson', 'bananapi', 'debian', 'ubuntu', 'arch', 'fedora', 'red', 'matrix', 'cyberpunk', 'nord', 'dracula'],
  anim: ['rotate', 'pendulum', 'bounce', 'pulse', 'tumble', 'wave', 'static'],
  look: ['blocks', 'ascii', 'binary', 'braille'],
  border: ['rounded', 'sharp', 'double', 'heavy', 'ascii', 'none'],
  trigger: ['every', 'daily', 'login', 'manual']
};

// xterm-256 Color Gradients (matching fetch-anim.mjs aesthetic)
const THEMES = {
  orangepi:    { gradient: [229, 222, 221, 220, 215, 214, 209, 208, 202, 166, 160, 124], primary: [255, 125, 20] },
  raspberrypi: { gradient: [218, 217, 211, 205, 199, 169, 168, 162, 161, 125, 95, 89],   primary: [214, 38, 86] },
  radxa:       { gradient: [157, 156, 150, 144, 108, 107, 66, 65, 64, 59, 58, 23],       primary: [65, 185, 115] },
  jetson:      { gradient: [154, 148, 142, 136, 130, 100, 106, 149, 192, 226, 220, 227], primary: [118, 185, 0] },
  bananapi:    { gradient: [220, 214, 208, 202, 196, 190, 226, 227, 190, 184, 178, 142], primary: [245, 200, 35] },
  debian:      { gradient: [169, 168, 162, 161, 125, 95, 89, 88, 82, 125, 168, 204],     primary: [215, 10, 83] },
  ubuntu:      { gradient: [215, 209, 203, 202, 208, 166, 172, 178, 208, 214, 220, 226], primary: [233, 84, 32] },
  arch:        { gradient: [32, 33, 39, 45, 51, 81, 87, 123, 159, 195, 231, 159],        primary: [23, 147, 209] },
  fedora:      { gradient: [17, 18, 24, 25, 31, 32, 60, 61, 67, 103, 109, 145],          primary: [60, 110, 180] },
  red:         { gradient: [196, 208, 209, 210, 211, 203, 167, 173, 179, 210, 216, 222], primary: [235, 50, 50] },
  matrix:      { gradient: [28, 34, 40, 46, 47, 82, 83, 118, 119, 154, 155, 190],        primary: [0, 225, 65] },
  cyberpunk:   { gradient: [201, 200, 199, 198, 197, 196, 162, 168, 174, 213, 219, 225], primary: [255, 42, 165] },
  nord:        { gradient: [66, 67, 73, 109, 110, 145, 152, 188, 189, 195, 231, 232],    primary: [136, 192, 208] },
  dracula:     { gradient: [98, 97, 96, 95, 54, 53, 52, 139, 140, 139, 183, 183],        primary: [189, 147, 249] }
};

const BORDERS = {
  rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  sharp:   { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double:  { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  heavy:   { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  ascii:   { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
  none:    { tl: ' ', tr: ' ', bl: ' ', br: ' ', h: ' ', v: ' ' }
};

const TIPS = [
  'Run "sbc-fetch config" anytime to customize animations, themes, or triggers.',
  'Press any key during the animation to drop straight into your shell prompt.',
  'Use "sbc-fetch --look binary --theme matrix" for a live terminal preview.',
  'Check system temperatures and load at a glance before running heavy builds.'
];

function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
}

// Detect SBC first, fallback to Linux OS
function detectPlatform() {
  let model = '';
  try {
    if (existsSync('/proc/device-tree/model')) {
      model = readFileSync('/proc/device-tree/model', 'utf8').replace(/\0/g, '').toLowerCase();
    } else if (existsSync('/sys/firmware/devicetree/base/model')) {
      model = readFileSync('/sys/firmware/devicetree/base/model', 'utf8').replace(/\0/g, '').toLowerCase();
    }
  } catch {}

  if (model.includes('orange pi') || model.includes('orangepi')) return 'orangepi';
  if (model.includes('raspberry pi')) return 'raspberrypi';
  if (model.includes('radxa') || model.includes('rock pi')) return 'radxa';
  if (model.includes('jetson') || model.includes('nvidia')) return 'jetson';
  if (model.includes('banana pi') || model.includes('bananapi')) return 'bananapi';

  let osRelease = '';
  try {
    if (existsSync('/etc/os-release')) {
      osRelease = readFileSync('/etc/os-release', 'utf8').toLowerCase();
    }
  } catch {}

  if (osRelease.includes('ubuntu')) return 'ubuntu';
  if (osRelease.includes('debian') || osRelease.includes('armbian')) return 'debian';
  if (osRelease.includes('arch')) return 'arch';
  if (osRelease.includes('fedora')) return 'fedora';
  return 'tux';
}

// Generate 3D Voxel Point Clouds [x, y, z, colorSlot (1=primary, 2=secondary)]
function buildVoxels(type) {
  const pts = [];
  const add = (x, y, z, c = 1) => pts.push([x, y, z, c]);

  if (type === 'orangepi' || type === 'ubuntu') {
    for (let u = 0; u < Math.PI * 2; u += 0.16) {
      for (let v = 0; v < Math.PI * 2; v += 0.28) {
        const R = 6.2, r = 2.1;
        const x = (R + r * Math.cos(v)) * Math.cos(u);
        const y = (R + r * Math.cos(v)) * Math.sin(u) - 0.8;
        const z = r * Math.sin(v);
        add(x, y, z, 1);
      }
    }
    for (let lx = -2.2; lx <= 2.8; lx += 0.6) {
      for (let lz = -1.0; lz <= 1.0; lz += 0.6) {
        add(lx + 1.2, 8.2 + Math.sin(lx) * 0.8, lz, 2);
      }
    }
  } else if (type === 'bananapi') {
    for (let t = -1.1; t <= 1.1; t += 0.08) {
      const cx = Math.sin(t) * 6.5;
      const cy = Math.cos(t) * 5.0 - 2.0;
      const thick = (1.15 - Math.abs(t)) * 1.9 + 0.5;
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        add(cx + Math.cos(a) * thick, cy + Math.sin(a) * thick * 0.6, Math.sin(a) * thick, Math.abs(t) > 0.92 ? 2 : 1);
      }
    }
  } else if (type === 'raspberrypi') {
    for (let y = -6; y <= 5; y += 1.1) {
      const rad = 5.5 * Math.cos((y / 7.5) * (Math.PI / 2));
      for (let a = 0; a < Math.PI * 2; a += 0.35) {
        add(Math.cos(a) * rad, y - 0.8, Math.sin(a) * rad, 1);
      }
    }
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      for (let r = 1.2; r <= 4.5; r += 1.0) {
        add(Math.cos(a) * r, 6.2, Math.sin(a) * r * 0.7, 2);
      }
    }
  } else if (type === 'arch' || type === 'radxa') {
    for (let y = -7; y <= 7; y += 0.85) {
      const span = ((7 - y) / 14) * 7.5;
      for (let x = -span; x <= span; x += 0.9) {
        for (let z = -2.0; z <= 2.0; z += 0.9) {
          if (Math.abs(x) > span * 0.45 || y > 1.5) {
            add(x, y, z, y > 2 ? 2 : 1);
          }
        }
      }
    }
  } else if (type === 'debian') {
    for (let t = 0; t < Math.PI * 3.6; t += 0.12) {
      const r = 0.6 + t * 0.72;
      for (let dz = -1.4; dz <= 1.4; dz += 0.7) {
        add(Math.cos(t) * r, Math.sin(t) * r, dz, t > 7 ? 2 : 1);
      }
    }
  } else {
    for (let y = -7.5; y <= 7.5; y += 0.55) {
      const angle = y * 0.55;
      for (let r = 4.2; r <= 5.6; r += 0.7) {
        add(Math.cos(angle) * r, y, Math.sin(angle) * r, 1);
        add(Math.cos(angle + Math.PI) * r, y, Math.sin(angle + Math.PI) * r, 2);
      }
      if (Math.round(y * 2) % 2 === 0) {
        for (let b = -4; b <= 4; b += 1.0) {
          add(Math.cos(angle) * b, y, Math.sin(angle) * b, 2);
        }
      }
    }
  }
  return pts;
}

function getSystemInfo() {
  try {
    const raw = execSync('fastfetch --logo none --pipe true', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 16);
  } catch {
    const user = process.env.USER || userInfo().username || 'user';
    return [
      `${user}@localhost`,
      '-----------------',
      `Platform: ${detectPlatform().toUpperCase()}`,
      `Node: ${process.version}`,
      'Tip: Install fastfetch for full hardware telemetry'
    ];
  }
}

function rgb(c, bg = false) {
  return `\x1b[${bg ? 48 : 38};2;${c[0]};${c[1]};${c[2]}m`;
}

function shade(c, factor) {
  return [
    Math.max(15, Math.min(255, Math.round(c[0] * factor))),
    Math.max(15, Math.min(255, Math.round(c[1] * factor))),
    Math.max(15, Math.min(255, Math.round(c[2] * factor)))
  ];
}

// Interactive Terminal Config Menu
async function runConfigMenu(cfg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  while (true) {
    console.clear();
    const detected = detectPlatform();
    console.log('\x1b[1;36m╭────────────────────────────────────────────────────╮\x1b[0m');
    console.log('\x1b[1;36m│           🍊 sbc-fetch Configuration Menu          │\x1b[0m');
    console.log('\x1b[1;36m╰────────────────────────────────────────────────────╯\x1b[0m');
    console.log(`  Detected Hardware/OS : \x1b[1;33m${detected}\x1b[0m\n`);
    console.log(`  [1] Logo / Board     : \x1b[1;32m${cfg.logo}\x1b[0m`);
    console.log(`  [2] Color Theme      : \x1b[1;32m${cfg.theme}\x1b[0m`);
    console.log(`  [3] Animation Style  : \x1b[1;32m${cfg.anim}\x1b[0m`);
    console.log(`  [4] Render Look      : \x1b[1;32m${cfg.look}\x1b[0m`);
    console.log(`  [5] Border Style     : \x1b[1;32m${cfg.border}\x1b[0m`);
    console.log(`  [6] Startup Trigger  : \x1b[1;32m${cfg.trigger}\x1b[0m`);
    console.log(`  [7] Auto-Exit Timer  : \x1b[1;32m${cfg.duration === 0 ? 'Off (until keypress)' : cfg.duration + 's'}\x1b[0m`);
    console.log(`  [8] Exit Greeting    : \x1b[1;32m${cfg.greeting}\x1b[0m`);
    console.log(`  [9] Post-Exit Tip    : \x1b[1;32m${cfg.showTip ? 'Enabled' : 'Disabled'}\x1b[0m`);
    console.log('\n  [P] Preview Now      [S] Save & Exit      [Q] Quit Without Saving\n');

    const choice = (await ask('Select option: ')).trim().toLowerCase();

    const pickFromList = async (label, list) => {
      console.log(`\nAvailable ${label}:`);
      list.forEach((item, i) => console.log(`  ${i + 1}) ${item}`));
      const ans = await ask(`Choose number (1-${list.length}): `);
      const idx = parseInt(ans, 10) - 1;
      return list[idx] || null;
    };

    if (choice === '1') {
      const v = await pickFromList('Logos / Boards', OPTIONS.logo);
      if (v) cfg.logo = v;
    } else if (choice === '2') {
      const v = await pickFromList('Color Themes', OPTIONS.theme);
      if (v) cfg.theme = v;
    } else if (choice === '3') {
      const v = await pickFromList('Animations', OPTIONS.anim);
      if (v) cfg.anim = v;
    } else if (choice === '4') {
      const v = await pickFromList('Render Looks', OPTIONS.look);
      if (v) cfg.look = v;
    } else if (choice === '5') {
      const v = await pickFromList('Borders', OPTIONS.border);
      if (v) cfg.border = v;
    } else if (choice === '6') {
      const v = await pickFromList('Startup Triggers (every=new tab, daily=1/day, login=login shells)', OPTIONS.trigger);
      if (v) cfg.trigger = v;
    } else if (choice === '7') {
      const ans = await ask('Enter seconds before auto-exit (0 for manual keypress, 1-60): ');
      const num = parseInt(ans, 10);
      if (!isNaN(num) && num >= 0 && num <= 60) cfg.duration = num;
    } else if (choice === '8') {
      const ans = await ask('Enter custom greeting (use $USER for username): ');
      if (ans.trim()) cfg.greeting = ans.trim();
    } else if (choice === '9') {
      cfg.showTip = !cfg.showTip;
    } else if (choice === 'p') {
      rl.close();
      await runRenderer(cfg);
      return;
    } else if (choice === 's') {
      saveConfig(cfg);
      console.log('\x1b[1;32m✅ Settings saved!\x1b[0m');
      rl.close();
      return;
    } else if (choice === 'q') {
      rl.close();
      return;
    }
  }
}

// 60 FPS Synchronized 3D Renderer
async function runRenderer(cfg) {
  const detected = detectPlatform();
  const activeLogo = cfg.logo === 'auto' ? detected : cfg.logo;
  const activeThemeName = cfg.theme === 'auto' ? detected : cfg.theme;
  const theme = THEMES[activeThemeName] || THEMES.orangepi;
  const box = BORDERS[cfg.border] || BORDERS.rounded;

  const voxels = buildVoxels(activeLogo);
  const sysLines = getSystemInfo();

  const W = 34;
  const H = 18;
  const subH = cfg.look === 'blocks' ? H * 2 : H;
  const infoWidth = 48;
  const totalWidth = W + infoWidth + 5;

  const ASCII_RAMP = '.,-~:;=!*#$@';
  const BRAILLE_RAMP = ['⠂', '⠒', '⠖', '⠶', '⠷', '⠿', '⡿', '⣿'];

  let prevFrame = [];
  let frameCount = 0;
  const startTime = Date.now();
  let running = true;

  const cleanup = () => {
    if (!running) return;
    running = false;
    process.stdout.write('\x1b[?25h\x1b[0m\n');
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    const user = process.env.USER || userInfo().username || 'user';
    const msg = cfg.greeting.replace(/\$USER/g, user);
    const accentColor = theme.gradient[theme.gradient.length - 1];
    console.log(`\x1b[38;5;${accentColor}m\x1b[1m${msg}\x1b[0m`);
    if (cfg.showTip) {
      const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
      console.log(`\x1b[2m💡 ${tip}\x1b[0m`);
    }
    process.exit(0);
  };

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      if (key[0] === 3) process.exit(0);
      cleanup();
    });
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');

  const renderFrame = () => {
    if (!running) return;
    const elapsed = (Date.now() - startTime) / 1000;
    if (cfg.duration > 0 && elapsed >= cfg.duration) {
      cleanup();
      return;
    }

    let rotY = 0, rotX = 0.25, rotZ = 0, offsetY = 0, scale = 1.0;
    if (cfg.anim === 'rotate') {
      rotY = elapsed * 1.8;
    } else if (cfg.anim === 'pendulum') {
      rotY = Math.sin(elapsed * 2.2) * 0.68;
    } else if (cfg.anim === 'bounce') {
      rotY = elapsed * 1.1;
      offsetY = Math.abs(Math.sin(elapsed * 4.0)) * -2.2 + 1.0;
    } else if (cfg.anim === 'pulse') {
      rotY = elapsed * 1.0;
      scale = 1.0 + Math.sin(elapsed * 3.5) * 0.16;
    } else if (cfg.anim === 'tumble') {
      rotY = elapsed * 1.5;
      rotX = elapsed * 1.1;
      rotZ = elapsed * 0.7;
    } else if (cfg.anim === 'wave') {
      rotY = Math.sin(elapsed * 1.8) * 0.45;
      rotX = Math.cos(elapsed * 2.4) * 0.35;
    }

    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

    const zBuf = new Float32Array(W * subH).fill(-999);
    const cBuf = new Uint8Array(W * subH);

    for (let i = 0; i < voxels.length; i++) {
      let [x, y, z, slot] = voxels[i];
      x *= scale;
      y = (y + offsetY) * scale;
      z *= scale;

      let x1 = x * cosY - z * sinY;
      let z1 = x * sinY + z * cosY;
      let y2 = y * cosX - z1 * sinX;
      let z2 = y * sinX + z1 * cosX;
      let x3 = x1 * cosZ - y2 * sinZ;
      let y3 = x1 * sinZ + y2 * cosZ;

      const fov = 26;
      const depth = fov + z2;
      if (depth <= 2) continue;

      const projX = Math.round(W / 2 + (x3 * fov) / depth * 1.55);
      const aspectY = cfg.look === 'blocks' ? 1.65 : 0.82;
      const projY = Math.round(subH / 2 - (y3 * fov) / depth * aspectY);

      if (projX >= 0 && projX < W && projY >= 0 && projY < subH) {
        const idx = projY * W + projX;
        if (z2 > zBuf[idx]) {
          zBuf[idx] = z2;
          cBuf[idx] = slot;
        }
      }
    }

    const lines = [];
    const bCol = `\x1b[38;5;208m`;
    const rst = '\x1b[0m';

    lines.push(`${bCol}${box.tl}${box.h.repeat(W + 2)}${box.h.repeat(infoWidth + 2)}${box.tr}${rst}`);

    for (let row = 0; row < H; row++) {
      let artRow = '';
      for (let col = 0; col < W; col++) {
        if (cfg.look === 'blocks') {
          const topIdx = (row * 2) * W + col;
          const botIdx = (row * 2 + 1) * W + col;
          const hasTop = cBuf[topIdx] > 0;
          const hasBot = cBuf[botIdx] > 0;

          if (!hasTop && !hasBot) {
            artRow += ' ';
          } else if (hasTop && hasBot) {
            const topLight = Math.max(0, Math.min(0.99, (zBuf[topIdx] + 9) / 15));
            const botLight = Math.max(0, Math.min(0.99, (zBuf[botIdx] + 9) / 15));
            const topGradIdx = Math.floor(topLight * (theme.gradient.length - 1));
            const botGradIdx = Math.floor(botLight * (theme.gradient.length - 1));
            const topCol = theme.gradient[topGradIdx];
            const botCol = theme.gradient[botGradIdx];
            artRow += `\x1b[38;5;${topCol};48;5;${botCol}m▀${rst}`;
          } else if (hasTop) {
            const topLight = Math.max(0, Math.min(0.99, (zBuf[topIdx] + 9) / 15));
            const topGradIdx = Math.floor(topLight * (theme.gradient.length - 1));
            const topCol = theme.gradient[topGradIdx];
            artRow += `\x1b[38;5;${topCol}m▀${rst}`;
          } else {
            const botLight = Math.max(0, Math.min(0.99, (zBuf[botIdx] + 9) / 15));
            const botGradIdx = Math.floor(botLight * (theme.gradient.length - 1));
            const botCol = theme.gradient[botGradIdx];
            artRow += `\x1b[38;5;${botCol}m▄${rst}`;
          }
        } else {
          const idx = row * W + col;
          if (cBuf[idx] === 0) {
            artRow += ' ';
          } else {
            const normZ = Math.max(0, Math.min(0.99, (zBuf[idx] + 8) / 16));
            const gradIdx = Math.floor(normZ * (theme.gradient.length - 1));
            const colCode = theme.gradient[gradIdx];
            let ch = '#';
            if (cfg.look === 'ascii') {
              ch = ASCII_RAMP[Math.floor(normZ * ASCII_RAMP.length)];
            } else if (cfg.look === 'binary') {
              ch = ((row + col + Math.floor(frameCount / 4)) % 2 === 0) ? '1' : '0';
            } else if (cfg.look === 'braille') {
              ch = BRAILLE_RAMP[Math.floor(normZ * BRAILLE_RAMP.length)];
            }
            artRow += `\x1b[38;5;${colCode}m${ch}${rst}`;
          }
        }
      }

      const rawInfo = sysLines[row] || '';
      const cleanInfo = rawInfo.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = Math.max(0, infoWidth - cleanInfo.length);
      let styledInfo = rawInfo;
      const accentCode = theme.gradient[theme.gradient.length - 1];
      const primaryCode = theme.gradient[Math.floor(theme.gradient.length * 0.7)];
      if (row === 0) {
        styledInfo = `\x1b[38;5;${accentCode}m\x1b[1m${cleanInfo.slice(0, infoWidth)}${rst}${' '.repeat(pad)}`;
      } else if (cleanInfo.includes(':')) {
        const [k, ...rest] = cleanInfo.split(':');
        const val = rest.join(':');
        const trimmed = `${k}:${val}`.slice(0, infoWidth);
        const kPart = trimmed.split(':')[0];
        const vPart = trimmed.slice(kPart.length);
        styledInfo = `\x1b[38;5;${primaryCode}m\x1b[1m${kPart}${rst}${vPart}${' '.repeat(Math.max(0, infoWidth - trimmed.length))}`;
      } else {
        styledInfo = `${cleanInfo.slice(0, infoWidth)}${' '.repeat(pad)}`;
      }

      lines.push(`${bCol}${box.v}${rst} ${artRow} ${bCol}${box.v}${rst} ${styledInfo} ${bCol}${box.v}${rst}`);
    }

    const footerText = ` [${activeLogo.toUpperCase()} | ${cfg.anim} | ${cfg.look}] Press any key to continue `;
    const fPad = Math.max(0, totalWidth - 2 - footerText.length);
    const leftDash = Math.floor(fPad / 2);
    const rightDash = fPad - leftDash;
    lines.push(`${bCol}${box.bl}${box.h.repeat(leftDash)}\x1b[2m${footerText}${rst}${bCol}${box.h.repeat(rightDash)}${box.br}${rst}`);

    let out = '\x1b[?2026h';
    for (let r = 0; r < lines.length; r++) {
      if (prevFrame[r] !== lines[r]) {
        out += `\x1b[${r + 1};1H${lines[r]}`;
        prevFrame[r] = lines[r];
      }
    }
    out += '\x1b[?2026l';
    process.stdout.write(out);
    frameCount++;
  };

  setInterval(renderFrame, 1000 / 60);
  renderFrame();
}

// Main CLI Entrypoint
async function main() {
  const args = process.argv.slice(2);
  const cfg = loadConfig();

  if (args.includes('--auto-hook')) {
    if (cfg.trigger === 'manual') return;
    if (cfg.trigger === 'login') {
      const isLogin = process.argv[0]?.startsWith('-') || process.env.SHLVL === '1';
      if (!isLogin) return;
    }
    if (cfg.trigger === 'daily') {
      const today = new Date().toISOString().slice(0, 10);
      try {
        if (existsSync(DAILY_FILE) && readFileSync(DAILY_FILE, 'utf8').trim() === today) {
          return;
        }
        mkdirSync(CACHE_DIR, { recursive: true });
        writeFileSync(DAILY_FILE, today);
      } catch {}
    }
  }

  if (args.includes('config') || args.includes('--menu') || args.includes('-c')) {
    await runConfigMenu(cfg);
    return;
  }

  let shouldSave = false;
  const previewCfg = { ...cfg };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--logo' && next) { previewCfg.logo = next; i++; }
    else if (a === '--theme' && next) { previewCfg.theme = next; i++; }
    else if (a === '--anim' && next) { previewCfg.anim = next; i++; }
    else if (a === '--look' && next) { previewCfg.look = next; i++; }
    else if (a === '--border' && next) { previewCfg.border = next; i++; }
    else if (a === '--duration' && next) { previewCfg.duration = parseInt(next, 10) || 0; i++; }
    else if (a === '--set-logo' && next) { cfg.logo = next; previewCfg.logo = next; shouldSave = true; i++; }
    else if (a === '--set-theme' && next) { cfg.theme = next; previewCfg.theme = next; shouldSave = true; i++; }
    else if (a === '--set-anim' && next) { cfg.anim = next; previewCfg.anim = next; shouldSave = true; i++; }
    else if (a === '--set-look' && next) { cfg.look = next; previewCfg.look = next; shouldSave = true; i++; }
    else if (a === '--set-border' && next) { cfg.border = next; previewCfg.border = next; shouldSave = true; i++; }
    else if (a === '--set-trigger' && next) { cfg.trigger = next; previewCfg.trigger = next; shouldSave = true; i++; }
    else if (a === '--set-greeting' && next) { cfg.greeting = next; previewCfg.greeting = next; shouldSave = true; i++; }
    else if (a === '--set-duration' && next) { cfg.duration = parseInt(next, 10) || 0; previewCfg.duration = cfg.duration; shouldSave = true; i++; }
    else if (a === '--set-showTip') { cfg.showTip = true; previewCfg.showTip = true; shouldSave = true; }
    else if (a === '--no-tip') { cfg.showTip = false; previewCfg.showTip = false; shouldSave = true; }
  }

  if (shouldSave) {
    saveConfig(cfg);
    console.log('✅ Configuration updated.');
    return;
  }

  await runRenderer(previewCfg);
}

main();
