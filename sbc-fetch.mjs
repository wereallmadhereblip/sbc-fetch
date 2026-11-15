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
  showTip: true,
  fps: 30,              // frames per second (30-120) - Zero 4 default is 30
  detail: 'medium',     // low, medium, high - Zero 4 default is medium
  animSpeed: 1.0        // animation speed multiplier (0.5-2.0)
};

const OPTIONS = {
  logo: ['auto', 'orangepi', 'raspberrypi', 'radxa', 'jetson', 'bananapi', 'debian', 'ubuntu', 'arch', 'fedora', 'tux'],
  theme: ['auto', 'orangepi', 'raspberrypi', 'radxa', 'jetson', 'bananapi', 'debian', 'ubuntu', 'arch', 'fedora', 'red', 'matrix', 'cyberpunk', 'nord', 'dracula'],
  anim: ['rotate', 'pendulum', 'bounce', 'pulse', 'tumble', 'wave', 'static'],
  look: ['blocks', 'ascii', 'binary', 'braille'],
  border: ['rounded', 'sharp', 'double', 'heavy', 'ascii', 'none'],
  trigger: ['every', 'daily', 'login', 'manual'],
  detail: ['low', 'medium', 'high']
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

// MOTD (Message of the Day) Management
const MOTD_PATHS = ['/etc/motd', '/etc/motd.d'];
const MOTD_STATE = { original: null, disabled: false, files: [] };

function detectMotdStatus() {
  const status = {
    staticMotd: null,
    dynamicMotdDir: null,
    pamMotdEnabled: null,
    systemdMotd: null
  };

  try {
    if (existsSync('/etc/motd')) {
      status.staticMotd = readFileSync('/etc/motd', 'utf8');
    }
  } catch {}

  try {
    if (existsSync('/etc/motd.d')) {
      status.dynamicMotdDir = true;
    }
  } catch {}

  try {
    if (existsSync('/etc/pam.d/login') || existsSync('/etc/pam.d/sshd')) {
      const loginFile = existsSync('/etc/pam.d/login') ? readFileSync('/etc/pam.d/login', 'utf8') : '';
      const sshdFile = existsSync('/etc/pam.d/sshd') ? readFileSync('/etc/pam.d/sshd', 'utf8') : '';
      status.pamMotdEnabled = loginFile.includes('pam_motd') || sshdFile.includes('pam_motd');
    }
  } catch {}

  try {
    if (existsSync('/run/motd.dynamic')) {
      status.systemdMotd = true;
    }
  } catch {}

  return status;
}

function suppressMotd() {
  try {
    MOTD_STATE.original = detectMotdStatus();
    
    if (MOTD_STATE.original.staticMotd !== null) {
      MOTD_STATE.files.push({ path: '/etc/motd', exists: true });
      try {
        writeFileSync('/etc/motd', '');
        MOTD_STATE.disabled = true;
      } catch (e) {
        // Likely no permissions; that's okay
      }
    }
  } catch {}
}

function restoreMotd() {
  try {
    if (MOTD_STATE.disabled && MOTD_STATE.original?.staticMotd) {
      try {
        writeFileSync('/etc/motd', MOTD_STATE.original.staticMotd);
      } catch (e) {
        // Likely no permissions; that's okay
      }
    }
  } catch {}
}

// App Update Trigger
function getInstallDir() {
  try {
    // Get the global npm prefix (usually /usr/local or ~/.nvm/versions/node/vX.X.X)
    const npmPrefix = execSync('npm config get prefix', { stdio: 'pipe', encoding: 'utf8' }).trim();
    const globalPath = join(npmPrefix, 'lib', 'node_modules', 'sbc-fetch');
    
    // Check if sbc-fetch is actually installed there
    if (existsSync(globalPath) && existsSync(join(globalPath, 'package.json'))) {
      return globalPath;
    }
  } catch {}
  return null;
}

function updateApp() {
  const installDir = getInstallDir();
  
  if (!installDir) {
    console.log('❌ sbc-fetch was not installed via npm globally.');
    console.log('💡 Try: npm install -g https://github.com/wereallmadhereblip/sbc-fetch.git');
    return false;
  }

  try {
    // Read current version from package.json
    const packagePath = join(installDir, 'package.json');
    if (!existsSync(packagePath)) {
      console.log('❌ package.json not found at installation directory.');
      return false;
    }

    const currentPkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const currentVersion = currentPkg.version;

    // If .git exists, use git commit hashes for accurate version detection
    if (existsSync(join(installDir, '.git'))) {
      console.log('📦 Checking for updates...');
      const currentCommit = execSync('git rev-parse HEAD', { cwd: installDir, encoding: 'utf8' }).trim();
      const currentShort = currentCommit.slice(0, 7);
      
      execSync('git fetch origin', { cwd: installDir, stdio: 'pipe' });
      const remoteCommit = execSync('git rev-parse origin/main', { cwd: installDir, encoding: 'utf8' }).trim();
      const remoteShort = remoteCommit.slice(0, 7);

      if (currentCommit === remoteCommit) {
        console.log('✅ sbc-fetch is already up to date! (commit: ' + currentShort + ')');
        return true;
      }

      console.log(`⬇️  Updating from ${currentShort} to ${remoteShort}...`);
      execSync('git pull origin main', { cwd: installDir, stdio: 'pipe' });
      console.log('✅ Update complete! sbc-fetch has been updated to the latest version.');
      console.log('💡 Run "sbc-fetch" to see the latest features!');
      return true;
    }

    // If no .git, reinstall from GitHub to get latest
    console.log('📦 Fetching latest version...');
    execSync('npm install -g https://github.com/wereallmadhereblip/sbc-fetch.git', { stdio: 'inherit' });
    console.log('✅ Update complete! sbc-fetch has been updated to the latest version.');
    console.log('💡 Run "sbc-fetch" to see the latest features!');
    return true;
  } catch (error) {
    console.log('❌ Update failed: ' + error.message);
    console.log('💡 Try manual reinstall: npm install -g https://github.com/wereallmadhereblip/sbc-fetch.git');
    return false;
  }
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

// Detect if running on low-power device (Zero 4, Pi Zero, etc)
function isLowPowerDevice() {
  try {
    const cpuinfo = readFileSync('/proc/cpuinfo', 'utf8');
    // Count CPU cores and check model
    const coreCount = (cpuinfo.match(/processor\s*:/g) || []).length;
    const isZero = cpuinfo.includes('BCM2835') || cpuinfo.includes('H616') || cpuinfo.includes('H313');
    return coreCount <= 2 || isZero;
  } catch {
    return false;
  }
}

// Optimize config for low-power devices
function optimizeForHardware(cfg) {
  if (isLowPowerDevice()) {
    cfg.fps = Math.min(cfg.fps, 30);           // Cap at 30 FPS
    cfg.detail = cfg.detail === 'high' ? 'medium' : cfg.detail;  // No high detail
    cfg.animSpeed = Math.min(cfg.animSpeed, 1.0);  // No fast animation
  }
  return cfg;
}

// Build detailed 3D citrus geometry with proper lighting (optimized for low-power)
function buildCitrusGeometry(lowPower = false) {
  const rawPts = [];

  const yOffset = -0.22;
  const zDepth = 0.24;
  const zLayers = [-zDepth, 0, zDepth];

  function addExtrudedPoint(x, y, nxEdge, nyEdge, partId) {
    for (let k = 0; k < zLayers.length; k++) {
      const z = zLayers[k];
      const isCap = k !== 1;
      const nz = isCap ? (z > 0 ? 0.92 : -0.92) : 0.0;
      const nx = isCap ? nxEdge * 0.35 : nxEdge;
      const ny = isCap ? nyEdge * 0.35 : nyEdge;
      rawPts.push(x, y + yOffset, z, nx, ny, nz, partId);
    }
  }

  // Scalloped Outer Rind - reduce detail on low-power
  const rinStep = lowPower ? 0.075 : 0.038;
  const angleStep = lowPower ? 18 : 1;
  for (let i = 0; i < 260; i += angleStep) {
    const theta = (i / 260) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const rOuter = 1.44 + 0.065 * Math.cos(12 * theta);
    for (let r = 1.15; r <= rOuter; r += rinStep) {
      addExtrudedPoint(r * cosT, r * sinT, cosT, sinT, 0);
    }
  }

  // Center Hub
  const hubStep = lowPower ? 12 : 1;
  for (let i = 0; i < 72; i += hubStep) {
    const theta = (i / 72) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    for (let r = 0; r <= 0.14; r += 0.038) {
      addExtrudedPoint(r * cosT, r * sinT, cosT, sinT, 0);
    }
  }

  // 8 Radial Spokes
  for (let s = 0; s < 8; s++) {
    const spokeAngle = (s / 8) * Math.PI * 2 + Math.PI / 8;
    const cosA = Math.cos(spokeAngle);
    const sinA = Math.sin(spokeAngle);
    const px = -sinA;
    const py = cosA;
    const spokestep = lowPower ? 0.068 : 0.034;
    for (let r = 0.12; r <= 1.16; r += spokestep) {
      for (let w = -spokestep; w <= spokestep; w += spokestep) {
        addExtrudedPoint(r * cosA + w * px, r * sinA + w * py, px, py, 0);
      }
    }
  }

  // 8 Teardrop Seeds
  for (let s = 0; s < 8; s++) {
    const seedAngle = (s / 8) * Math.PI * 2;
    const cosA = Math.cos(seedAngle);
    const sinA = Math.sin(seedAngle);
    const px = -sinA;
    const py = cosA;
    const seedStep = lowPower ? 0.13 : 0.065;
    for (let u = 0; u <= 1; u += seedStep) {
      const r = 0.22 + u * 0.32;
      const halfWidth = Math.sin(Math.pow(u, 0.65) * Math.PI) * 0.088;
      for (let w = -halfWidth; w <= halfWidth; w += 0.044) {
        addExtrudedPoint(r * cosA + w * px, r * sinA + w * py, cosA, sinA, 0);
      }
    }
  }

  // Two Green Leaves on Top
  const leafStep = lowPower ? 0.06 : 0.03;
  for (let u = 0; u <= 1; u += leafStep) {
    const sx = -0.05 - u * 0.42;
    const sy = 1.54 + u * 0.46 + Math.sin(u * Math.PI) * 0.06;
    const halfW = Math.sin(Math.pow(u, 0.7) * Math.PI) * 0.14;
    for (let w = -halfW; w <= halfW; w += 0.048) {
      addExtrudedPoint(sx + w * 0.7, sy - w * 0.7, -0.5, 0.85, 1);
    }
  }
  for (let u = 0; u <= 1; u += leafStep * 0.85) {
    const sx = 0.04 + u * 0.96;
    const sy = 1.54 + Math.sin(u * Math.PI * 0.75) * 0.44 + u * 0.12;
    const halfW = Math.sin(Math.pow(u, 0.68) * Math.PI) * 0.24;
    for (let w = -halfW; w <= halfW; w += 0.048) {
      addExtrudedPoint(sx - w * 0.35, sy + w * 0.92, 0.3, 0.92, 1);
    }
  }

  return new Float32Array(rawPts);
}

// Generate High-Detail 3D Geometries for Each Logo (with low-power fallback)
function buildVoxels(type, lowPower = false) {
  const pts = [];
  const add = (x, y, z, c = 1) => pts.push([x, y, z, c]);
  
  // Reduce detail for low-power devices
  const step = lowPower ? 1.5 : 1.0;
  const skipEvery = lowPower ? 2 : 1;

  if (type === 'raspberrypi') {
    // Raspberry Pi: detailed body with GPIO header, cooling features
    for (let y = -6.5; y <= 5.5; y += 0.45) {
      const rad = 5.8 * Math.max(0, 1 - Math.abs(y + 0.8) / 8.5);
      const detail = Math.max(0.2, 1 - Math.abs(y) / 7);
      for (let a = 0; a < Math.PI * 2; a += 0.25) {
        add(Math.cos(a) * rad * (1 + Math.sin(a * 3) * 0.08), y, Math.sin(a) * rad * (1 + Math.cos(a * 3) * 0.08), 1);
      }
    }
    // GPIO header details
    for (let x = -1.2; x <= 1.2; x += 0.35) {
      for (let z = -1.8; z <= 1.8; z += 0.35) {
        add(x * 0.7, 6.0 + Math.sin(x * z) * 0.2, z, 2);
      }
    }
    // Heatsink ridges
    for (let a = 0; a < Math.PI * 2; a += 0.6) {
      for (let r = 4.5; r <= 5.8; r += 0.5) {
        add(Math.cos(a) * r, -6.0 + Math.sin(r * 2) * 0.3, Math.sin(a) * r, 2);
      }
    }
  } else if (type === 'radxa') {
    // Radxa Rock: angular design with emphasized edges
    for (let y = -7; y <= 7; y += 0.4) {
      const width = 6.5 * (1 - Math.abs(y) / 10);
      const depth = 5.0 * (1 - Math.abs(y) / 10);
      for (let x = -width; x <= width; x += 0.5) {
        for (let z = -depth; z <= depth; z += 0.5) {
          const isEdge = Math.abs(x) > width * 0.75 || Math.abs(z) > depth * 0.75;
          add(x + Math.sin(y * 0.3) * 0.15, y, z + Math.cos(y * 0.3) * 0.15, isEdge ? 2 : 1);
        }
      }
    }
    // LED indicators on edge
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      add(Math.cos(angle) * 6.8, Math.sin(i * 1.5) - 3, Math.sin(angle) * 5.2, 2);
    }
  } else if (type === 'jetson') {
    // Jetson: sleek curved design with GPU emphasis
    for (let y = -6.5; y <= 6.5; y += 0.35) {
      const t = y / 6.5;
      const rad = 5.2 + Math.sin(t * Math.PI) * 1.2;
      const warp = 1 + Math.sin(t * Math.PI * 2) * 0.15;
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        add(Math.cos(a) * rad * warp, y, Math.sin(a) * rad * Math.cos(t * Math.PI * 0.5), 1);
      }
    }
    // Thermal solution
    for (let x = -1.5; x <= 1.5; x += 0.3) {
      for (let z = -1.5; z <= 1.5; z += 0.3) {
        add(x, 7.0 + Math.abs(x + z) * 0.2, z, 2);
      }
    }
  } else if (type === 'bananapi') {
    // Banana Pi: curved, organic shape with accent features
    for (let t = -1.2; t <= 1.2; t += 0.06) {
      const cx = Math.sin(t * 1.3) * 7.0;
      const cy = Math.cos(t * 0.8) * 5.2 - 1.5;
      const thick = (1.2 - Math.abs(t)) * 2.2 + 0.4;
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        add(cx + Math.cos(a) * thick * (1 + Math.sin(a * 2.5) * 0.1), 
            cy + Math.sin(a) * thick * (0.6 + Math.cos(a * 2) * 0.1), 
            Math.sin(a) * thick * 0.8, 
            Math.abs(t) > 0.9 ? 2 : 1);
      }
    }
  } else if (type === 'debian' || type === 'ubuntu' || type === 'fedora' || type === 'arch') {
    // OS Logos: spiral/swirl design with detail levels
    const spiralTurns = type === 'debian' ? 4 : type === 'fedora' ? 3.5 : 3.2;
    const baseRadius = type === 'ubuntu' ? 5.5 : 5.0;
    const thickness = type === 'arch' ? 1.5 : 1.2;
    
    for (let t = 0; t < Math.PI * spiralTurns; t += 0.08) {
      const r = 0.8 + t * (baseRadius / (Math.PI * spiralTurns));
      const layers = type === 'fedora' ? 4 : 3;
      for (let layer = 0; layer < layers; layer++) {
        const dz = (layer - (layers - 1) / 2) * (thickness / (layers - 1));
        add(Math.cos(t) * r, Math.sin(t) * r, dz, t > Math.PI * spiralTurns * 0.6 ? 2 : 1);
      }
      // Detail rings
      if (Math.floor(t / (Math.PI / 2)) % 2 === 0) {
        for (let ring = 0.2; ring < r; ring += r * 0.3) {
          add(Math.cos(t) * ring, Math.sin(t) * ring, Math.sin(t * 3) * 0.4, 2);
        }
      }
    }
  } else {
    // Fallback: generic Tux-like penguin silhouette
    for (let y = -6; y <= 6; y += 0.5) {
      const bodyWidth = 5.0 * Math.max(0, 1 - Math.abs(y) / 8);
      const detail = 1 + Math.sin(y * 0.4) * 0.2;
      for (let x = -bodyWidth; x <= bodyWidth; x += 0.6) {
        for (let z = -2; z <= 2; z += 0.6) {
          const distFromEdge = Math.abs(Math.abs(x) - bodyWidth);
          if (distFromEdge < 1.5 || Math.abs(z) < bodyWidth * 0.4) {
            add(x, y, z, Math.abs(z) > 1.2 ? 2 : 1);
          }
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
    console.log(`  [A] Framerate (FPS)  : \x1b[1;32m${cfg.fps || 45}\x1b[0m`);
    console.log(`  [B] Detail Level     : \x1b[1;32m${cfg.detail || 'high'}\x1b[0m`);
    console.log(`  [C] Animation Speed  : \x1b[1;32m${cfg.animSpeed || 1.0}x\x1b[0m`);
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
    } else if (choice === 'a') {
      const ans = await ask('Enter FPS (30-120, default 45): ');
      const num = parseInt(ans, 10);
      if (!isNaN(num) && num >= 30 && num <= 120) cfg.fps = num;
    } else if (choice === 'b') {
      const v = await pickFromList('Detail Levels', OPTIONS.detail);
      if (v) cfg.detail = v;
    } else if (choice === 'c') {
      const ans = await ask('Enter animation speed multiplier (0.5-2.0, default 1.0): ');
      const num = parseFloat(ans);
      if (!isNaN(num) && num >= 0.5 && num <= 2.0) cfg.animSpeed = num;
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

// Color gradients for superior lighting
const ORANGE_GRADIENT = [229, 222, 221, 220, 215, 214, 209, 208, 202, 166, 160, 124];
const LEAF_GRADIENT = [155, 119, 83, 77, 41, 34];

// 60 FPS Synchronized 3D Renderer with Proper Lighting
async function runRenderer(cfg) {
  // Optimize for hardware automatically
  const lowPower = isLowPowerDevice();
  cfg = optimizeForHardware(cfg);
  
  const detected = detectPlatform();
  const activeLogo = cfg.logo === 'auto' ? detected : cfg.logo;
  const activeThemeName = cfg.theme === 'auto' ? detected : cfg.theme;
  const theme = THEMES[activeThemeName] || THEMES.orangepi;
  const box = BORDERS[cfg.border] || BORDERS.rounded;

  // Use superior citrus geometry for orange-themed displays
  let renderGeometry = null;
  let isCitrus = false;
  if (activeLogo === 'orangepi' || activeThemeName === 'orangepi') {
    renderGeometry = buildCitrusGeometry(lowPower);
    isCitrus = true;
  }

  const voxels = isCitrus ? null : buildVoxels(activeLogo, lowPower);
  const sysLines = getSystemInfo();

  // Detail level affects resolution and character set
  const detailLevelMap = {
    low: { resolution: 0.7, chars: '.,-~:;=!*#$@' },
    medium: { resolution: 0.85, chars: '░▒▓█' },
    high: { resolution: 1.0, chars: '░▒▓█▀▄' }
  };
  const detailLevel = detailLevelMap[cfg.detail] || detailLevelMap.high;

  // Maximize terminal usage: 3D logo gets 50% width, info gets 50%
  const W = Math.ceil(50 * detailLevel.resolution);  // Increased from 34 to 50
  const H = Math.ceil(24 * detailLevel.resolution);  // Increased from 18 to 24
  const subH = cfg.look === 'blocks' ? H * 2 : H;
  const infoWidth = 60;  // Increased from 48 to 60
  const totalWidth = W + infoWidth + 6;

  const ASCII_RAMP = '.,-~:;=!*#$@';
  const DETAIL_RAMP = detailLevel.chars;
  const BRAILLE_RAMP = ['⠂', '⠒', '⠖', '⠶', '⠷', '⠿', '⡿', '⣿'];
  const BLOCK_CHARS_HIGH = ['░', '▒', '▓', '█'];
  const BLOCK_CHARS_MED = ['░', '▓', '█'];
  const BLOCK_CHARS_LOW = ['░', '█'];

  let prevFrame = [];
  let frameCount = 0;
  const startTime = Date.now();
  let running = true;

  suppressMotd();

  const cleanup = () => {
    if (!running) return;
    running = false;
    restoreMotd();
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
    const speedMult = cfg.animSpeed || 1.0;
    
    if (cfg.anim === 'rotate') {
      rotY = elapsed * 1.8 * speedMult;
    } else if (cfg.anim === 'pendulum') {
      rotY = Math.sin(elapsed * 2.2 * speedMult) * 0.68;
    } else if (cfg.anim === 'bounce') {
      rotY = elapsed * 1.1 * speedMult;
      offsetY = Math.abs(Math.sin(elapsed * 4.0 * speedMult)) * -2.2 + 1.0;
    } else if (cfg.anim === 'pulse') {
      rotY = elapsed * 1.0 * speedMult;
      scale = 1.0 + Math.sin(elapsed * 3.5 * speedMult) * 0.16;
    } else if (cfg.anim === 'tumble') {
      rotY = elapsed * 1.5 * speedMult;
      rotX = elapsed * 1.1 * speedMult;
      rotZ = elapsed * 0.7 * speedMult;
    } else if (cfg.anim === 'wave') {
      rotY = Math.sin(elapsed * 1.8 * speedMult) * 0.45;
      rotX = Math.cos(elapsed * 2.4 * speedMult) * 0.35;
    }

    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

    const zBuf = new Float32Array(W * subH).fill(-999);
    const rawColor = new Int16Array(W * subH).fill(-1);

    if (isCitrus && renderGeometry) {
      // Superior citrus rendering with proper lighting
      const PTS = renderGeometry;
      const scale50 = 50.0;
      const halfW = W >> 1;
      const halfH = (subH >> 1) + 2;

      for (let i = 0; i < PTS.length; i += 7) {
        const px = PTS[i];
        const py = PTS[i + 1];
        const pz = PTS[i + 2];

        const x1 = px * cosY + pz * sinY;
        const z1 = -px * sinY + pz * cosY;
        const y2 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;

        const ooz = 1 / (4.9 + z2);
        const xp = (halfW + scale50 * ooz * x1) | 0;
        const yp = (halfH - scale50 * ooz * y2) | 0;

        if (xp >= 1 && xp < W - 1 && yp >= 1 && yp < subH - 1) {
          const idx = xp + yp * W;
          if (ooz > zBuf[idx]) {
            zBuf[idx] = ooz;
            const nx = PTS[i + 3];
            const ny = PTS[i + 4];
            const nz = PTS[i + 5];
            const nx1 = nx * cosY + nz * sinY;
            const nz1 = -nx * sinY + nz * cosY;
            const ny2 = ny * cosX - nz1 * sinX;
            const nz2 = ny * sinX + nz1 * cosX;

            const light = Math.max(0, Math.min(1, Math.abs(nz2) * 0.68 - nx1 * 0.32 + ny2 * 0.42 + 0.22));
            if (PTS[i + 6] === 1) {
              const leafIdx = Math.min(Math.max(0, ((1 - light) * 6) | 0), 5);
              rawColor[idx] = LEAF_GRADIENT[leafIdx];
            } else {
              const gradPos = (yp / (subH - 1)) * 0.65 + (1 - light) * 0.35;
              const idx12 = Math.min(Math.max(0, (gradPos * 12) | 0), 11);
              rawColor[idx] = ORANGE_GRADIENT[idx12];
            }
          }
        }
      }

      // Smooth color interpolation for better quality
      for (let y = 1; y < subH - 1; y++) {
        const rowOff = y * W;
        for (let x = 1; x < W - 1; x++) {
          const idx = rowOff + x;
          const c = rawColor[idx];
          const nUp = rawColor[idx - W];
          const nDn = rawColor[idx + W];
          const nLt = rawColor[idx - 1];
          const nRt = rawColor[idx + 1];

          if (c === -1) {
            let count = 0;
            let sample = -1;
            if (nUp !== -1) { count++; sample = nUp; }
            if (nDn !== -1) { count++; sample = nDn; }
            if (nLt !== -1) { count++; sample = nLt; }
            if (nRt !== -1) { count++; sample = nRt; }
            if (count >= 3) rawColor[idx] = sample;
          }
        }
      }
    } else {
      // Standard voxel rendering
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

      // Convert voxel colors to xterm colors
      for (let idx = 0; idx < W * subH; idx++) {
        if (cBuf[idx] > 0) {
          const light = Math.max(0, Math.min(0.99, (zBuf[idx] + 9) / 15));
          const gradIdx = Math.floor(light * (theme.gradient.length - 1));
          rawColor[idx] = theme.gradient[gradIdx];
        }
      }
    }

    const cBuf = new Uint8Array(W * subH);
    for (let idx = 0; idx < W * subH; idx++) {
      cBuf[idx] = rawColor[idx] >= 0 ? 1 : 0;
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
          const cTop = rawColor[topIdx];
          const cBot = rawColor[botIdx];
          const hasTop = cTop >= 0;
          const hasBot = cBot >= 0;

          if (!hasTop && !hasBot) {
            artRow += ' ';
          } else if (hasTop && hasBot) {
            artRow += `\x1b[38;5;${cTop};48;5;${cBot}m▀${rst}`;
          } else if (hasTop) {
            artRow += `\x1b[38;5;${cTop}m▀${rst}`;
          } else {
            artRow += `\x1b[38;5;${cBot}m▄${rst}`;
          }
        } else {
          const idx = row * W + col;
          if (rawColor[idx] < 0) {
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

  const frameDuration = 1000 / (cfg.fps || 45);
  setInterval(renderFrame, frameDuration);
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
    else if (a === '--fps' && next) { previewCfg.fps = Math.max(30, Math.min(120, parseInt(next, 10) || 45)); i++; }
    else if (a === '--detail' && next) { previewCfg.detail = next; i++; }
    else if (a === '--speed' && next) { previewCfg.animSpeed = Math.max(0.5, Math.min(2.0, parseFloat(next) || 1.0)); i++; }
    else if (a === '--set-logo' && next) { cfg.logo = next; previewCfg.logo = next; shouldSave = true; i++; }
    else if (a === '--set-theme' && next) { cfg.theme = next; previewCfg.theme = next; shouldSave = true; i++; }
    else if (a === '--set-anim' && next) { cfg.anim = next; previewCfg.anim = next; shouldSave = true; i++; }
    else if (a === '--set-look' && next) { cfg.look = next; previewCfg.look = next; shouldSave = true; i++; }
    else if (a === '--set-border' && next) { cfg.border = next; previewCfg.border = next; shouldSave = true; i++; }
    else if (a === '--set-trigger' && next) { cfg.trigger = next; previewCfg.trigger = next; shouldSave = true; i++; }
    else if (a === '--set-greeting' && next) { cfg.greeting = next; previewCfg.greeting = next; shouldSave = true; i++; }
    else if (a === '--set-duration' && next) { cfg.duration = parseInt(next, 10) || 0; previewCfg.duration = cfg.duration; shouldSave = true; i++; }
    else if (a === '--set-fps' && next) { cfg.fps = Math.max(30, Math.min(120, parseInt(next, 10) || 45)); previewCfg.fps = cfg.fps; shouldSave = true; i++; }
    else if (a === '--set-detail' && next) { cfg.detail = next; previewCfg.detail = next; shouldSave = true; i++; }
    else if (a === '--set-speed' && next) { cfg.animSpeed = Math.max(0.5, Math.min(2.0, parseFloat(next) || 1.0)); previewCfg.animSpeed = cfg.animSpeed; shouldSave = true; i++; }
    else if (a === '--set-showTip') { cfg.showTip = true; previewCfg.showTip = true; shouldSave = true; }
    else if (a === '--no-tip') { cfg.showTip = false; previewCfg.showTip = false; shouldSave = true; }
    else if (a === '--motd-info') {
      const status = detectMotdStatus();
      console.log('🎯 MOTD Configuration Status:');
      console.log(`  /etc/motd:       ${status.staticMotd !== null ? '✓ Exists' : '✗ Not found'}`);
      console.log(`  /etc/motd.d:     ${status.dynamicMotdDir ? '✓ Directory exists' : '✗ Not found'}`);
      console.log(`  PAM MOTD:        ${status.pamMotdEnabled ? '✓ Enabled' : '✗ Not configured'}`);
      console.log(`  Systemd MOTD:    ${status.systemdMotd ? '✓ Available' : '✗ Not available'}`);
      console.log('\nℹ️  sbc-fetch automatically suppresses MOTD during animation for clean display.');
      return;
    }
    else if (a === '--update' || a === '--upgrade') {
      updateApp();
      return;
    }
  }

  if (shouldSave) {
    saveConfig(cfg);
    console.log('✅ Configuration updated.');
    return;
  }

  await runRenderer(previewCfg);
}

main();
