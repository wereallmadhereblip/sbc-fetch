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
  animSpeed: 1.0,       // animation speed multiplier (0.5-2.0)
  pageEnabled: false,   // true = replace logo + fastfetch with full-screen ASCII page
  pageStyle: '404-space',
  pageFastfetch: false  // true = automatically run fastfetch once page finishes loading
};

const OPTIONS = {
  logo: ['auto', 'orangepi', 'raspberrypi', 'radxa', 'jetson', 'bananapi', 'debian', 'ubuntu', 'arch', 'fedora', 'tux', 'torus'],
  theme: ['auto', 'orangepi', 'raspberrypi', 'radxa', 'jetson', 'bananapi', 'debian', 'ubuntu', 'arch', 'fedora', 'red', 'matrix', 'cyberpunk', 'nord', 'dracula', 'nocolor'],
  anim: ['rotate', 'pendulum', 'bounce', 'bounce+rotate', 'pulse', 'tumble', 'wave', 'static'],
  look: ['blocks', 'ascii', 'binary', 'braille', 'halftone', 'dots', 'original'],
  border: ['rounded', 'sharp', 'double', 'heavy', 'ascii', 'none'],
  trigger: ['every', 'daily', 'login', 'manual'],
  detail: ['low', 'medium', 'high'],
  page: ['404-space', 'christmas', 'progress-loader', 'text-scramble', 'matrix-rain']
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
  dracula:     { gradient: Array(12).fill(189), primary: 189 },
  nocolor:     { gradient: Array(12).fill(250), primary: 250 }
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
    const checkCachePath = join(CONFIG_DIR, '.last-update-check');

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
        mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(checkCachePath, remoteCommit);
        return true;
      }

      console.log(`⬇️  Updating from ${currentShort} to ${remoteShort}...`);
      execSync('git pull origin main', { cwd: installDir, stdio: 'pipe' });
      console.log('✅ Update complete! sbc-fetch has been updated to the latest version.');
      console.log('💡 Run "sbc-fetch" to see the latest features!');
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(checkCachePath, remoteCommit);
      return true;
    }

    // Check latest commit hash directly from GitHub via git ls-remote
    console.log('📦 Checking for updates...');
    const remoteLine = execSync('git ls-remote https://github.com/wereallmadhereblip/sbc-fetch.git HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const remoteCommit = remoteLine.split(/\s+/)[0];
    const remoteShort = remoteCommit.slice(0, 7);
    const cachedCommit = existsSync(checkCachePath) ? readFileSync(checkCachePath, 'utf8').trim() : '';

    if (cachedCommit === remoteCommit) {
      console.log(`✅ sbc-fetch is already up to date! (commit ${remoteShort})`);
      return true;
    }

    const fromLabel = cachedCommit ? `from commit ${cachedCommit.slice(0, 7)} ` : '';
    console.log(`⬇️  Updating ${fromLabel}to commit ${remoteShort}...`);
    execSync('npm install -g https://github.com/wereallmadhereblip/sbc-fetch.git', { stdio: 'inherit' });
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(checkCachePath, remoteCommit);
    console.log(`✅ Update complete! sbc-fetch is now at commit ${remoteShort}.`);
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

  if (type === 'torus') {
    // 3D Parametric Spinning Torus (Donut)
    const R = 4.5; // Major ring radius
    const r = 2.1; // Minor tube radius
    const thetaStep = lowPower ? 0.14 : 0.08;
    const phiStep = lowPower ? 0.22 : 0.13;
    for (let theta = 0; theta < Math.PI * 2; theta += thetaStep) {
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      for (let phi = 0; phi < Math.PI * 2; phi += phiStep) {
        const cosP = Math.cos(phi), sinP = Math.sin(phi);
        const ringDist = R + r * cosP;
        const x = ringDist * cosT;
        const y = r * sinP;
        const z = ringDist * sinT;
        add(x, y, z, Math.sin(phi) > 0.5 ? 2 : 1);
      }
    }
  } else if (type === 'raspberrypi') {
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
    console.log(`  [D] Pages            : \x1b[1;32m${cfg.pageEnabled ? 'ON (' + (cfg.pageStyle || '404-space') + (cfg.pageFastfetch ? ' + fastfetch' : '') + ')' : 'OFF'}\x1b[0m`);
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
    } else if (choice === 'd') {
      const toggle = (await ask('Enable Pages mode? (y/n): ')).trim().toLowerCase();
      if (toggle === 'y' || toggle === 'yes' || toggle === 'on') {
        cfg.pageEnabled = true;
        const v = await pickFromList('Page Styles', OPTIONS.page);
        if (v) cfg.pageStyle = v;
        const ff = (await ask('Run fastfetch after page finishes loading? (y/n): ')).trim().toLowerCase();
        cfg.pageFastfetch = (ff === 'y' || ff === 'yes' || ff === 'on');
      } else if (toggle === 'n' || toggle === 'no' || toggle === 'off') {
        cfg.pageEnabled = false;
      }
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
function buildTorusGeometry(lowPower = false) {
  const pts = [];
  const R = 1.05, r = 0.48;
  const thetaStep = lowPower ? 0.09 : 0.045;
  const phiStep = lowPower ? 0.14 : 0.07;
  for (let theta = 0; theta < Math.PI * 2; theta += thetaStep) {
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    for (let phi = 0; phi < Math.PI * 2; phi += phiStep) {
      const cosP = Math.cos(phi), sinP = Math.sin(phi);
      const dist = R + r * cosP;
      pts.push(dist * cosT, r * sinP, dist * sinT, cosP * cosT, sinP, cosP * sinT, 0);
    }
  }
  return new Float32Array(pts);
}

function getPageDims() {
  const cols = Math.min(116, Math.max(84, (process.stdout.columns || 100) - 2));
  return { cols, innerW: cols - 2, rows: 22 };
}

function renderPageFrame(cfg, elapsed, frameCount, box, theme) {
  const { cols, innerW, rows } = getPageDims();
  const rst = '\x1b[0m';
  const dimCol = '\x1b[2m';
  const speed = cfg.animSpeed || 1.0;

  if (cfg.pageStyle === 'matrix-rain') {
    const W = innerW - 2;
    const H = rows;
    const bCol = `\x1b[38;5;${theme.gradient[Math.floor(theme.gradient.length / 2)]}m`;
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:・."=*+-<>¦｜';

    if (!renderPageFrame.rainState || renderPageFrame.rainState.W !== W || renderPageFrame.rainState.H !== H) {
      let rawFf = '';
      try {
        rawFf = execSync('fastfetch --pipe false --logo-padding-left 1', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        try {
          rawFf = execSync('fastfetch', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        } catch {
          rawFf = '\x1b[1;32mfastfetch not found in PATH.\x1b[0m';
        }
      }

      const vGrid = Array.from({ length: H }, () => Array(W).fill(' '));
      const vCol = Array.from({ length: H }, () => Array(W).fill(''));
      let r = 0, c = 0, curAnsi = '';

      const tokens = rawFf.split(/(\x1b\[[0-9;?]*[A-Za-z])/);
      for (const tok of tokens) {
        if (!tok) continue;
        if (tok.startsWith('\x1b[')) {
          const m = tok.match(/^\x1b\[([0-9;?]*)([A-Za-z])$/);
          if (!m) continue;
          const pStr = m.at(1) || '';
          const cmd = m.at(2);
          const nums = pStr.split(';').map(n => parseInt(n, 10) || 0);
          const n0 = nums.at(0) || 0, n1 = nums.at(1) || 0;
          if (cmd === 'm') curAnsi = (pStr === '' || pStr === '0') ? '' : (curAnsi + tok);
          else if (cmd === 'A') r = Math.max(0, r - (n0 || 1));
          else if (cmd === 'B') r = Math.min(H - 1, r + (n0 || 1));
          else if (cmd === 'C') c = Math.min(W - 1, c + (n0 || 1));
          else if (cmd === 'D') c = Math.max(0, c - (n0 || 1));
          else if (cmd === 'G') c = Math.max(0, Math.min(W - 1, (n0 || 1) - 1));
          else if (cmd === 'H' || cmd === 'f') {
            r = Math.max(0, Math.min(H - 1, (n0 || 1) - 1));
            c = Math.max(0, Math.min(W - 1, (n1 || 1) - 1));
          }
        } else {
          for (const ch of tok) {
            if (ch === '\r') c = 0;
            else if (ch === '\n') { r++; c = 0; }
            else if (ch >= ' ') {
              if (r >= 0 && r < H && c >= 0 && c < W) {
                vGrid[r][c] = ch;
                vCol[r][c] = curAnsi;
              }
              c++;
            }
          }
        }
      }

      const usedRows = vGrid.reduce((acc, rowArr, idx) => rowArr.some(ch => ch !== ' ') ? idx + 1 : acc, 0);
      const topPad = Math.max(0, Math.floor((H - usedRows) / 2));
      const ffGrid = Array.from({ length: H }, () => Array(W).fill(' '));
      const ffCol = Array.from({ length: H }, () => Array(W).fill(''));
      for (let ri = 0; ri < usedRows && ri + topPad < H; ri++) {
        ffGrid[ri + topPad] = vGrid[ri];
        ffCol[ri + topPad] = vCol[ri];
      }

      const drops = Array.from({ length: W }, (_, colIdx) => ({
        y: -Math.random() * H * 1.4,
        speed: (0.45 + Math.random() * 0.75) * speed,
        len: Math.floor(6 + Math.random() * Math.max(8, H * 0.65)),
        seed: (colIdx * 31 + Math.floor(Math.random() * 100)) | 0
      }));

      const revealed = Array.from({ length: H }, () => Uint8Array.from({ length: W }, () => 0));
      renderPageFrame.rainState = { W, H, ffGrid, ffCol, drops, revealed, lastTick: elapsed };
    }

    const st = renderPageFrame.rainState;
    const dt = Math.min(0.25, Math.max(0.01, elapsed - st.lastTick));
    st.lastTick = elapsed;

    const revealActive = elapsed >= 0.65 / speed;
    for (let x = 0; x < W; x++) {
      const d = st.drops[x];
      const prevHead = Math.floor(d.y);
      d.y += d.speed * 22 * dt;
      const curHead = Math.floor(d.y);

      if (revealActive) {
        const sweepEnd = Math.min(H - 1, curHead);
        const sweepStart = Math.max(0, prevHead - 1);
        for (let y = sweepStart; y <= sweepEnd; y++) {
          if (st.ffGrid[y][x] !== ' ') {
            st.revealed[y][x] = 1;
          }
        }
      }

      if (d.y - d.len > H + 2) {
        d.y = -Math.random() * (H * 0.6);
        d.speed = (0.45 + Math.random() * 0.75) * speed;
        d.len = Math.floor(6 + Math.random() * Math.max(8, H * 0.65));
      }
    }

    if (elapsed >= 3.6 / speed) {
      const scanRow = Math.min(H, Math.floor(((elapsed - 3.6 / speed) / (0.8 / speed)) * H));
      for (let y = 0; y < scanRow; y++) {
        for (let x = 0; x < W; x++) {
          if (st.ffGrid[y][x] !== ' ') st.revealed[y][x] = 1;
        }
      }
    }

    const lines = [`${bCol}${box.tl}${box.h.repeat(innerW)}${box.tr}${rst}`];
    const headCol = '\x1b[1;38;5;231m';
    const brightGreen = '\x1b[1;38;5;82m';
    const midGreen = '\x1b[38;5;40m';
    const dimGreen = '\x1b[38;5;22m';

    for (let y = 0; y < H; y++) {
      let rowStr = '';
      let lastAnsi = '';
      for (let x = 0; x < W; x++) {
        const d = st.drops[x];
        const headY = Math.floor(d.y);
        const dy = headY - y;
        const isRain = dy >= 0 && dy < d.len;
        const ffChar = st.ffGrid[y][x];
        const isRevealed = st.revealed[y][x] === 1 && ffChar !== ' ';

        let outChar = ' ';
        let outAnsi = '';

        if (isRain && dy === 0) {
          const gIdx = (y * 13 + x * 7 + frameCount * 3 + d.seed) % glyphs.length;
          outChar = glyphs[gIdx];
          outAnsi = headCol;
        } else if (isRevealed) {
          outChar = ffChar;
          outAnsi = (isRain && dy <= 2) ? brightGreen : st.ffCol[y][x];
        } else if (isRain) {
          const gIdx = (y * 17 + x * 11 + Math.floor(frameCount / 2) + d.seed) % glyphs.length;
          outChar = glyphs[gIdx];
          if (dy <= 2) outAnsi = brightGreen;
          else if (dy <= d.len * 0.55) outAnsi = midGreen;
          else outAnsi = dimGreen;
        }

        if (outAnsi !== lastAnsi) {
          rowStr += rst + outAnsi;
          lastAnsi = outAnsi;
        }
        rowStr += outChar;
      }
      lines.push(`${bCol}${box.v}${rst} ${rowStr}${rst} ${bCol}${box.v}${rst}`);
    }

    lines.push(`${bCol}${box.bl}${box.h.repeat(Math.max(0, innerW))}${box.br}${rst}`);
    return lines;
  }

  if (cfg.pageStyle === 'text-scramble') {
    const bCol = `\x1b[38;5;${theme.gradient[Math.floor(theme.gradient.length / 2)]}m`;
    const hiCol = `\x1b[38;5;${theme.gradient}m`;
    const midCol = `\x1b[38;5;${theme.gradient[Math.min(theme.gradient.length - 1, 4)]}m`;
    const grid = Array.from({ length: rows }, () => Array(innerW).fill(' '));
    const colorGrid = Array.from({ length: rows }, () => Array(innerW).fill(''));

    const glyphs = '!<>-_\\/[]{}—=+*^?#01@$%&░▒▓';
    const glitchColors = [
      '\x1b[38;5;51m',  // electric cyan
      '\x1b[38;5;201m', // hot magenta
      '\x1b[38;5;82m',  // neon green
      '\x1b[38;5;214m', // bright orange
      '\x1b[38;5;226m', // vivid yellow
      '\x1b[1;37m'      // crisp white flash
    ];

    const t = (elapsed * speed) % 7.4;
    const progress = t < 4.4 ? (t / 4.4) : (t < 6.4 ? 1.0 : Math.max(0, 1 - (t - 6.4) / 1.0));
    const isScrambling = progress < 0.96;

    const BIG = {
      'O': [' █████ ', '██   ██', '██   ██', '██   ██', ' █████ '],
      'r': ['       ', '██ ███ ', '███    ', '██     ', '██     '],
      'a': ['       ', ' █████ ', '  ▄▄▄██', '██   ██', ' █████▀'],
      'n': ['       ', '██ ███ ', '██   ██', '██   ██', '██   ██'],
      'g': ['       ', ' █████ ', '██   ██', ' ██████', ' ▄▄▄▄██'],
      'e': ['       ', ' █████ ', '███████', '██     ', ' █████ '],
      'P': ['██████ ', '██   ██', '██████ ', '██     ', '██     '],
      'i': [' ██    ', '       ', ' ██    ', ' ██    ', ' ██    '],
      'Z': ['███████', '    ██ ', '  ███  ', ' ██    ', '███████'],
      'o': ['       ', ' █████ ', '██   ██', '██   ██', ' █████ '],
      '4': ['  ███  ', ' ████  ', '██ ██  ', '███████', '   ██  ']
    };

    const renderWordLine = (lineWords, baseWordIdx, topRow) => {
      const bRows = ['', '', '', '', ''];
      const wMap = [];
      lineWords.forEach((word, idx) => {
        const wIdx = baseWordIdx + idx;
        if (idx > 0) {
          for (let r = 0; r < 5; r++) bRows[r] += '   ';
          wMap.push(-1, -1, -1);
        }
        for (const ch of word) {
          const g = BIG[ch];
          for (let r = 0; r < 5; r++) bRows[r] += g[r] + ' ';
          for (let k = 0; k < g.at(0).length + 1; k++) wMap.push(wIdx);
        }
      });

      const lineW = bRows.at(0).length;
      const startX = Math.max(2, Math.floor((innerW - lineW) / 2));
      const glitchBurst = isScrambling && (Math.sin(elapsed * 29 + baseWordIdx) > 0.72);

      for (let r = 0; r < 5; r++) {
        const rowShear = glitchBurst ? (((r + Math.floor(elapsed * 40)) % 3) - 1) : 0;
        for (let i = 0; i < lineW; i++) {
          const ch = bRows[r][i];
          const wIdx = wMap[i];
          if (ch === ' ' || wIdx < 0) continue;

          const wordStart = wIdx * 0.23;
          const wordEnd = wordStart + 0.23;
          const wp = Math.max(0, Math.min(1, (progress - wordStart) / (wordEnd - wordStart)));
          const gx = startX + i + (wp < 1.0 ? rowShear : 0);
          if (gx < 1 || gx >= innerW - 1) continue;

          if (wp >= 1.0) {
            const gradRowCol = `\x1b[38;5;${theme.gradient[Math.min(theme.gradient.length - 1, r * 2)]}m`;
            grid[topRow + r][gx] = ch;
            colorGrid[topRow + r][gx] = gradRowCol;
          } else if (wp > 0.04) {
            const tick = Math.floor(elapsed * 36 + i * 7 + r * 13);
            grid[topRow + r][gx] = glyphs[tick % glyphs.length];
            colorGrid[topRow + r][gx] = wp > 0.82 ? '\x1b[1;37m' : glitchColors[tick % glitchColors.length];

            const ghostX = gx + (r % 2 === 0 ? 1 : -1);
            if (ghostX >= 1 && ghostX < innerW - 1 && grid[topRow + r][ghostX] === ' ') {
              grid[topRow + r][ghostX] = glyphs[(tick + 5) % glyphs.length];
              colorGrid[topRow + r][ghostX] = r % 2 === 0 ? '\x1b[38;5;51m' : '\x1b[38;5;201m';
            }
          } else {
            const tick = Math.floor(elapsed * 20 + i * 3 + r * 5);
            grid[topRow + r][gx] = glyphs[tick % glyphs.length];
            colorGrid[topRow + r][gx] = tick % 5 === 0 ? glitchColors[(i + r) % 4] : dimCol;
          }
        }
      }
    };

    // Top & bottom decorative rules
    const ruleW = Math.min(innerW - 8, 66);
    const ruleStart = Math.max(2, Math.floor((innerW - ruleW) / 2));
    for (let i = 0; i < ruleW; i++) {
      const glitchTick = isScrambling && ((Math.floor(elapsed * 24) + i * 7) % 19 === 0);
      grid[rows - 5][ruleStart + i] = glitchTick ? glyphs[(i + Math.floor(elapsed * 30)) % glyphs.length] : '═';
      colorGrid[rows - 5][ruleStart + i] = glitchTick ? glitchColors[i % glitchColors.length] : dimCol;
      grid[rows - 5][ruleStart + i] = glitchTick ? glyphs[(i * 3 + Math.floor(elapsed * 30)) % glyphs.length] : '═';
      colorGrid[rows - 5][ruleStart + i] = glitchTick ? glitchColors[(i + 2) % glitchColors.length] : dimCol;
    }

    // Stack "Orange Pi" (words 0, 1) above "Zero 4" (words 2, 3)
    renderWordLine(['Orange', 'Pi'], 0, 3);
    renderWordLine(['Zero', '4'], 2, 9);

    // Ambient horizontal glitch sparks during active scramble
    if (isScrambling) {
      for (let g = 0; g < 6; g++) {
        const gy = 2 + ((Math.floor(elapsed * 19) + g * 5) % (rows - 5));
        const gx = 3 + ((Math.floor(elapsed * 47) + g * 23) % (innerW - 8));
        if (grid[gy][gx] === ' ') {
          grid[gy][gx] = glyphs[(g + Math.floor(elapsed * 35)) % glyphs.length];
          colorGrid[gy][gx] = glitchColors[(g + Math.floor(elapsed * 12)) % glitchColors.length];
        }
      }
    }

    const words = ['Orange', 'Pi', 'Zero', '4'];
    const activeWord = progress >= 0.95 ? 'COMPLETE' : words[Math.min(3, Math.floor(progress * 4))].toUpperCase();
    const statusText = progress >= 0.95
      ? `[ WELCOME BACK, ${(process.env.USER || 'ROOT').toUpperCase()} — SYSTEM VERIFIED ]`
      : `[ DECRYPTING TARGET: ${activeWord} ]`;
    const sStart = Math.max(2, Math.floor((innerW - statusText.length) / 2));
    for (let i = 0; i < statusText.length && sStart + i < innerW - 2; i++) {
      grid[rows - 3][sStart + i] = statusText[i];
      colorGrid[rows - 3][sStart + i] = progress >= 0.95 ? '\x1b[1;32m' : hiCol;
    }

    const lines = [`${bCol}${box.tl}${box.h.repeat(innerW)}${box.tr}${rst}`];
    for (let r = 0; r < rows; r++) {
      let rowStr = '';
      for (let c = 0; c < innerW; c++) rowStr += colorGrid[r][c] ? `${colorGrid[r][c]}${grid[r][c]}${rst}` : grid[r][c];
      lines.push(`${bCol}${box.v}${rst}${rowStr}${bCol}${box.v}${rst}`);
    }
    const footer = '';
    const fPad = Math.max(0, innerW - footer.length);
    const lDash = Math.floor(fPad / 2), rDash = fPad - lDash;
    lines.push(`${bCol}${box.bl}${box.h.repeat(lDash)}${dimCol}${footer}${rst}${bCol}${box.h.repeat(rDash)}${box.br}${rst}`);
    return lines;
  }

  if (cfg.pageStyle === 'progress-loader') {
    const bCol = `\x1b[38;5;${theme.gradient[Math.floor(theme.gradient.length / 2)]}m`;
    const hiCol = `\x1b[38;5;${theme.gradient}m`;
    const midCol = `\x1b[38;5;${theme.gradient[Math.min(theme.gradient.length - 1, 3)]}m`;
    const grid = Array.from({ length: rows }, () => Array(innerW).fill(' '));
    const colorGrid = Array.from({ length: rows }, () => Array(innerW).fill(''));

    const writeCenter = (rIdx, text, col = '') => {
      const start = Math.max(1, Math.floor((innerW - text.length) / 2));
      for (let i = 0; i < text.length && start + i < innerW - 1; i++) {
        grid[rIdx][start + i] = text[i];
        colorGrid[rIdx][start + i] = col;
      }
    };

    // Animated Braille & Orbital Spinners
    const brailleFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const orbitFrames = ['◐', '◓', '◑', '◒'];
    const stepIdx = Math.floor(elapsed * 12 * speed);
    const bSpin = brailleFrames[stepIdx % brailleFrames.length];
    const oSpin = orbitFrames[Math.floor(elapsed * 6 * speed) % orbitFrames.length];

    // 3-ring animated ASCII loader emblem
    const ringPhase = Math.floor(elapsed * 8 * speed) % 4;
    const emblem = [
      `      . - ~ ~ ~ - .      `,
      `   . '   ${ringPhase === 0 ? '●' : '○'}   ${ringPhase === 1 ? '●' : '○'}   ' .   `,
      `  /   ${ringPhase === 3 ? '●' : '○'}    ${oSpin}    ${ringPhase === 2 ? '●' : '○'}   \  `,
      `   ' .   ${ringPhase === 2 ? '●' : '○'}   ${ringPhase === 3 ? '●' : '○'}   . '   `,
      `      ' - _ _ _ - '      `
    ];
    for (let r = 0; r < emblem.length; r++) {
      writeCenter(3 + r, emblem[r], r === 2 ? hiCol : midCol);
    }

    // Smooth looping progress bar (0% -> 100%)
    const cycle = (elapsed * 0.28 * speed) % 1.15;
    const pct = Math.min(100, Math.floor((cycle / 1.0) * 100));
    const barW = Math.min(44, innerW - 16);
    const filled = Math.round((pct / 100) * barW);
    const barRow = 10;
    const barStart = Math.floor((innerW - (barW + 8)) / 2);

    grid[barRow][barStart] = '[';
    colorGrid[barRow][barStart] = bCol;
    for (let i = 0; i < barW; i++) {
      const gx = barStart + 1 + i;
      if (i < filled) {
        const wave = (i + stepIdx) % 6 === 0;
        grid[barRow][gx] = wave ? '▓' : '█';
        colorGrid[barRow][gx] = wave ? '\x1b[1;37m' : hiCol;
      } else {
        grid[barRow][gx] = '░';
        colorGrid[barRow][gx] = dimCol;
      }
    }
    const pctLabel = `] ${String(pct).padStart(3, ' ')}%`;
    for (let i = 0; i < pctLabel.length; i++) {
      grid[barRow][barStart + 1 + barW + i] = pctLabel[i];
      colorGrid[barRow][barStart + 1 + barW + i] = i === 0 ? bCol : '\x1b[1;37m';
    }

    // Status message & checklist rows
    const stages = [
      'Initializing SBC hardware sensors...',
      'Mounting filesystems & network interfaces...',
      'Synchronizing terminal telemetry...',
      'Environment ready — welcome back!'
    ];
    const stageMsg = pct >= 100 ? stages : stages[Math.min(2, Math.floor((pct / 100) * 3))];
    writeCenter(12, `${bSpin}  ${stageMsg}`, '\x1b[1;37m');

    const checks = [
      { label: 'CPU & Thermal Monitors', done: pct >= 30 },
      { label: 'Network & SSH Session', done: pct >= 65 },
      { label: 'Interactive Shell Profile', done: pct >= 95 }
    ];
    for (let i = 0; i < checks.length; i++) {
      const mark = checks[i].done ? '[✓]' : `[${brailleFrames[(stepIdx + i * 2) % brailleFrames.length]}]`;
      const col = checks[i].done ? '\x1b[1;32m' : dimCol;
      writeCenter(14 + i, `${mark} ${checks[i].label}`, col);
    }

    writeCenter(rows - 2, 'Loading your workspace...', dimCol);

    const lines = [];
    lines.push(`${bCol}${box.tl}${box.h.repeat(innerW)}${box.tr}${rst}`);
    for (let r = 0; r < rows; r++) {
      let rowStr = '';
      for (let c = 0; c < innerW; c++) {
        rowStr += colorGrid[r][c] ? `${colorGrid[r][c]}${grid[r][c]}${rst}` : grid[r][c];
      }
      lines.push(`${bCol}${box.v}${rst}${rowStr}${bCol}${box.v}${rst}`);
    }
    const footer = '';
    const fPad = Math.max(0, innerW - footer.length);
    const lDash = Math.floor(fPad / 2), rDash = fPad - lDash;
    lines.push(`${bCol}${box.bl}${box.h.repeat(lDash)}${dimCol}${footer}${rst}${bCol}${box.h.repeat(rDash)}${box.br}${rst}`);
    return lines;
  }

  if (cfg.pageStyle === 'christmas') {
    const bCol = '\x1b[38;5;34m';
    const grid = Array.from({ length: rows }, () => Array(innerW).fill(' '));
    const colorGrid = Array.from({ length: rows }, () => Array(innerW).fill(''));

    // Drifting snow across the sky
    for (let s = 0; s < 48; s++) {
      const fall = Math.floor(elapsed * (1.8 + (s % 3) * 0.7) * speed + s * 5);
      const sy = fall % (rows - 3);
      const sway = Math.round(Math.sin(elapsed * 1.5 * speed + s) * 1.5);
      const sx = ((s * 31 + sway) % (innerW - 2) + (innerW - 2)) % (innerW - 2) + 1;
      grid[sy][sx] = s % 4 === 0 ? '*' : '·';
      colorGrid[sy][sx] = s % 3 === 0 ? '\x1b[1;37m' : '\x1b[38;5;250m';
    }

    // Snow ground
    for (let x = 1; x < innerW - 1; x++) {
      grid[rows - 3][x] = x % 3 === 0 ? '~' : '_';
      colorGrid[rows - 3][x] = '\x1b[1;37m';
    }

    // Christmas Tree (tiered evergreen + blinking ornaments + gold star)
    const tree = [
      '           ★           ',
      '          /|\          ',
      '         /*|o\         ',
      '        /o*|*+\        ',
      '       /*+o|o*+\       ',
      '      /o*+*|*o*+\      ',
      '     /*+o*+|+*o*+\     ',
      '    /o*+o*+|+*o*+o\    ',
      '   /*+o*+o*|*o*+o*+\   ',
      '  /o*+o*+o*|*o*+o*+o\  ',
      ' /_________|_________\ ',
      '          |||          ',
      '          |||          '
    ];
    const ornColors = ['\x1b[1;31m', '\x1b[1;33m', '\x1b[1;36m', '\x1b[1;35m', '\x1b[38;5;208m'];
    const greens = ['\x1b[38;5;34m', '\x1b[38;5;40m', '\x1b[38;5;28m'];
    const tx0 = Math.floor((innerW - tree.length) / 2);
    const ty0 = 3;

    for (let r = 0; r < tree.length; r++) {
      for (let c = 0; c < tree[r].length; c++) {
        const ch = tree[r][c];
        const gx = tx0 + c, gy = ty0 + r;
        if (ch === ' ' || gx < 1 || gx >= innerW - 1 || gy >= rows - 3) continue;
        if (r === 0 && ch === '★') {
          const pulse = Math.sin(elapsed * 5 * speed) > 0;
          grid[gy][gx] = pulse ? '★' : '✦';
          colorGrid[gy][gx] = pulse ? '\x1b[1;33m' : '\x1b[38;5;226m';
        } else if (r >= 11) {
          grid[gy][gx] = ch;
          colorGrid[gy][gx] = '\x1b[38;5;130m';
        } else if (ch === 'o' || ch === '+' || ch === '*') {
          const phase = Math.floor(elapsed * 3.5 * speed + r * 3 + c * 5);
          const isLit = phase % 3 !== 0;
          grid[gy][gx] = ch === 'o' ? '●' : (ch === '+' ? '◆' : (isLit ? '✦' : '·'));
          colorGrid[gy][gx] = isLit ? ornColors[(r + c + phase) % ornColors.length] : greens[(r + c) % greens.length];
        } else {
          grid[gy][gx] = ch;
          colorGrid[gy][gx] = greens[(r + c) % greens.length];
        }
      }
    }

    // Colorful wrapped presents under the tree
    const gifts = [
      { x: tx0 - 6, w: 5, col: '\x1b[1;31m', rib: '\x1b[1;33m' },
      { x: tx0 + tree.length + 1, w: 6, col: '\x1b[1;34m', rib: '\x1b[1;37m' },
      { x: tx0 + tree.length + 8, w: 4, col: '\x1b[1;35m', rib: '\x1b[1;33m' }
    ];
    for (const g of gifts) {
      if (g.x < 2 || g.x + g.w >= innerW - 2) continue;
      for (let dx = 0; dx < g.w; dx++) {
        const isRib = dx === Math.floor(g.w / 2);
        grid[rows - 5][g.x + dx] = isRib ? '+' : '_';
        colorGrid[rows - 5][g.x + dx] = g.rib;
        grid[rows - 4][g.x + dx] = isRib ? '|' : '#';
        colorGrid[rows - 4][g.x + dx] = isRib ? g.rib : g.col;
      }
    }

    const msg = 'Merry Christmas & Happy Holidays!';
    const mStart = Math.max(1, Math.floor((innerW - msg.length) / 2));
    for (let i = 0; i < msg.length && mStart + i < innerW - 1; i++) {
      grid[rows - 2][mStart + i] = msg[i];
      colorGrid[rows - 2][mStart + i] = i % 2 === 0 ? '\x1b[1;31m' : '\x1b[1;32m';
    }

    const lines = [];
    lines.push(`${bCol}${box.tl}${box.h.repeat(innerW)}${box.tr}${rst}`);
    for (let r = 0; r < rows; r++) {
      let rowStr = '';
      for (let c = 0; c < innerW; c++) {
        rowStr += colorGrid[r][c] ? `${colorGrid[r][c]}${grid[r][c]}${rst}` : grid[r][c];
      }
      lines.push(`${bCol}${box.v}${rst}${rowStr}${bCol}${box.v}${rst}`);
    }
    const footer = '';
    const fPad = Math.max(0, innerW - footer.length);
    const lDash = Math.floor(fPad / 2), rDash = fPad - lDash;
    lines.push(`${bCol}${box.bl}${box.h.repeat(lDash)}${dimCol}${footer}${rst}${bCol}${box.h.repeat(rDash)}${box.br}${rst}`);
    return lines;
  }

  const bCol = `\x1b[38;5;${theme.gradient[Math.floor(theme.gradient.length / 2)]}m`;
  const hiCol = `\x1b[38;5;${theme.gradient}m`;
  // Build starfield + drifting astronaut/404 emblem
  const grid = Array.from({ length: rows }, () => Array(innerW).fill(' '));
  const colorGrid = Array.from({ length: rows }, () => Array(innerW).fill(''));

  // Twinkling background stars
  for (let s = 0; s < 38; s++) {
    const sx = (s * 29 + Math.floor(elapsed * (s % 3 === 0 ? 3 : 1) * speed)) % innerW;
    const sy = (s * 13) % (rows - 5);
    const twinkle = Math.sin(elapsed * 4 + s) > 0.2 ? '*' : '.';
    grid[sy][sx] = twinkle;
    colorGrid[sy][sx] = dimCol;
  }

  // Drifting mini-planet / black hole on left
  const planet = [
    '   .---.   ',
    '  /     \  ',
    '-(  (o)  )-',
    '  \     /  ',
    "   '---'   "
  ];
  const py0 = 3 + Math.round(Math.cos(elapsed * 1.2 * speed));
  for (let r = 0; r < planet.length; r++) {
    for (let c = 0; c < planet[r].length; c++) {
      const ch = planet[r][c];
      if (ch !== ' ' && py0 + r >= 0 && py0 + r < rows) {
        grid[py0 + r][6 + c] = ch;
        colorGrid[py0 + r][6 + c] = `\x1b[38;5;${theme.gradient[3]}m`;
      }
    }
  }

  // Floating 404 + drifting astronaut sprite
  const art = [
    '   _  _    ___  _  _        .-.   ',
    '  | || |  / _ \| || |      (o.o)  ',
    '  | || |_| | | | || |_   --|=|=|--',
    '  |__   _| | | |__   _|    |___|  ',
    '     |_|  \___/   |_|      /   \  '
  ];
  const floatX = Math.floor((innerW - art[0].length) / 2) + Math.round(Math.sin(elapsed * 1.6 * speed) * 6);
  const floatY = 4 + Math.round(Math.sin(elapsed * 2.4 * speed) * 1.5);
  for (let r = 0; r < art.length; r++) {
    for (let c = 0; c < art[r].length; c++) {
      const ch = art[r][c];
      const gx = floatX + c, gy = floatY + r;
      if (ch !== ' ' && gx >= 1 && gx < innerW - 1 && gy >= 1 && gy < rows - 5) {
        grid[gy][gx] = ch;
        colorGrid[gy][gx] = hiCol;
      }
    }
  }

  const centerText = (rowIdx, text, col = '') => {
    const start = Math.max(1, Math.floor((innerW - text.length) / 2));
    for (let i = 0; i < text.length && start + i < innerW - 1; i++) {
      grid[rowIdx][start + i] = text[i];
      colorGrid[rowIdx][start + i] = col;
    }
  };

  centerText(rows - 4, '404 · Page not found', hiCol);
  centerText(rows - 3, 'This page drifted off into space.', '\x1b[1;37m');
  centerText(rows - 1, '[ Take me home — press any key ]', dimCol);

  const lines = [];
  lines.push(`${bCol}${box.tl}${box.h.repeat(innerW)}${box.tr}${rst}`);
  for (let r = 0; r < rows; r++) {
    let rowStr = '';
    for (let c = 0; c < innerW; c++) {
      rowStr += colorGrid[r][c] ? `${colorGrid[r][c]}${grid[r][c]}${rst}` : grid[r][c];
    }
    lines.push(`${bCol}${box.v}${rst}${rowStr}${bCol}${box.v}${rst}`);
  }
  const footer = '';
  const fPad = Math.max(0, innerW - footer.length);
  const lDash = Math.floor(fPad / 2), rDash = fPad - lDash;
  lines.push(`${bCol}${box.bl}${box.h.repeat(lDash)}${dimCol}${footer}${rst}${bCol}${box.h.repeat(rDash)}${box.br}${rst}`);
  return lines;
}

async function runRenderer(cfg) {
  // Optimize for hardware automatically
  const lowPower = isLowPowerDevice();
  cfg = optimizeForHardware(cfg);
  
  const detected = detectPlatform();
  const activeLogo = cfg.logo === 'auto' ? detected : cfg.logo;
  const activeThemeName = cfg.theme === 'auto' ? detected : cfg.theme;
  const isNoColor = activeThemeName === 'nocolor' || Boolean(process.env.NO_COLOR);
  const theme = THEMES[activeThemeName] || THEMES.orangepi;
  const box = BORDERS[cfg.border] || BORDERS.rounded;

  // Use superior citrus geometry for orange-themed displays
  let renderGeometry = null;
  let isCitrus = false;
  if (activeLogo === 'torus') {
    isCitrus = true;
  } else if (activeLogo === 'orangepi') {
    renderGeometry = buildCitrusGeometry(false);
    isCitrus = true;
  }

  const voxels = isCitrus ? null : buildVoxels(activeLogo, lowPower);
  const sysLines = getSystemInfo();

  const detailLevelMap = {
    low: { resolution: 0.7, chars: '.,-~:;=!*#$@' },
    medium: { resolution: 0.85, chars: '░▒▓█' },
    high: { resolution: 1.0, chars: '░▒▓█▀▄' }
  };
  const detailLevel = detailLevelMap[cfg.detail] || detailLevelMap.high;

  const W = Math.ceil(50 * detailLevel.resolution);
  const H = 22;
  const subH = cfg.look === 'blocks' ? H * 2 : H;
  const infoWidth = 48;
  const totalWidth = W + infoWidth + 5;
  const prevFrame = [];
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
      console.log(`\x1b[2m[>] ${tip}\x1b[0m`);
    }
    process.exit(0);
  };

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      if (key === 3) process.exit(0);
      cleanup();
    });
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');

  const renderFrame = () => {
    if (!running) return;
    const elapsed = (Date.now() - startTime) / 1000;
    if (cfg.pageEnabled) {
      const sp = cfg.animSpeed || 1.0;
      const doneAt = cfg.pageStyle === 'text-scramble' ? (4.8 / sp)
                   : cfg.pageStyle === 'progress-loader' ? (3.8 / sp)
                   : (3.5 / sp);

      const { cols, innerW, rows } = getPageDims();
      const bCol = `\x1b[38;5;${theme.gradient[Math.floor(theme.gradient.length / 2)]}m`;
      const dimCol = '\x1b[2m';
      const rst = '\x1b[0m';

      let linesToDraw = null;

      if (cfg.pageFastfetch && elapsed >= doneAt) {
        if (!renderFrame.ffGrid) {
          let rawFf = '';
          try {
            rawFf = execSync('fastfetch --pipe false --logo-padding-left 1', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          } catch {
            try {
              rawFf = execSync('fastfetch', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            } catch {
              rawFf = '\x1b[1;33mfastfetch not installed or not found in PATH.\x1b[0m';
            }
          }

          const vGrid = Array.from({ length: rows }, () => Array(innerW - 2).fill(' '));
          const vCol = Array.from({ length: rows }, () => Array(innerW - 2).fill(''));
          let r = 0, c = 0, curAnsi = '';

          const tokens = rawFf.split(/(\x1b\[[0-9;?]*[A-Za-z])/);
          for (const tok of tokens) {
            if (!tok) continue;
            if (tok.startsWith('\x1b[')) {
              const m = tok.match(/^\x1b\[([0-9;?]*)([A-Za-z])$/);
              if (!m) continue;
              const pStr = m.at(1) || '';
              const cmd = m.at(2);
              const nums = pStr.split(';').map(n => parseInt(n, 10) || 0);
              const n0 = nums.at(0) || 0;
              const n1 = nums.at(1) || 0;
              if (cmd === 'm') {
                curAnsi = (pStr === '' || pStr === '0') ? '' : (curAnsi + tok);
              } else if (cmd === 'A') {
                r = Math.max(0, r - (n0 || 1));
              } else if (cmd === 'B') {
                r = Math.min(rows - 1, r + (n0 || 1));
              } else if (cmd === 'C') {
                c = Math.min(innerW - 3, c + (n0 || 1));
              } else if (cmd === 'D') {
                c = Math.max(0, c - (n0 || 1));
              } else if (cmd === 'G') {
                c = Math.max(0, Math.min(innerW - 3, (n0 || 1) - 1));
              } else if (cmd === 'H' || cmd === 'f') {
                r = Math.max(0, Math.min(rows - 1, (n0 || 1) - 1));
                c = Math.max(0, Math.min(innerW - 3, (n1 || 1) - 1));
              }
            } else {
              for (const ch of tok) {
                if (ch === '\r') {
                  c = 0;
                } else if (ch === '\n') {
                  r++;
                  c = 0;
                } else if (ch >= ' ') {
                  if (r >= 0 && r < rows && c >= 0 && c < innerW - 2) {
                    vGrid[r][c] = ch;
                    vCol[r][c] = curAnsi;
                  }
                  c++;
                }
              }
            }
          }

          const usedRows = vGrid.reduce((acc, rowArr, idx) => rowArr.some(ch => ch !== ' ') ? idx + 1 : acc, 0);
          const topPad = Math.max(0, Math.floor((rows - usedRows) / 2));
          const centeredGrid = Array.from({ length: rows }, () => Array(innerW - 2).fill(' '));
          const centeredCol = Array.from({ length: rows }, () => Array(innerW - 2).fill(''));
          for (let ri = 0; ri < usedRows && ri + topPad < rows; ri++) {
            centeredGrid[ri + topPad] = vGrid[ri];
            centeredCol[ri + topPad] = vCol[ri];
          }

          const buildBox = (gArr, cArr, footLabel) => {
            const outLines = [`${bCol}${box.tl}${box.h.repeat(innerW)}${box.tr}${rst}`];
            for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
              let lineStr = '';
              let lastAnsi = '';
              for (let colIdx = 0; colIdx < innerW - 2; colIdx++) {
                const a = cArr[rowIdx][colIdx];
                if (a !== lastAnsi) {
                  lineStr += rst + a;
                  lastAnsi = a;
                }
                lineStr += gArr[rowIdx][colIdx];
              }
              outLines.push(`${bCol}${box.v}${rst} ${lineStr}${rst} ${bCol}${box.v}${rst}`);
            }
            const fPad = Math.max(0, innerW - footLabel.length);
            const lDash = Math.floor(fPad / 2), rDash = fPad - lDash;
            outLines.push(`${bCol}${box.bl}${box.h.repeat(lDash)}${dimCol}${footLabel}${rst}${bCol}${box.h.repeat(rDash)}${box.br}${rst}`);
            return outLines;
          };

          renderFrame.ffGrid = centeredGrid;
          renderFrame.ffCol = centeredCol;
          renderFrame.ffFull = buildBox(centeredGrid, centeredCol, '');
          renderFrame.buildBox = buildBox;
        }

        const transDur = 0.85;
        const prog = Math.min(1, (elapsed - doneAt) / transDur);

        if (prog >= 1) {
          linesToDraw = renderFrame.ffFull;
        } else {
          const dGrid = Array.from({ length: rows }, () => Array(innerW - 2).fill(' '));
          const dCol = Array.from({ length: rows }, () => Array(innerW - 2).fill(''));
          const fadeChars = ['·', '░', '▒'];
          for (let ri = 0; ri < rows; ri++) {
            for (let ci = 0; ci < innerW - 2; ci++) {
              const cellDelay = (ri / rows) * 0.55 + (ci / (innerW - 2)) * 0.25;
              const cellProg = Math.max(0, Math.min(1, (prog - cellDelay) / 0.25));
              if (cellProg >= 1) {
                dGrid[ri][ci] = renderFrame.ffGrid[ri][ci];
                dCol[ri][ci] = renderFrame.ffCol[ri][ci];
              } else if (cellProg > 0.15 && renderFrame.ffGrid[ri][ci] !== ' ') {
                dGrid[ri][ci] = fadeChars[Math.floor(cellProg * fadeChars.length)];
                dCol[ri][ci] = dimCol;
              }
            }
          }
          linesToDraw = renderFrame.buildBox(dGrid, dCol, '');
        }
      } else {
        linesToDraw = renderPageFrame(cfg, elapsed, frameCount, box, theme);
      }

      let out = '\x1b[?2026h';
      for (let r = 0; r < linesToDraw.length; r++) {
        if (prevFrame[r] !== linesToDraw[r]) {
          out += `\x1b[${r + 1};1H${linesToDraw[r]}`;
          prevFrame[r] = linesToDraw[r];
        }
      }
      out += '\x1b[?2026l';
      process.stdout.write(isNoColor ? out.replace(/\x1b\[[0-9;]*m/g, '') : out);
      frameCount++;
      return;
    }
    const speedMult = cfg.animSpeed || 1.0;
    let rotY = 0, rotX = 0, rotZ = 0, offsetY = 0, scale = 1.0;

    if (cfg.anim === 'rotate') {
      rotY = elapsed * 1.1 * speedMult;
      rotX = Math.sin(elapsed * 0.7 * speedMult) * 0.15;
    } else if (cfg.anim === 'pendulum') {
      rotY = Math.sin(elapsed * 1.4 * speedMult) * 0.65;
    } else if (cfg.anim === 'bounce') {
      rotY = 0;
      offsetY = Math.abs(Math.sin(elapsed * 4.0 * speedMult)) * -2.2 + 1.0;
    } else if (cfg.anim === 'bounce+rotate') {
      rotY = elapsed * 1.1 * speedMult;
      offsetY = Math.abs(Math.sin(elapsed * 4.0 * speedMult)) * -2.2 + 1.0;
    } else if (cfg.anim === 'pulse') {
      rotY = Math.sin(elapsed * 0.8 * speedMult) * 0.3;
      scale = 0.88 + Math.sin(elapsed * 3.0 * speedMult) * 0.14;
    } else if (cfg.anim === 'tumble') {
      rotY = elapsed * 1.0 * speedMult;
      rotX = elapsed * 0.65 * speedMult;
      rotZ = Math.sin(elapsed * 0.5 * speedMult) * 0.35;
    } else if (cfg.anim === 'wave') {
      rotY = Math.sin(elapsed * 1.8 * speedMult) * 0.45;
      rotX = Math.cos(elapsed * 2.4 * speedMult) * 0.35;
    }

    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const cosZ = Math.cos(rotZ), sinZ = Math.sin(rotZ);

    const zBuf = new Float32Array(W * subH).fill(-999);
    const rawColor = new Int16Array(W * subH).fill(-1);
    const lumBuf = new Float32Array(W * subH).fill(-1);

    if (activeLogo === 'torus') {
      const A = cfg.anim === 'static' ? 1.0 : elapsed * 1.2 * speedMult;
      const B = cfg.anim === 'static' ? 0.5 : elapsed * 0.6 * speedMult;
      const cosA = Math.cos(A), sinA = Math.sin(A);
      const cosB = Math.cos(B), sinB = Math.sin(B);

      const R1 = 1.0;
      const R2 = 2.05;
      const K2 = 5.0;
      const K1X = W * K2 * 3 / (8 * (R1 + R2)) * 1.18 * scale;
      const K1Y = (cfg.look === 'blocks' ? subH : subH * 0.5) * K2 * 3 / (8 * (R1 + R2)) * 2.15 * scale;
      const halfW = W >> 1;
      const halfH = ((subH >> 1) + offsetY * (cfg.look === 'blocks' ? 3 : 1.5)) | 0;

      for (let theta = 0; theta < 6.2832; theta += 0.022) {
        const costheta = Math.cos(theta), sintheta = Math.sin(theta);
        const circlex = R2 + R1 * costheta;
        const circley = R1 * sintheta;

        for (let phi = 0; phi < 6.2832; phi += 0.008) {
          const cosphi = Math.cos(phi), sinphi = Math.sin(phi);

          const x = circlex * (cosB * cosphi + sinA * sinB * sinphi) - circley * cosA * sinB;
          const y = circlex * (sinB * cosphi - sinA * cosB * sinphi) + circley * cosA * cosB;
          const z = K2 + cosA * circlex * sinphi + circley * sinA;
          const ooz = 1 / z;

          const xp = (halfW + K1X * ooz * x) | 0;
          const yp = (halfH - K1Y * ooz * y) | 0;

          if (xp >= 0 && xp < W && yp >= 0 && yp < subH) {
            const idx = yp * W + xp;
            const L = cosphi * costheta * sinB - cosA * costheta * sinphi - sinA * sintheta + cosB * (cosA * sintheta - costheta * sinA * sinphi);
            const depthKey = ooz + Math.max(0, L) * 0.0008;
            if (depthKey > zBuf[idx]) {
              zBuf[idx] = depthKey;
              const lum = L > 0 ? Math.min(0.99, L / 1.38) : 0.01;
              lumBuf[idx] = lum;
              const gradIdx = Math.min(theme.gradient.length - 1, Math.floor(lum * theme.gradient.length));
              rawColor[idx] = theme.gradient[gradIdx];
            }
          }
        }
      }
    } else if (isCitrus && renderGeometry) {
      // Superior citrus rendering with proper lighting
      const PTS = renderGeometry;
      const scaleY = subH * 0.84 * scale;
      const scaleX = (cfg.look === 'blocks' ? subH * 0.84 : subH * 1.68) * scale;
      const halfW = W >> 1;
      const halfH = ((subH >> 1) + (cfg.look === 'blocks' ? 2 : 1) + offsetY * (cfg.look === 'blocks' ? 3 : 1.5)) | 0;

      for (let i = 0; i < PTS.length; i += 7) {
        const px = PTS[i];
        const py = PTS[i + 1];
        const pz = PTS[i + 2];

        const x1 = px * cosY + pz * sinY;
        const z1 = -px * sinY + pz * cosY;
        const y2 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;

        const ooz = 1 / (4.9 + z2);
        const xp = (halfW + scaleX * ooz * x1) | 0;
        const yp = (halfH - scaleY * ooz * y2) | 0;

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

            const light = Math.max(0.05, Math.min(0.99, Math.abs(nz2) * 0.68 - nx1 * 0.32 + ny2 * 0.42 + 0.22));
            lumBuf[idx] = light;
            if (PTS[i + 6] === 1) {
              const leafIdx = Math.min(Math.max(0, ((1 - light) * 6) | 0), 5);
              rawColor[idx] = LEAF_GRADIENT[leafIdx];
            } else {
              const gradPos = (yp / (subH - 1)) * 0.65 + (1 - light) * 0.35;
              const idx12 = Math.min(Math.max(0, (gradPos * 12) | 0), 11);
              rawColor[idx] = (activeLogo === 'orangepi' ? ORANGE_GRADIENT : theme.gradient)[idx12];
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
            if (count >= 2 && activeLogo !== 'torus') {
              rawColor[idx] = sample;
              if (typeof lumBuf !== 'undefined' && lumBuf[idx] < 0) {
                const lUp = lumBuf[idx - W], lDn = lumBuf[idx + W], lLt = lumBuf[idx - 1], lRt = lumBuf[idx + 1];
                lumBuf[idx] = Math.max(lUp, lDn, lLt, lRt, 0.25);
              }
            }
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

        const projX = Math.round(W / 2 + (x3 * fov) / depth * 2.15);
        const aspectY = cfg.look === 'blocks' ? 2.30 : 1.15;
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
            const normZ = (typeof lumBuf !== 'undefined' && lumBuf[idx] >= 0)
              ? lumBuf[idx]
              : Math.max(0, Math.min(0.99, (zBuf[idx] + 8) / 16));
            const gradIdx = Math.floor(normZ * (theme.gradient.length - 1));
            const colCode = rawColor[idx] >= 0 ? rawColor[idx] : theme.gradient[gradIdx];
            const ASCII_RAMP = '.,-~:;=!*#$@';
            const HALFTONE_RAMP = ['·', '•', '●', '◉', '█'];
            const DOTS_RAMP = ['·', ':', '∘', '○', '◎', '●'];
            let ch = '#';
            if (cfg.look === 'ascii' || cfg.look === 'original') {
              ch = ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(normZ * ASCII_RAMP.length))];
            } else if (cfg.look === 'binary') {
              ch = ((row + col + Math.floor(frameCount / 4)) % 2 === 0) ? '1' : '0';
            } else if (cfg.look === 'braille') {
              ch = BRAILLE_RAMP[Math.min(BRAILLE_RAMP.length - 1, Math.floor(normZ * BRAILLE_RAMP.length))];
            } else if (cfg.look === 'halftone') {
              ch = HALFTONE_RAMP[Math.min(HALFTONE_RAMP.length - 1, Math.floor(normZ * HALFTONE_RAMP.length))];
            } else if (cfg.look === 'dots') {
              ch = DOTS_RAMP[Math.min(DOTS_RAMP.length - 1, Math.floor(normZ * DOTS_RAMP.length))];
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

    lines.push(`${bCol}${box.bl}${box.h.repeat(Math.max(0, totalWidth - 2))}${box.br}${rst}`);

    let out = '\x1b[?2026h';
    for (let r = 0; r < lines.length; r++) {
      if (prevFrame[r] !== lines[r]) {
        out += `\x1b[${r + 1};1H${lines[r]}`;
        prevFrame[r] = lines[r];
      }
    }
    out += '\x1b[?2026l';
    process.stdout.write(isNoColor ? out.replace(/\x1b\[[0-9;]*m/g, '') : out);
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
    else if (a === '--page' && next) { previewCfg.pageEnabled = true; previewCfg.pageStyle = next; i++; }
    else if (a === '--set-page' && next) { cfg.pageEnabled = true; cfg.pageStyle = next; previewCfg.pageEnabled = true; previewCfg.pageStyle = next; shouldSave = true; i++; }
    else if (a === '--no-page') { cfg.pageEnabled = false; previewCfg.pageEnabled = false; shouldSave = true; }
    else if (a === '--page-fastfetch') { previewCfg.pageFastfetch = true; }
    else if (a === '--set-page-fastfetch') { cfg.pageFastfetch = true; previewCfg.pageFastfetch = true; shouldSave = true; }
    else if (a === '--no-page-fastfetch') { cfg.pageFastfetch = false; previewCfg.pageFastfetch = false; shouldSave = true; }
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
