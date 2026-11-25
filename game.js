'use strict';
/* =====================================================================
   HORMUZ: ASYMMETRIC DEFENSE  (v1)
   Pure HTML5 Canvas + Web Audio. No assets, no build step.
   Sections: Config · Utils · Audio · Canvas · Particles · World ·
             Units · Threats · Launchers · Waves · Economy · UI · Input ·
             Render · Loop
   ===================================================================== */
(() => {

// ============================== CONFIG ==============================
const W = 1280, H = 720, HUD_H = 50;
const FONT = '"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",Arial,sans-serif';
const MONO = 'Consolas,"SFMono-Regular",Menlo,"Roboto Mono",monospace';

const CFG = {
  startTreasury: 50e6, bankruptLimit: -20e6, incomeEvery: 5,
  prepTime: 8, firstPrep: 30, earlyBonus: 0.5e6,
  launchers: 5, reveal: 10, bounty: 3e6, refund: 0.5,
};

const UNIT = {
  ciws: {
    name: 'CIWS / FLAK TURRET', short: 'CIWS', build: 2e6, shot: 5e3, hp: 60, range: 190,
    tag: 'Cheap drone killer', ammo: 'per burst',
    role: 'Rapid-fire tracer bursts. Shreds Shahed drones, can clip cruise missiles. Cannot reach ballistic missiles. Ignores decoys.',
  },
  patriot: {
    name: 'PATRIOT BATTERY', short: 'PATRIOT', build: 8e6, shot: 4e6, hp: 80, range: 660,
    tag: 'Kills anything, at a price', ammo: 'per missile',
    role: 'Long-range interceptors that destroy any threat. Toggle AUTO / HEAVY ONLY so it does not waste $4M on $20K drones.',
  },
  himars: {
    name: 'HIMARS TRUCK', short: 'HIMARS', build: 6e6, shot: 1.5e6, hp: 70,
    tag: 'Hunts enemy launchers', ammo: 'per 6-rocket salvo',
    role: 'Select it, then click a red-pinged enemy launcher. Each launcher takes 3 to 4 salvos, fewer if an F-35 hits it too. A kill pays a $3M bounty and shrinks future waves.',
  },
};

const THREAT = {
  drone:     { name: 'Shahed drone',      cost: 20e3,  speed: 50,  z: 22, dmg: 7 },
  decoy:     { name: 'Decoy drone',       cost: 5e3,   speed: 56,  z: 22, dmg: 0 },
  cruise:    { name: 'Cruise missile',    cost: 800e3, speed: 125, z: 10, dmg: 18 },
  ballistic: { name: 'Ballistic missile', cost: 500e3, dmg: 34 },
};

// d = Shahed drones, x = decoys, c = cruise missiles, b = ballistic missiles
const WAVES = [
  { d: 6,  x: 2,  c: 0, b: 0 },
  { d: 10, x: 4,  c: 0, b: 0 },
  { d: 12, x: 6,  c: 1, b: 0 },
  { d: 14, x: 6,  c: 2, b: 1 },
  { d: 18, x: 8,  c: 2, b: 2 },
  { d: 20, x: 10, c: 3, b: 2 },
  { d: 24, x: 12, c: 3, b: 3 },
  { d: 28, x: 14, c: 4, b: 4 },
  { d: 32, x: 16, c: 5, b: 5 },
  { d: 40, x: 20, c: 6, b: 6 },
];

const AIR = { jets: 2, rearm: 20, strikeCost: 7e6, busterCost: 20e6, strikeDmg: 6, bunkerBounty: 5e6, bunkers: 3 };

const PADS = [{ x: 92, y: 630 }, { x: 192, y: 630 }, { x: 476, y: 630 }, { x: 800, y: 630 }, { x: 1108, y: 630 }, { x: 1208, y: 630 }];
const PT_TUBES = [[-6.5, -15], [6.5, -15], [-6.5, -2], [6.5, -2]];

// ============================== UTILS ==============================
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TAU = Math.PI * 2;
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
function turnToward(a, b, max) { return a + clamp(angDiff(b, a), -max, max); }
function shuffle(a, rnd = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function money(n, short) {
  const s = n < 0 ? '-' : ''; n = Math.abs(n);
  if (n >= 1e6) { const v = n / 1e6; const t = v.toFixed(1); return s + '$' + (short && t.endsWith('.0') ? t.slice(0, -2) : t) + 'M'; }
  if (n >= 1e3) return s + '$' + Math.round(n / 1e3) + 'K';
  return s + '$' + Math.round(n);
}
const enemyShore = (x) => 138 + 9 * Math.sin(x * 0.011) + 6 * Math.sin(x * 0.027 + 1.3) + 3 * Math.sin(x * 0.071 + 0.5);
const playerShore = (x) => 568 + 7 * Math.sin(x * 0.009 + 2) + 5 * Math.sin(x * 0.031 + 0.7) + 2.5 * Math.sin(x * 0.08);
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

// ============================== AUDIO ==============================
const SFX = (() => {
  let ac = null, out = null, nb = null, muted = false;
  const lastT = {};
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
    out = ac.createGain(); out.gain.value = muted ? 0 : 0.7;
    out.connect(comp); comp.connect(ac.destination);
    nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function can(name, gap) {
    if (!ac || muted) return false;
    const n = ac.currentTime;
    if (lastT[name] !== undefined && n - lastT[name] < gap) return false;
    lastT[name] = n; return true;
  }
  function env(p, t0, a, peak, d) { p.setValueAtTime(0.0001, t0); p.exponentialRampToValueAtTime(peak, t0 + a); p.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function noise(t0, dur, type, f0, f1, q, peak, a = 0.004) {
    const s = ac.createBufferSource(); s.buffer = nb; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + a + dur);
    const g = ac.createGain(); env(g.gain, t0, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + a + dur + 0.05);
  }
  function tone(t0, dur, type, f0, f1, peak, a = 0.004) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + a + dur);
    const g = ac.createGain(); env(g.gain, t0, a, peak, dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + a + dur + 0.05);
  }
  return {
    init,
    get muted() { return muted; },
    get ready() { return !!ac && ac.state === 'running'; },
    jet() { if (!can('jet', 0.6)) return; const t = ac.currentTime; noise(t, 2.4, 'bandpass', 260, 1500, 0.7, 0.32, 0.35); noise(t, 2.2, 'lowpass', 500, 120, 0.6, 0.28, 0.3); },
    whistle() { if (can('wh', 0.3)) tone(ac.currentTime, 0.9, 'sine', 1500, 420, 0.05, 0.08); },
    thud() { if (!can('thud', 0.2)) return; const t = ac.currentTime; tone(t, 0.6, 'sine', 70, 22, 0.9); noise(t, 0.35, 'lowpass', 400, 60, 0.6, 0.45); },
    setMuted(m) { muted = m; if (out) out.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.02); },
    ciws() {
      if (!can('ciws', 0.11)) return;
      const t = ac.currentTime;
      const s = ac.createBufferSource(); s.buffer = nb; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.9;
      const g = ac.createGain(); g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 9; i++) { const tt = t + i * 0.021; g.gain.setValueAtTime(0.3, tt); g.gain.setValueAtTime(0.015, tt + 0.01); }
      g.gain.setValueAtTime(0, t + 0.2);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + 0.22);
      tone(t, 0.18, 'square', 95, 70, 0.04);
    },
    patriot() {
      if (!can('pat', 0.08)) return;
      const t = ac.currentTime;
      tone(t, 0.4, 'sine', 120, 38, 0.6);
      noise(t, 0.3, 'lowpass', 3500, 500, 0.7, 0.45);
      noise(t + 0.02, 1.7, 'bandpass', 380, 2200, 0.8, 0.3, 0.08);
    },
    rocket() {
      if (!can('rkt', 0.05)) return;
      const t = ac.currentTime;
      tone(t, 0.28, 'sine', 150, 40, 0.6);
      noise(t, 0.5, 'lowpass', 2200, 280, 0.8, 0.4);
      noise(t + 0.01, 0.8, 'bandpass', 700, 2600, 1.2, 0.1, 0.03);
    },
    boom(p) {
      if (!can('boom', 0.045)) return;
      const t = ac.currentTime, d = 0.45 + p * 0.3;
      noise(t, d, 'lowpass', 1400 + p * 500, 90, 0.7, Math.min(0.9, 0.22 + p * 0.14));
      tone(t, d * 0.8, 'sine', 85, 26, Math.min(0.8, 0.2 + p * 0.12));
    },
    ping() {
      if (!can('ping', 0.25)) return;
      const t = ac.currentTime;
      tone(t, 0.3, 'sine', 1350, 1320, 0.22, 0.003);
      tone(t + 0.22, 0.3, 'sine', 1350, 1320, 0.08, 0.003);
      tone(t + 0.44, 0.3, 'sine', 1350, 1320, 0.03, 0.003);
    },
    siren() {
      if (!can('siren', 5)) return;
      const t = ac.currentTime;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.3);
      g.gain.setValueAtTime(0.1, t + 3.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.4);
      f.connect(g); g.connect(out);
      for (const [type, det] of [['sawtooth', 0], ['triangle', -14]]) {
        const o = ac.createOscillator(); o.type = type; o.detune.value = det;
        o.frequency.setValueAtTime(380, t);
        for (let k = 0; k < 3; k++) { o.frequency.linearRampToValueAtTime(860, t + k * 1.45 + 0.75); o.frequency.linearRampToValueAtTime(380, t + k * 1.45 + 1.45); }
        o.connect(f); o.start(t); o.stop(t + 4.5);
      }
    },
    click() { if (can('click', 0.04)) tone(ac.currentTime, 0.05, 'square', 900, 900, 0.05); },
    err() { if (can('err', 0.15)) tone(ac.currentTime, 0.16, 'square', 170, 140, 0.08); },
    cash() { if (!can('cash', 0.2)) return; const t = ac.currentTime; tone(t, 0.1, 'triangle', 1100, 1100, 0.15); tone(t + 0.09, 0.2, 'triangle', 1650, 1650, 0.15); },
    build() { if (!can('build', 0.1)) return; const t = ac.currentTime; noise(t, 0.35, 'lowpass', 900, 150, 0.7, 0.35); tone(t, 0.1, 'square', 300, 300, 0.04); tone(t + 0.1, 0.12, 'square', 450, 450, 0.04); },
  };
})();

// ============================== CANVAS ==============================
const stage = document.getElementById('stage');
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let VS = 1, DPR = 1, PX = 1;
let bgCanvas = null, vignette = null;

function resize() {
  VS = Math.min(window.innerWidth / W, window.innerHeight / H);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  PX = VS * DPR;
  stage.style.transform = `translate(-50%,-50%) scale(${VS})`;
  cv.width = Math.max(1, Math.round(W * PX)); cv.height = Math.max(1, Math.round(H * PX));
  bgCanvas = renderBackground();
  vignette = renderVignette();
}

function softSprite(r, g, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
}
const SPR = {
  white: softSprite(255, 255, 255), smoke: softSprite(205, 209, 213), grey: softSprite(120, 124, 128),
  dark: softSprite(34, 32, 30), dust: softSprite(140, 120, 95), fire: softSprite(255, 120, 30),
  yellow: softSprite(255, 214, 120), red: softSprite(255, 50, 35), light: softSprite(255, 160, 70),
  cyan: softSprite(90, 220, 255), steam: softSprite(225, 232, 238),
};

// ============================== PARTICLES ==============================
let parts = [];
const MAXP = 3000;
function P(o) {
  if (parts.length >= MAXP) return null;
  o.age = 0; if (o.a0 === undefined) o.a0 = 1; if (o.s1 === undefined) o.s1 = o.s0;
  o.vx = o.vx || 0; o.vy = o.vy || 0; parts.push(o); return o;
}
function updateParticles(dt) {
  let w = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]; p.age += dt;
    if (p.age >= p.life) continue;
    if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; }
    if (p.wind) p.vx += p.wind * dt;
    if (p.grav) p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.k === 'debris') {
      p.vz -= 420 * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
      if (p.z <= 0) { p.z = 0; p.vz *= -0.25; p.vx *= 0.5; p.vy *= 0.5; p.vr *= 0.5; if (Math.abs(p.vz) < 25) { p.vz = 0; p.vx = 0; p.vy = 0; p.vr = 0; } }
    }
    parts[w++] = p;
  }
  parts.length = w;
}
function drawParticles(additive) {
  ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
  ctx.lineCap = 'round';
  for (const p of parts) {
    if (!!p.add !== additive) continue;
    const t = p.age / p.life;
    let a = p.a0 * (1 - t);
    if (p.fadeIn) a *= Math.min(1, t * 6);
    if (a <= 0.004) continue;
    const s = p.s0 + (p.s1 - p.s0) * t;
    ctx.globalAlpha = a;
    switch (p.k) {
      case 'soft': ctx.drawImage(p.spr, p.x - s, p.y - s, s * 2, s * 2); break;
      case 'line':
        ctx.strokeStyle = p.c; ctx.lineWidth = p.w || 1.5;
        ctx.beginPath(); ctx.moveTo(p.x - p.vx * p.len, p.y - p.vy * p.len); ctx.lineTo(p.x, p.y); ctx.stroke(); break;
      case 'ring':
        ctx.strokeStyle = p.c; ctx.lineWidth = (p.w || 2) * (1 - t) + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.stroke(); break;
      case 'debris':
        ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6); ctx.restore(); break;
      case 'dot': ctx.fillStyle = p.c; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); break;
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function puff(x, y, o = {}) { return P(Object.assign({ k: 'soft', spr: SPR.grey, x, y, life: 2, s0: 4, s1: 16, a0: 0.4, drag: 0.8, wind: 6, vy: -6, fadeIn: true }, o)); }
function light(x, y, size, life = 0.25, a = 0.8, spr = SPR.light) { P({ k: 'soft', spr, add: true, x, y, life, s0: size, s1: size * 1.25, a0: a }); }

let shake = 0, slowT = 0, flashA = 0;
function addShake(v) { shake = Math.min(14, shake + v); }
function slowmo(t) { slowT = Math.max(slowT, t); }

function explode(x, y, p, air = false) {
  light(x, y, 45 * p, 0.3 + p * 0.07, 0.85);
  P({ k: 'soft', spr: SPR.white, add: true, x, y, life: 0.13, s0: 8 * p, s1: 20 * p, a0: 1 });
  const nf = Math.round(7 * p);
  for (let i = 0; i < nf; i++) {
    const a = rand(0, TAU), sp = rand(15, 70) * p;
    P({ k: 'soft', spr: Math.random() < 0.4 ? SPR.yellow : SPR.fire, add: true, x: x + rand(-3, 3) * p, y: y + rand(-3, 3) * p,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75 - 8 * p, drag: 3.5, life: rand(0.3, 0.7) + p * 0.12, s0: rand(5, 9) * p, s1: rand(1, 3) * p, a0: 0.95 });
  }
  const ns = Math.round(5 * p);
  for (let i = 0; i < ns; i++) {
    const a = rand(0, TAU), sp = rand(8, 35) * p;
    P({ k: 'soft', spr: air ? SPR.grey : SPR.dark, x: x + rand(-4, 4) * p, y: y + rand(-4, 4) * p,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - rand(4, 14), drag: 1.6, wind: 5,
      life: rand(1.6, 3.2) + p * 0.5, s0: 5 * p, s1: rand(14, 24) * p, a0: air ? 0.45 : 0.7, fadeIn: true });
  }
  const nk = Math.round(9 * p);
  for (let i = 0; i < nk; i++) {
    const a = rand(0, TAU), sp = rand(140, 380) * Math.sqrt(p);
    P({ k: 'line', add: true, c: 'rgb(255,200,120)', w: 1.4, len: 0.03, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: rand(0.25, 0.6) });
  }
  P({ k: 'ring', add: true, c: 'rgb(255,215,170)', w: 3, x, y, life: 0.4 + p * 0.05, s0: 3, s1: 26 * p, a0: 0.7 });
  if (!air) {
    for (let i = 0; i < Math.round(5 * p); i++) {
      const a = rand(0, TAU), sp = rand(20, 70) * p;
      P({ k: 'debris', c: pick(['#2a2622', '#3d352c', '#555', '#6b5a48']), x, y, z: 2, vz: rand(90, 220) * Math.sqrt(p),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, rot: rand(0, 6), vr: rand(-12, 12), life: rand(1.4, 2.4), s0: rand(2, 4) * Math.sqrt(p), a0: 1 });
    }
    scorch(x, y, 6 + 5 * p);
  }
  addShake(p * (air ? 1.1 : 2.2));
  SFX.boom(p);
}

// ============================== STATE ==============================
let S;
function newState() {
  const s = {
    mode: 'menu', paused: false, time: 0,
    treasury: CFG.startTreasury, wave: 0, prepT: CFG.firstPrep, queue: [], waveT: 0, salvoL: {},
    incomeT: 0, steamT: 0,
    threats: [], missiles: [], rockets: [], fires: [], scorches: [], popups: [], timers: [],
    pads: [null, null, null, null, null, null], launchers: [], buildings: [], banner: null,
    bunkers: [], jets: [], bombs: [], demo: false, carrier: { type: 'carrier', x: 300, y: 496, slots: [] },
    result: null, loseQueued: false, waveStart: { your: 0, enemy: 0 },
    stats: {
      your: 0, enemy: 0, build: 0, patriot: 0, ciws: 0, himars: 0, income: 0, bounty: 0, bonus: 0,
      air: 0, strikes: 0, busters: 0, bunkersKilled: 0,
      patriotShots: 0, patriotWaste: 0, ciwsBursts: 0, salvos: 0, hits: 0, launchersKilled: 0,
      launched: { drone: 0, decoy: 0, cruise: 0, ballistic: 0 }, killed: { drone: 0, decoy: 0, cruise: 0, ballistic: 0 },
    },
    radarA: 0,
    ships: [
      { x: 200, y: 305, dir: 1, spd: 9, len: 100 },
      { x: 1000, y: 438, dir: -1, spd: 7, len: 116 },
    ],
    dashes: [],
  };
  for (let i = 0; i < 70; i++) s.dashes.push({ x: rand(0, W), y: rand(175, 545), len: rand(8, 26), spd: rand(4, 10), ph: rand(0, TAU) });
  s.buildings = [makePower(), makeCity(), makeRefinery()];
  for (let i = 0; i < CFG.launchers; i++) { const L = { kind: 'launcher', id: i, hp: 14, max: 14, alive: true, revealed: false, revealT: 0, gen: 0, pingT: 0, x: 0, y: 0, rot: 0, fade: 0 }; s.launchers.push(L); }
  for (let i = 0; i < AIR.jets; i++) s.carrier.slots.push({ state: 'ready', t: 0 });
  for (let i = 0; i < AIR.bunkers; i++) s.bunkers.push({ kind: 'bunker', id: i, alive: true, known: false, revealed: false, revealT: 0, pingT: 0, fade: 0, x: 0, y: 0, gen: 0 });
  return s;
}

// ============================== WORLD: BACKGROUND ==============================
function renderBackground() {
  const c = document.createElement('canvas'); c.width = Math.round(W * PX); c.height = Math.round(H * PX);
  const g = c.getContext('2d'); g.scale(PX, PX);
  const r = mulberry32(1337);
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#071a2c'); gr.addColorStop(0.5, '#0a2339'); gr.addColorStop(1, '#061626');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '60,120,160'},${0.02 + r() * 0.03})`;
    g.beginPath(); g.ellipse(r() * W, 140 + r() * 440, 20 + r() * 90, 4 + r() * 14, 0, 0, TAU); g.fill();
  }
  const shorePath = (f) => { g.beginPath(); for (let x = 0; x <= W; x += 8) { const y = f(x); x ? g.lineTo(x, y) : g.moveTo(x, y); } };
  for (let i = 6; i >= 1; i--) {
    g.strokeStyle = 'rgba(50,140,150,0.035)'; g.lineWidth = i * 12;
    shorePath(enemyShore); g.stroke(); shorePath(playerShore); g.stroke();
  }
  // radar grid
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { g.strokeStyle = x % 160 === 0 ? 'rgba(80,200,255,0.085)' : 'rgba(80,200,255,0.035)'; g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y <= H; y += 40) { g.strokeStyle = y % 160 === 0 ? 'rgba(80,200,255,0.085)' : 'rgba(80,200,255,0.035)'; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  g.setLineDash([4, 7]);
  for (const R of [180, 360, 540]) { g.strokeStyle = 'rgba(80,200,255,0.09)'; g.beginPath(); g.arc(640, 690, R, Math.PI, TAU); g.stroke(); }
  // shipping lanes
  g.setLineDash([18, 14]); g.strokeStyle = 'rgba(255,200,90,0.07)';
  for (const y of [282, 458]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.setLineDash([]);
  g.textAlign = 'center'; g.font = '600 30px ' + FONT; g.fillStyle = 'rgba(120,190,230,0.065)';
  g.fillText('S T R A I T    O F    H O R M U Z', W / 2, 372);
  g.font = '11px ' + MONO; g.fillStyle = 'rgba(120,190,230,0.28)';
  g.textAlign = 'left'; g.fillText("26°34'N  56°15'E", 12, 548); g.fillText('INBOUND TRAFFIC LANE', 12, 276);
  g.textAlign = 'right'; g.fillText('SECTOR 7 · AIR DEFENSE GRID', W - 12, 548); g.fillText('OUTBOUND TRAFFIC LANE', W - 12, 452);

  // enemy land
  g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0);
  for (let x = W; x >= 0; x -= 6) g.lineTo(x, enemyShore(x));
  g.closePath();
  gr = g.createLinearGradient(0, 0, 0, 170); gr.addColorStop(0, '#29231a'); gr.addColorStop(1, '#3b3324');
  g.fillStyle = gr; g.fill(); g.clip();
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '190,160,110'},${0.04 + r() * 0.06})`; g.fillRect(r() * W, r() * 170, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.12})`; g.lineWidth = 1 + r() * 2;
    let x = r() * W, y = 60 + r() * 70; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 7; j++) { x += 10 + r() * 25; y += (r() - 0.5) * 12; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(15,13,10,0.55)'; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= W; x += 10) { const y = enemyShore(x) - 24 + 6 * Math.sin(x * 0.02); x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = 'rgba(4,7,12,0.5)'; g.fillRect(0, 0, W, 180);
  g.strokeStyle = 'rgba(255,60,60,0.035)'; g.lineWidth = 1;
  for (let x = -200; x < W; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 180, 180); g.stroke(); }
  g.restore();
  g.strokeStyle = 'rgba(200,230,240,0.22)'; g.lineWidth = 1.5; shorePath(enemyShore); g.stroke();
  g.font = '600 11px ' + MONO; g.fillStyle = 'rgba(255,90,80,0.5)'; g.textAlign = 'left';
  g.fillText('HOSTILE COAST · MOBILE LAUNCHERS · POSITIONS UNKNOWN (FOG OF WAR)', 14, HUD_H + 16);

  // player land
  g.save(); g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, playerShore(x));
  g.lineTo(W, H); g.closePath();
  gr = g.createLinearGradient(0, 560, 0, H); gr.addColorStop(0, '#1e2a23'); gr.addColorStop(1, '#121915');
  g.fillStyle = gr; g.fill(); g.clip();
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '120,150,110'},${0.04 + r() * 0.05})`; g.fillRect(r() * W, 555 + r() * 170, 1 + r() * 3, 1 + r() * 3); }
  g.strokeStyle = 'rgba(170,155,115,0.28)'; g.lineWidth = 7; g.beginPath();
  for (let x = 0; x <= W; x += 8) { const y = playerShore(x) + 4; x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = '#191c1e'; g.fillRect(0, 706, W, 12);
  g.strokeStyle = 'rgba(230,200,90,0.35)'; g.setLineDash([10, 10]); g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 712); g.lineTo(W, 712); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#191c1e';
  for (const p of PADS) g.fillRect(p.x - 4, p.y + 26, 8, 706 - p.y - 26);
  for (const x of [330, 640, 950]) g.fillRect(x - 5, 704, 10, 4);
  g.restore();
  g.strokeStyle = 'rgba(200,230,240,0.25)'; g.lineWidth = 1.5; shorePath(playerShore); g.stroke();
  return c;
}

function renderVignette() {
  const c = document.createElement('canvas'); c.width = Math.round(W * PX); c.height = Math.round(H * PX);
  const g = c.getContext('2d'); g.scale(PX, PX);
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
}

// ============================== WORLD: BUILDINGS ==============================
function makePower() {
  return { id: 'power', name: 'POWER PLANT', x: 330, y: 664, w: 150, h: 80, income: 200e3, hp: 100, max: 100, hits: [], fires: [], seed: 11,
    towers: [{ dx: 22, dy: -12, r: 21, th: 0.3 }, { dx: 54, dy: 14, r: 18, th: 0.6 }] };
}
function makeCity() {
  const r = mulberry32(99);
  const b = { id: 'city', name: 'COASTAL CITY', x: 640, y: 664, w: 194, h: 88, income: 300e3, hp: 100, max: 100, hits: [], fires: [], seed: 3, blocks: [], streetLights: [] };
  const cols = 5, rows = 3, n = cols * rows, thr = [];
  for (let i = 0; i < n; i++) thr.push((i + 0.5) / n);
  shuffle(thr, r);
  const cw = 194 / cols, ch = 88 / rows;
  let i = 0;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const w = cw - 7 - r() * 6, h = ch - 7 - r() * 5;
    const x = -97 + col * cw + 3.5 + r() * (cw - 7 - w), y = -44 + row * ch + 3.5 + r() * (ch - 7 - h);
    const sh = (46 + r() * 30) | 0;
    const k = { x, y, w, h, hgt: 3 + r() * 9, col: `rgb(${sh},${sh + 6},${sh + 14})`, thr: thr[i++], seed: (r() * 1000) | 0, lights: [], det: [] };
    const nl = (5 + r() * 8) | 0;
    for (let j = 0; j < nl; j++) k.lights.push([1 + r() * (w - 3), 1 + r() * (h - 3), 0.3 + r() * 1.5, r() * 6.28, r()]);
    const nd = (1 + r() * 3) | 0;
    for (let j = 0; j < nd; j++) k.det.push([2 + r() * (w - 8), 2 + r() * (h - 8), 3 + r() * 4, 2 + r() * 3]);
    b.blocks.push(k);
  }
  for (let j = 0; j < 30; j++) b.streetLights.push([-95 + r() * 190, -42 + r() * 84]);
  return b;
}
function makeRefinery() {
  return { id: 'refinery', name: 'OIL REFINERY', x: 950, y: 664, w: 170, h: 80, income: 500e3, hp: 100, max: 100, hits: [], fires: [], seed: 7,
    tanks: [{ dx: -61, dy: -17, r: 16, alive: true }, { dx: -23, dy: -17, r: 16, alive: true }, { dx: -61, dy: 18, r: 16, alive: true }, { dx: -23, dy: 18, r: 15, alive: true }] };
}

function powerLevel() {
  const pp = S.buildings[0];
  if (pp.hp <= 0) return 0.06;
  const r = pp.hp / pp.max;
  let v = 0.4 + 0.6 * r;
  if (r < 0.5 && Math.sin(S.time * 17) + Math.sin(S.time * 7.3) > 1.5) v *= 0.25;
  return v;
}

function rubble(g, x, y, R, seed) {
  const r = mulberry32(seed | 0);
  g.fillStyle = '#211d1a'; g.beginPath();
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr2 = R * (0.6 + r() * 0.45); const px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2 * 0.85; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fill();
  for (let i = 0; i < 7; i++) { g.fillStyle = r() < 0.5 ? '#3d3833' : '#4a4540'; g.fillRect(x + (r() - 0.5) * R * 1.2, y + (r() - 0.5) * R, 2 + r() * 4, 2 + r() * 3); }
  for (let i = 0; i < 3; i++) {
    const ex = x + (r() - 0.5) * R, ey = y + (r() - 0.5) * R * 0.8; const f = 0.5 + 0.5 * Math.sin(S.time * (3 + i) + seed);
    g.fillStyle = `rgba(255,${(90 + f * 80) | 0},30,${0.35 + 0.5 * f})`; g.fillRect(ex, ey, 1.8, 1.8);
  }
}

function metal(g, x, y, R, c0 = '#c9ced1', c1 = '#6f777b') {
  g.fillStyle = 'rgba(0,0,0,0.45)'; circle(g, x + 3, y + 4, R);
  const gr = g.createRadialGradient(x - R * 0.4, y - R * 0.4, 1, x, y, R);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; circle(g, x, y, R);
}

function drawPower(g, b) {
  const r = b.hp / b.max, dead = b.hp <= 0;
  g.save(); g.translate(b.x, b.y);
  g.fillStyle = '#22282a'; rr(g, -75, -40, 150, 80, 5); g.fill();
  g.strokeStyle = 'rgba(140,200,230,0.10)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#1a1f21'; g.fillRect(-70, 13, 58, 23);
  g.strokeStyle = 'rgba(180,200,210,0.35)'; g.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) g.strokeRect(-66 + i * 11, 17, 7, 15);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-63, -29, 60, 40);
  g.fillStyle = dead ? '#2c2f30' : '#4d565b'; g.fillRect(-68, -34, 60, 40);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(-68 + i * 10, -34); g.lineTo(-68 + i * 10, 6); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(-68, -34, 60, 2.5);
  if (dead) rubble(g, -38, -14, 26, 41);
  g.fillStyle = 'rgba(0,0,0,0.45)'; circle(g, -8, -18, 6);
  g.fillStyle = '#b9bec0'; circle(g, -12, -24, 6); g.fillStyle = '#b8322a'; circle(g, -12, -24, 4.2); g.fillStyle = '#111'; circle(g, -12, -24, 2.6);
  for (const t of b.towers) {
    if (dead || r < t.th) { rubble(g, t.dx, t.dy, t.r, b.seed + t.dx); continue; }
    metal(g, t.dx, t.dy, t.r, '#c3c9cc', '#6a7276');
    g.fillStyle = '#1b2023'; circle(g, t.dx, t.dy, t.r * 0.64);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(t.dx, t.dy, t.r * 0.64, 0, TAU); g.stroke();
  }
  g.restore();
}

function drawCity(g, b) {
  const r = b.hp / b.max, pw = powerLevel();
  g.save(); g.translate(b.x, b.y);
  g.fillStyle = '#171c20'; rr(g, -97, -44, 194, 88, 4); g.fill();
  g.strokeStyle = 'rgba(140,200,230,0.10)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = `rgba(255,200,120,${0.2 + 0.6 * pw})`;
  for (const sl of b.streetLights) g.fillRect(sl[0] - 0.8, sl[1] - 0.8, 1.6, 1.6);
  for (const k of b.blocks) {
    if (r > k.thr) {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(k.x + k.hgt * 0.5, k.y + k.hgt * 0.6, k.w, k.h);
      g.fillStyle = k.col; g.fillRect(k.x, k.y, k.w, k.h);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(k.x, k.y, k.w, 1.5); g.fillRect(k.x, k.y, 1.5, k.h);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (const d of k.det) g.fillRect(k.x + d[0], k.y + d[1], d[2], d[3]);
      for (const L of k.lights) {
        const fl = pw * (0.55 + 0.45 * Math.sin(S.time * L[2] + L[3]));
        if (fl < 0.08) continue;
        g.fillStyle = `rgba(255,${(200 + L[4] * 40) | 0},${(120 + L[4] * 90) | 0},${fl})`;
        g.fillRect(k.x + L[0], k.y + L[1], 1.8, 1.8);
      }
    } else rubble(g, k.x + k.w / 2, k.y + k.h / 2, Math.max(k.w, k.h) * 0.55, k.seed);
  }
  g.restore();
}

function drawRefinery(g, b) {
  const dead = b.hp <= 0;
  g.save(); g.translate(b.x, b.y);
  g.fillStyle = '#1f2324'; rr(g, -85, -40, 170, 80, 4); g.fill();
  g.strokeStyle = 'rgba(140,200,230,0.10)'; g.lineWidth = 1; g.stroke();
  g.strokeStyle = '#3b4142'; g.lineWidth = 2; g.strokeRect(-81, -37, 80, 74);
  g.strokeStyle = dead ? '#3a3532' : '#6c7478'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-2, -2); g.lineTo(64, -2); g.moveTo(-2, 3); g.lineTo(64, 3);
  g.moveTo(14, -2); g.lineTo(14, -24); g.moveTo(40, 3); g.lineTo(40, 24); g.moveTo(-23, -2); g.lineTo(-2, -2); g.stroke();
  for (const [x, y, R] of [[14, -24, 7], [30, -26, 5], [44, -20, 6], [40, 24, 8], [62, 22, 6], [20, 22, 5]]) {
    if (dead) { rubble(g, x, y, R + 2, x * 7 + y); continue; }
    metal(g, x, y, R, '#b7bdc0', '#5d6569');
  }
  g.fillStyle = '#8a8f92'; circle(g, 68, -30, 3.2);
  for (const t of b.tanks) {
    if (t.alive) {
      metal(g, t.dx, t.dy, t.r, '#d0d4d6', '#7b8388');
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; g.beginPath(); g.arc(t.dx, t.dy, t.r * 0.68, 0, TAU); g.stroke();
      g.fillStyle = '#9aa1a5'; circle(g, t.dx, t.dy, 2.2);
    } else {
      const rn = mulberry32(t.dx * 13 + t.dy);
      g.fillStyle = '#120f0d'; g.beginPath();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, q = t.r * (0.85 + rn() * 0.35); i ? g.lineTo(t.dx + Math.cos(a) * q, t.dy + Math.sin(a) * q) : g.moveTo(t.dx + Math.cos(a) * q, t.dy + Math.sin(a) * q); }
      g.closePath(); g.fill();
      const f = 0.5 + 0.5 * Math.sin(S.time * 6 + t.dx);
      g.strokeStyle = `rgba(255,${(90 + f * 70) | 0},30,${0.35 + 0.3 * f})`; g.lineWidth = 2;
      g.beginPath(); g.arc(t.dx, t.dy, t.r * 0.7, 0, TAU); g.stroke();
    }
  }
  g.restore();
}

function drawBuilding(b) {
  if (b.id === 'power') drawPower(ctx, b); else if (b.id === 'city') drawCity(ctx, b); else drawRefinery(ctx, b);
  ctx.globalAlpha = 0.65;
  for (const h of b.hits) ctx.drawImage(SPR.dark, b.x + h.dx - h.r, b.y + h.dy - h.r, h.r * 2, h.r * 2);
  ctx.globalAlpha = 1;
}

function addFire(x, y, int, life) { const f = { x, y, int, a1: 0, a2: 0, seed: rand(0, 100), life }; S.fires.push(f); return f; }
function updateFires(dt) {
  for (const f of S.fires) {
    let int = f.int;
    if (f.life !== undefined) { f.life -= dt; int *= clamp(f.life / 3, 0, 1); }
    f.a1 += dt * 14 * int; f.a2 += dt * 3.2 * int;
    while (f.a1 > 1) { f.a1--; P({ k: 'soft', spr: Math.random() < 0.3 ? SPR.yellow : SPR.fire, add: true, x: f.x + rand(-5, 5) * int, y: f.y + rand(-2, 2), vx: rand(-6, 6), vy: rand(-30, -14) * int, drag: 1, life: rand(0.35, 0.7), s0: rand(4, 7) * int, s1: 1, a0: 0.8 }); }
    while (f.a2 > 1) { f.a2--; P({ k: 'soft', spr: SPR.dark, x: f.x + rand(-4, 4), y: f.y - 8 * int, vx: rand(-3, 3), vy: rand(-22, -12), wind: 9, drag: 0.2, life: rand(3, 5), s0: 6 * int, s1: rand(22, 34) * int, a0: 0.55, fadeIn: true }); }
  }
  S.fires = S.fires.filter((f) => f.life === undefined || f.life > 0);
}
function scorch(x, y, r) { S.scorches.push({ x, y, r }); if (S.scorches.length > 90) S.scorches.shift(); }

function damageBuilding(b, dmg, x, y) {
  if (b.hp <= 0) return;
  b.hp = Math.max(0, b.hp - dmg);
  const ratio = b.hp / b.max;
  S.stats.hits++;
  b.hits.push({ dx: x - b.x, dy: y - b.y, r: rand(7, 12) }); if (b.hits.length > 16) b.hits.shift();
  const want = Math.ceil((1 - ratio) * 5);
  if (b.fires.length < want) b.fires.push(addFire(x, y, 0.6 + (1 - ratio) * 0.6));
  for (const f of b.fires) f.int = Math.min(1.6, f.int + 0.08);
  popup(b.x, b.y - 30, `${b.name} HIT  -${dmg}%`, '#ff6b5a', 12);
  if (b.id === 'refinery') {
    const wantDead = Math.min(4, Math.floor((1 - ratio) * 4 + 0.0001));
    let dead = b.tanks.filter((t) => !t.alive).length;
    while (dead < wantDead) {
      let best = null, bd = 1e9;
      for (const t of b.tanks) if (t.alive) { const d = dist(b.x + t.dx, b.y + t.dy, x, y); if (d < bd) { bd = d; best = t; } }
      if (!best) break;
      best.alive = false; dead++;
      tankBlast(b.x + best.dx, b.y + best.dy);
    }
  }
  if (b.hp <= 0) destroyBuilding(b);
}
function tankBlast(x, y) {
  later(0.15, () => {
    explode(x, y, 3);
    for (let k = 0; k < 22; k++) P({ k: 'soft', spr: Math.random() < 0.4 ? SPR.yellow : SPR.fire, add: true, x: x + rand(-10, 10), y: y + rand(-6, 6), vx: rand(-15, 15), vy: -rand(40, 130), drag: 1.2, life: rand(0.8, 1.5), s0: rand(10, 18), s1: 3, a0: 0.9 });
    light(x, y, 160, 0.6, 0.7);
    addFire(x, y, 1.6);
    popup(x, y - 22, 'OIL TANK ABLAZE', '#ff8c42', 14);
    slowmo(0.3); addShake(5);
  });
}
function destroyBuilding(b) {
  banner(`${b.name} DESTROYED`, `Lost ${money(b.income)} income every 5 seconds`, '#ff4d4d', 3);
  flashA = Math.max(flashA, 0.3); slowmo(0.5);
  demoEvent(b.x, b.y - 20, 1.6, 3, 8);
  for (let i = 0; i < 6; i++) later(i * 0.22, () => explode(b.x + rand(-b.w * 0.4, b.w * 0.4), b.y + rand(-b.h * 0.35, b.h * 0.35), rand(2.2, 3.4)));
  for (const f of b.fires) f.int = 1.6;
  if (b.fires.length < 4) for (let i = b.fires.length; i < 4; i++) b.fires.push(addFire(b.x + rand(-b.w * 0.35, b.w * 0.35), b.y + rand(-b.h * 0.3, b.h * 0.3), 1.3));
}

// ============================== UNITS ==============================
function makeUnit(type, pad) {
  const p = PADS[pad], U = UNIT[type];
  return { type, pad, x: p.x, y: p.y, hp: U.hp, max: U.hp, cd: 0.6, aim: -Math.PI / 2, mode: 'auto',
    tubes: [1, 1, 1, 1], tubeT: 3.2, loaded: 6, reload: 0, salvo: null, podAim: 0, target: null, dead: false, born: S.time };
}

function drawCIWS(g, u, t) {
  g.save(); g.translate(u.x, u.y);
  g.fillStyle = 'rgba(0,0,0,0.4)'; circle(g, 3, 4, 18);
  g.fillStyle = '#4b5257'; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.39; i ? g.lineTo(Math.cos(a) * 18, Math.sin(a) * 18) : g.moveTo(Math.cos(a) * 18, Math.sin(a) * 18); }
  g.closePath(); g.fill(); g.strokeStyle = '#2d3236'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#3a4045'; circle(g, 0, 0, 12);
  g.translate(0, -6); g.rotate(u.aim);
  g.fillStyle = '#262a2d'; g.fillRect(4, -2.4, 22, 4.8);
  g.fillStyle = '#1a1d1f'; g.fillRect(22, -2.8, 4, 5.6);
  g.fillStyle = '#5d666c'; g.fillRect(-9, -8, 13, 16);
  const gr = g.createRadialGradient(-4, -3, 1, -2, 0, 10);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#9ea6ab');
  g.fillStyle = gr; circle(g, -2, 0, 9);
  g.restore();
}
function drawPatriot(g, u) {
  g.save(); g.translate(u.x, u.y);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-11, -21, 28, 52);
  g.fillStyle = '#1a1d18';
  for (const [x, y] of [[-16, -14], [13, -14], [-16, 6], [13, 6], [-16, 20], [13, 20]]) g.fillRect(x, y, 3, 8);
  g.fillStyle = '#3b4636'; rr(g, -13, -22, 26, 52, 3); g.fill();
  g.fillStyle = '#4a5743'; g.fillRect(-11, 17, 22, 12);
  g.fillStyle = '#121812'; g.fillRect(-9, 25, 18, 3);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-11, -21, 28, 30);
  g.fillStyle = '#56644c'; rr(g, -14, -25, 28, 30, 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(-14, -25, 28, 2);
  for (let i = 0; i < 4; i++) {
    const [x, y] = PT_TUBES[i];
    g.fillStyle = '#20261d'; g.fillRect(x - 5.5, y - 5.5, 11, 11);
    if (u.tubes[i]) { g.fillStyle = '#8c9a80'; g.fillRect(x - 4, y - 4, 8, 8); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 4, y + 2, 8, 2); }
    else { g.fillStyle = '#060806'; g.fillRect(x - 4, y - 4, 8, 8); }
  }
  g.restore();
}
function drawHimars(g, u) {
  g.save(); g.translate(u.x, u.y);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-8, -21, 24, 52);
  g.fillStyle = '#1a1d18';
  for (const [x, y] of [[-14, -18], [11, -18], [-14, 4], [11, 4], [-14, 16], [11, 16]]) g.fillRect(x, y, 3, 8);
  g.fillStyle = '#4d5842'; rr(g, -11, -24, 22, 50, 3); g.fill();
  g.fillStyle = '#5c6950'; g.fillRect(-10, -24, 20, 13);
  g.fillStyle = '#121812'; g.fillRect(-8, -22, 16, 4);
  g.fillStyle = 'rgba(160,200,230,0.25)'; g.fillRect(-7, -22, 5, 2);
  g.translate(0, 8); g.rotate(u.podAim);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-6, -10, 20, 28);
  g.fillStyle = '#67745a'; rr(g, -9, -13, 18, 26, 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.stroke();
  for (let i = 0; i < 6; i++) {
    const x = i % 2 ? 4.2 : -4.2, y = -8 + Math.floor(i / 2) * 8;
    g.fillStyle = i < u.loaded ? '#2a3123' : '#050605'; circle(g, x, y, 3);
    if (i < u.loaded) { g.fillStyle = '#9aa78c'; circle(g, x, y, 1.4); }
  }
  g.restore();
}
function drawUnit(u) {
  const age = S.time - u.born;
  const sc = age < 0.35 ? 1 + (0.35 - age) * 1.2 : 1;
  ctx.save();
  if (sc !== 1) { ctx.translate(u.x, u.y); ctx.scale(sc, sc); ctx.translate(-u.x, -u.y); ctx.globalAlpha = clamp(age / 0.2, 0, 1); }
  if (u.type === 'ciws') drawCIWS(ctx, u); else if (u.type === 'patriot') drawPatriot(ctx, u); else drawHimars(ctx, u);
  ctx.restore();
}

function unitIcon(type) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.scale(2, 2);
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(90,210,255,0.18)'); gr.addColorStop(1, 'rgba(90,210,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const u = { x: 32, y: 32, aim: -Math.PI / 2 - 0.5, tubes: [1, 1, 1, 1], loaded: 6, podAim: 0.3 };
  if (type === 'ciws') drawCIWS(g, u); else if (type === 'patriot') drawPatriot(g, u); else drawHimars(g, u);
  return c.toDataURL();
}
let ICONS = {};

function spend(amount, cat) { S.treasury -= amount; S.stats[cat] += amount; S.stats.your += amount; }

function updateUnits(dt) {
  for (const u of S.pads) {
    if (!u) continue;
    if (u.type === 'ciws') updCIWS(u, dt); else if (u.type === 'patriot') updPatriot(u, dt); else updHimars(u, dt);
  }
}

// ---- CIWS ----
function updCIWS(u, dt) {
  u.cd -= dt;
  const R = UNIT.ciws.range, ox = u.x, oy = u.y - 6;
  const t0 = u.target;
  if (!t0 || !t0.alive || dist(ox, oy, t0.sx, t0.sy) > R) {
    u.target = null; let bd = 1e9;
    for (const t of S.threats) {
      if (!t.alive || (t.type !== 'drone' && t.type !== 'cruise')) continue;
      const d = dist(ox, oy, t.sx, t.sy);
      if (d < R && d < bd) { bd = d; u.target = t; }
    }
  }
  const t = u.target;
  if (!t) { u.aim += Math.sin(S.time * 0.7 + u.pad) * 0.4 * dt; return; }
  const ta = Math.atan2(t.sy - oy, t.sx - ox);
  u.aim = turnToward(u.aim, ta, 10 * dt);
  if (Math.abs(angDiff(u.aim, ta)) < 0.2 && u.cd <= 0) { u.cd = 0.2; ciwsBurst(u, t); }
}
function ciwsBurst(u, t) {
  spend(UNIT.ciws.shot, 'ciws'); S.stats.ciwsBursts++; t.spent += UNIT.ciws.shot;
  const ca = Math.cos(u.aim), sa = Math.sin(u.aim);
  const mx = u.x + ca * 26, my = u.y - 6 + sa * 26;
  const d = dist(mx, my, t.sx, t.sy);
  for (let i = 0; i < 5; i++) {
    const a = u.aim + rand(-0.05, 0.05), sp = 1600;
    P({ k: 'line', add: true, c: 'rgb(255,226,120)', w: 1.6, len: 0.012, x: mx - Math.cos(a) * i * 16, y: my - Math.sin(a) * i * 16,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: Math.min(0.5, (d + i * 16 + rand(-10, 40)) / sp), a0: 0.95 });
  }
  light(mx, my, 16, 0.07, 0.95, SPR.yellow);
  P({ k: 'dot', c: '#d8b25a', x: u.x - sa * 8, y: u.y - 6 + ca * 8, vx: -sa * rand(30, 60), vy: ca * rand(30, 60) + 10, drag: 3, life: 0.5, s0: 1.6 });
  SFX.ciws();
  const hitP = t.type === 'drone' ? 0.42 : 0.11;
  if (Math.random() < hitP) {
    for (let i = 0; i < 4; i++) { const a = rand(0, TAU); P({ k: 'line', add: true, c: 'rgb(255,240,180)', w: 1.2, len: 0.02, x: t.sx, y: t.sy, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, drag: 4, life: 0.25 }); }
    t.hp--; if (t.hp <= 0) killThreat(t, 'ciws');
  }
}

// ---- Patriot ----
function updPatriot(u, dt) {
  u.cd -= dt;
  const empty = u.tubes.indexOf(0);
  if (empty >= 0) { u.tubeT -= dt; if (u.tubeT <= 0) { u.tubes[empty] = 1; u.tubeT = 4; } } else u.tubeT = 4;
  if (u.cd > 0 || !u.tubes.includes(1)) return;
  let best = null, bs = -1e9;
  for (const t of S.threats) {
    if (!t.alive || t.engaged > 0 || t.sy < HUD_H + 20) continue;
    const heavy = t.type === 'ballistic' || t.type === 'cruise';
    if (u.mode === 'heavy' && !heavy) continue;
    if (t.type === 'ballistic' && t.T < 0.45) continue;
    if (dist(u.x, u.y, t.sx, t.sy) > UNIT.patriot.range) continue;
    const s = (t.type === 'ballistic' ? 3000 : t.type === 'cruise' ? 2000 : 1000) - dist(t.x, t.y, t.tx, t.ty);
    if (s > bs) { bs = s; best = t; }
  }
  if (best) { firePatriot(u, best, false); u.cd = 0.6; }
}
function firePatriot(u, t, manual) {
  const i = u.tubes.indexOf(1); if (i < 0) return false;
  u.tubes[i] = 0;
  const x = u.x + PT_TUBES[i][0], y = u.y + PT_TUBES[i][1];
  spend(UNIT.patriot.shot, 'patriot'); S.stats.patriotShots++;
  if (t.type === 'drone' || t.type === 'decoy') {
    S.stats.patriotWaste++;
    if (!S.warnedWaste && !manual && !S.demo) { S.warnedWaste = true; later(0.6, () => banner('\u26A0 $4M PATRIOT FIRED AT A ' + (t.type === 'decoy' ? '$5K DECOY' : '$20K DRONE'), 'Click the Patriot and switch it to HEAVY ONLY. Let CIWS handle drones.', '#ffb347', 4.5)); }
  }
  t.engaged++; t.spent += UNIT.patriot.shot;
  S.missiles.push({ x, y, z: 0, zT: 0, speed: 70, dir: -Math.PI / 2, target: t, phase: 'boost', t: 0, acc: 0, lost: 0, mode: manual ? 'manual' : u.mode, dead: false });
  light(x, y, 70, 0.35, 0.9);
  P({ k: 'soft', spr: SPR.white, add: true, x, y, life: 0.12, s0: 8, s1: 18, a0: 1 });
  for (let k = 0; k < 14; k++) { const a = rand(0, TAU); P({ k: 'soft', spr: SPR.dust, x: u.x, y: u.y + 4, vx: Math.cos(a) * rand(40, 90), vy: Math.sin(a) * rand(20, 50), drag: 2.2, life: rand(1, 1.8), s0: 5, s1: rand(14, 22), a0: 0.35, fadeIn: true }); }
  P({ k: 'debris', c: '#8c9a80', x, y, z: 6, vz: rand(120, 180), vx: rand(-60, 60), vy: rand(-40, 10), rot: 0, vr: rand(-15, 15), life: 1.4, s0: 5, a0: 1 });
  addShake(1.6); SFX.patriot();
  if (manual) popup(u.x, u.y - 52, 'MANUAL LAUNCH', '#8fdcff', 11);
  return true;
}
function patriotAllowed(mode, t) {
  if (mode === 'heavy') return t.type === 'ballistic' || t.type === 'cruise';
  return true;
}
function reacquire(m) {
  let best = null, bd = 280;
  for (const t of S.threats) {
    if (!t.alive || t.engaged > 0 || !patriotAllowed(m.mode, t)) continue;
    if (t.type === 'ballistic' && t.T < 0.45) continue;
    const d = dist(m.x, m.y, t.sx, t.sy);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) { best.engaged++; best.spent += UNIT.patriot.shot; }
  return best;
}
function airburst(m) {
  m.dead = true;
  if (m.target && m.target.alive) m.target.engaged = Math.max(0, m.target.engaged - 1);
  explode(m.x, m.y, 0.7, true);
}
function updMissiles(dt) {
  for (const m of S.missiles) {
    if (m.dead) continue;
    m.t += dt;
    if (m.phase === 'boost') {
      m.speed = Math.min(300, m.speed + 700 * dt);
      m.y -= m.speed * dt; m.z += m.speed * dt;
      if (m.t > 0.3) m.phase = 'guide';
    } else {
      let t = m.target;
      if (!t || !t.alive) { m.target = t = reacquire(m); }
      if (t) {
        m.lost = 0;
        const lead = Math.min(0.8, dist(m.x, m.y, t.sx, t.sy) / Math.max(200, m.speed));
        const px = t.sx + t.vx * lead * 0.9, py = t.sy + t.vy * lead * 0.9;
        m.dir = turnToward(m.dir, Math.atan2(py - m.y, px - m.x), (3 + m.t * 4) * dt);
        m.zT = t.z || 0;
      } else { m.lost += dt; if (m.lost > 0.7) { airburst(m); continue; } }
      m.speed = Math.min(580, m.speed + 650 * dt);
      m.x += Math.cos(m.dir) * m.speed * dt; m.y += Math.sin(m.dir) * m.speed * dt;
      m.z += (m.zT - m.z) * Math.min(1, dt * 1.2);
      if (t && dist(m.x, m.y, t.sx, t.sy) < 15) {
        if (Math.random() < 0.93) { m.dead = true; killThreat(t, 'patriot'); continue; }
        t.engaged = Math.max(0, t.engaged - 1);
        popup(t.sx, t.sy - 14, 'MISS', '#ffcf6b', 13);
        m.target = null; m.lost = 0.3;
      }
    }
    m.acc += dt;
    while (m.acc > 0.013) {
      m.acc -= 0.013;
      const bx = m.x - Math.cos(m.dir) * 6, by = m.y - Math.sin(m.dir) * 6;
      P({ k: 'soft', spr: SPR.smoke, x: bx + rand(-1, 1), y: by + rand(-1, 1), vx: rand(-5, 5), vy: rand(-5, 5), wind: 4, drag: 0.6, life: rand(1.8, 2.8), s0: 2.5, s1: rand(11, 17), a0: 0.5, fadeIn: true });
    }
    if (m.t > 7 || m.x < -50 || m.x > W + 50 || m.y < -60 || m.y > H + 40) airburst(m);
  }
  S.missiles = S.missiles.filter((m) => !m.dead);
}

// ---- HIMARS ----
function updHimars(u, dt) {
  if (u.reload > 0) {
    u.reload -= dt;
    if (u.reload <= 0) { u.reload = 0; u.loaded = 6; popup(u.x, u.y - 36, 'HIMARS READY', '#7cffb2', 11); }
  }
  const s = u.salvo;
  if (!s) return;
  const desired = Math.atan2(s.ly - (u.y + 8), s.lx - u.x) + Math.PI / 2;
  u.podAim = turnToward(u.podAim, desired, 6 * dt);
  s.t -= dt;
  if (s.t <= 0 && s.n > 0) {
    fireRocket(u, s); s.n--; s.t = 0.16;
    if (s.n === 0) { u.salvo = null; u.reload = 14; }
  }
}
function himarsReady(u) { return u && u.type === 'himars' && !u.salvo && u.reload <= 0; }
function fireSalvo(u, L) {
  spend(UNIT.himars.shot, 'himars'); S.stats.salvos++;
  u.salvo = { L, gen: L.gen, n: 6, t: 0.25, lx: L.x, ly: L.y, hits: 0 };
  popup(L.x, L.y - 28, 'SALVO INBOUND', '#ffb347', 13);
  SFX.click();
}
function fireRocket(u, s) {
  const pa = u.podAim - Math.PI / 2;
  const x = u.x + Math.cos(pa) * 12, y = u.y + 8 + Math.sin(pa) * 12;
  u.loaded--;
  S.rockets.push({ x0: x, y0: y, x1: s.lx + rand(-24, 24), y1: s.ly + rand(-16, 16), T: 0, dur: rand(1.5, 1.7), peak: rand(150, 190), L: s.L, gen: s.gen, last: s.n === 1, salvo: s, acc: 0, sx: x, sy: y, gx: x, gy: y, z: 0, ang: pa, dead: false });
  light(x, y, 44, 0.18, 0.95);
  P({ k: 'soft', spr: SPR.yellow, add: true, x, y, life: 0.1, s0: 10, s1: 16, a0: 1 });
  const bx = u.x - Math.cos(pa) * 26, by = u.y + 8 - Math.sin(pa) * 26;
  for (let k = 0; k < 6; k++) puff(bx, by, { spr: SPR.grey, vx: -Math.cos(pa) * rand(40, 90) + rand(-20, 20), vy: -Math.sin(pa) * rand(40, 90) + rand(-20, 20), drag: 2, s0: 5, s1: rand(16, 26), a0: 0.5, life: rand(1.2, 2.2) });
  for (let k = 0; k < 5; k++) { const a = rand(0, TAU); P({ k: 'soft', spr: SPR.dust, x: u.x, y: u.y + 6, vx: Math.cos(a) * rand(30, 70), vy: Math.sin(a) * rand(15, 40), drag: 2.4, life: rand(0.8, 1.4), s0: 4, s1: 14, a0: 0.3, fadeIn: true }); }
  addShake(3); SFX.rocket();
}
function updRockets(dt) {
  for (const r of S.rockets) {
    r.T += dt / r.dur;
    const T = Math.min(1, r.T);
    const gx = lerp(r.x0, r.x1, T), gy = lerp(r.y0, r.y1, T), z = r.peak * 4 * T * (1 - T);
    const nsx = gx, nsy = gy - z;
    r.ang = Math.atan2(nsy - r.sy, nsx - r.sx); r.sx = nsx; r.sy = nsy; r.gx = gx; r.gy = gy; r.z = z;
    r.acc += dt;
    while (r.acc > 0.016) { r.acc -= 0.016; P({ k: 'soft', spr: SPR.grey, x: r.sx, y: r.sy, vx: rand(-4, 4), vy: rand(-4, 4), wind: 4, drag: 0.6, life: rand(1.1, 1.6), s0: 2, s1: rand(8, 12), a0: 0.45, fadeIn: true }); }
    if (r.T >= 1) {
      r.dead = true;
      explode(r.x1, r.y1, 1.4);
      const L = r.L;
      if (L.alive && L.gen === r.gen && dist(r.x1, r.y1, L.x, L.y) < 20) { L.hp--; r.salvo.hits++; if (L.hp <= 0) destroyLauncher(L); }
      if (r.last && L.alive) popup(r.x1, r.y1 - 30, L.gen !== r.gen ? 'MISSED: LAUNCHER RELOCATED' : `LAUNCHER DAMAGED: ARMOR ${L.hp}/${L.max}`, '#ffcf6b', 13);
    }
  }
  S.rockets = S.rockets.filter((r) => !r.dead);
}

function damageUnit(u, d) {
  if (u.dead) return;
  u.hp -= d;
  if (u.hp > 0) { popup(u.x, u.y - 30, `${UNIT[u.type].short} DAMAGED`, '#ffb347', 11); return; }
  u.dead = true; S.pads[u.pad] = null;
  explode(u.x, u.y, 2.2);
  addFire(u.x, u.y, 0.8, 12);
  popup(u.x, u.y - 34, `${UNIT[u.type].short} DESTROYED`, '#ff4d4d', 13);
  if (ui.sel === u || (ui.panel && ui.panel.u === u)) closePanel();
}

// ============================== THREATS ==============================
function pickTarget(t) {
  if (t.type === 'decoy') { t.tx = rand(60, W - 60); t.ty = playerShore(t.tx) + rand(4, 14); return; }
  const units = S.pads.filter(Boolean);
  const chance = t.type === 'drone' ? 0.18 : t.type === 'cruise' ? 0.12 : 0.1;
  if (units.length && Math.random() < chance) { const u = pick(units); t.tu = u; t.tb = null; t.tx = u.x + rand(-6, 6); t.ty = u.y + rand(-6, 6); return; }
  const alive = S.buildings.filter((b) => b.hp > 0);
  t.tu = null;
  if (!alive.length) { t.tb = null; t.tx = rand(100, W - 100); t.ty = 650; return; }
  const wts = { refinery: 0.4, city: 0.35, power: 0.25 };
  let tot = 0; for (const b of alive) tot += wts[b.id];
  let r = Math.random() * tot, b = alive[0];
  for (const bb of alive) { r -= wts[bb.id]; if (r <= 0) { b = bb; break; } }
  t.tb = b; t.tx = b.x + rand(-b.w * 0.36, b.w * 0.36); t.ty = b.y + rand(-b.h * 0.28, b.h * 0.28);
}

function spawnThreat(type, L) {
  const T = THREAT[type];
  const t = { type, alive: true, x: L.x, y: L.y + 4, z: 0, cost: T.cost, spent: 0, engaged: 0, hp: 1, age: 0, wob: rand(0, TAU),
    speed: (T.speed || 0) * rand(0.9, 1.1), hist: [], ang: Math.PI / 2, vx: 0, vy: 0, sx: L.x, sy: L.y + 4, tb: null, tu: null };
  pickTarget(t);
  if (type === 'ballistic') {
    t.x0 = t.x; t.y0 = t.y; t.T = 0; t.dur = rand(6.2, 7.2); t.peak = rand(300, 340);
    SFX.siren();
    banner('BALLISTIC LAUNCH DETECTED', 'Only Patriots can intercept. Watch the red impact marker.', '#ff3b30', 2.4);
    for (let k = 0; k < 16; k++) puff(L.x + rand(-8, 8), L.y + rand(-5, 5), { spr: SPR.smoke, s0: 5, s1: rand(18, 30), a0: 0.5, life: rand(2, 3.5), vx: rand(-25, 25), vy: rand(-18, 6) });
  }
  S.threats.push(t);
  S.stats.enemy += T.cost; S.stats.launched[type]++;
  revealSource(L);
  if (type === 'ballistic') sayOnce('bal', 'BALLISTIC MISSILE LAUNCH', 'Fast, $500K, and only a Patriot can stop it. The red circle marks where it will hit.', 'red');
  light(L.x, L.y, type === 'ballistic' ? 70 : 28, 0.3, 0.85);
  for (let k = 0; k < 4; k++) puff(L.x + rand(-6, 6), L.y + rand(-4, 4), { spr: SPR.dust, s0: 4, s1: rand(12, 20), a0: 0.4, life: rand(1.4, 2.4), vx: rand(-20, 20), vy: rand(-12, 6) });
}

function retarget(t) {
  t.tu = null;
  const alive = S.buildings.filter((b) => b.hp > 0);
  if (!alive.length) { t.tb = null; return; }
  const b = pick(alive);
  t.tb = b; t.tx = b.x + rand(-b.w * 0.36, b.w * 0.36); t.ty = b.y + rand(-b.h * 0.28, b.h * 0.28);
}

function updThreats(dt) {
  for (const t of S.threats) {
    if (!t.alive) continue;
    t.age += dt;
    const psx = t.sx, psy = t.sy;
    if (t.type === 'ballistic') {
      t.T += dt / t.dur;
      const T = Math.min(1, t.T);
      t.x = lerp(t.x0, t.tx, T); t.y = lerp(t.y0, t.ty, T); t.z = t.peak * 4 * T * (1 - T);
      if (t.T >= 1) { impact(t); continue; }
      if (T < 0.25) puff(t.x, t.y - t.z, { spr: SPR.smoke, s0: 3, s1: 14, a0: 0.3, life: 2, vy: 0 });
      else if (Math.random() < 0.5) P({ k: 'soft', spr: SPR.red, add: true, x: t.x + rand(-2, 2), y: t.y - t.z, vx: rand(-10, 10), vy: rand(-10, 10), life: 0.4, s0: 4, s1: 1, a0: 0.7 });
    } else {
      if ((t.tb && t.tb.hp <= 0) || (t.tu && t.tu.dead)) retarget(t);
      const dx = t.tx - t.x, dy = t.ty - t.y, d = Math.hypot(dx, dy);
      if (d < 7) { if (t.type === 'decoy') fizzle(t); else impact(t); continue; }
      const wob = t.type === 'cruise' ? Math.sin(t.age * 2 + t.wob) * 0.12 : Math.sin(t.age * 1.4 + t.wob) * 0.28;
      const h = Math.atan2(dy, dx) + wob * Math.min(1, d / 120);
      const step = Math.min(d, t.speed * dt);
      t.x += Math.cos(h) * step; t.y += Math.sin(h) * step;
      const Z = THREAT[t.type].z;
      t.z = d < 60 ? Z * Math.max(0, (d - 6) / 54) : Z;
      t.ang = h;
      if (t.type === 'cruise' && Math.random() < 0.6) P({ k: 'soft', spr: SPR.smoke, x: t.x - Math.cos(h) * 10, y: t.y - t.z - Math.sin(h) * 10, vx: rand(-3, 3), vy: rand(-3, 3), life: 0.9, s0: 2, s1: 7, a0: 0.25 });
    }
    t.sx = t.x; t.sy = t.y - t.z;
    if (dt > 0) { t.vx = (t.sx - psx) / dt; t.vy = (t.sy - psy) / dt; }
    if (t.type === 'ballistic') { t.ang = Math.atan2(t.vy, t.vx); t.hist.push([t.sx, t.sy]); if (t.hist.length > 34) t.hist.shift(); }
  }
  S.threats = S.threats.filter((t) => t.alive);
}

function fizzle(t) {
  t.alive = false;
  for (let i = 0; i < 4; i++) puff(t.x, t.y, { spr: SPR.grey, s0: 3, s1: 10, a0: 0.4, life: 1.2 });
  popup(t.x, t.y - 12, 'DECOY', '#8a9aa5', 11, 1.2);
}

function impact(t) {
  t.alive = false;
  const T = THREAT[t.type];
  const p = t.type === 'ballistic' ? 3.2 : t.type === 'cruise' ? 2.2 : 1.5;
  explode(t.x, t.y, p);
  if (t.type === 'ballistic') { slowmo(0.45); flashA = Math.max(flashA, 0.35); addShake(6); }
  if (t.tu && !t.tu.dead && dist(t.x, t.y, t.tu.x, t.tu.y) < 40) {
    damageUnit(t.tu, t.type === 'ballistic' ? 999 : t.type === 'cruise' ? 60 : 32);
  } else {
    const pad = t.type === 'ballistic' ? 20 : 8;
    for (const b of S.buildings) {
      if (b.hp > 0 && Math.abs(t.x - b.x) < b.w / 2 + pad && Math.abs(t.y - b.y) < b.h / 2 + pad) { damageBuilding(b, T.dmg, t.x, t.y); break; }
    }
  }
  if (t.type === 'ballistic') for (const u of S.pads) if (u && !u.dead && dist(u.x, u.y, t.x, t.y) < 60) damageUnit(u, 50);
}

function killThreat(t, by) {
  if (!t.alive) return;
  t.alive = false;
  S.stats.killed[t.type]++;
  const p = t.type === 'ballistic' ? 2.6 : t.type === 'cruise' ? 1.6 : 1.0;
  explode(t.sx, t.sy, p, true);
  if (t.type === 'ballistic') {
    slowmo(0.35); flashA = Math.max(flashA, 0.15);
    for (let i = 0; i < 10; i++) P({ k: 'soft', spr: SPR.fire, add: true, x: t.sx, y: t.sy, vx: rand(-60, 60), vy: rand(-40, 30), grav: 120, drag: 0.5, life: rand(0.8, 1.4), s0: 3, s1: 1, a0: 0.9 });
  }
  if (t.spent > 0) {
    const ratio = t.spent / t.cost;
    const col = ratio <= 1 ? '#7cffb2' : ratio <= 10 ? '#ffb347' : '#ff4d4d';
    popup(t.sx, t.sy - 16, `-${money(t.spent, true)} vs -${money(t.cost, true)}`, col, by === 'patriot' ? 17 : 12, by === 'patriot' ? 2.2 : 1.4);
    if (t.type === 'decoy') popup(t.sx, t.sy + 4, 'IT WAS A DECOY', '#ff4d4d', 12, 2);
  }
}

// ============================== LAUNCHERS ==============================
function placeLauncher(L) {
  for (let tries = 0; tries < 40; tries++) {
    const x = rand(50, W - 50);
    if (S.launchers.every((o) => o === L || !o.alive || Math.abs(o.x - x) > 110) && S.bunkers.every((b) => Math.abs(b.x - x) > 70)) { L.x = x; break; }
    L.x = x;
  }
  L.y = Math.max(HUD_H + 30, enemyShore(L.x) - rand(28, 70));
  L.rot = rand(-0.6, 0.6);
}
function revealLauncher(L) {
  if (!L.revealed) { L.revealed = true; L.pingT = 0; L.fade = 0; SFX.ping(); }
  L.revealT = CFG.reveal;
}
function updLaunchers(dt) {
  for (const L of S.launchers) {
    if (!L.alive || !L.revealed) continue;
    L.revealT -= dt; L.pingT -= dt; L.fade = Math.min(1, L.fade + dt * 4);
    if (L.pingT <= 0) { L.pingT = 1.25; P({ k: 'ring', add: true, c: 'rgb(255,60,50)', w: 2.5, x: L.x, y: L.y, life: 1.2, s0: 6, s1: 48, a0: 0.9 }); }
    if (L.revealT <= 0) { L.revealed = false; L.gen++; placeLauncher(L); }
  }
}
function destroyLauncher(L) {
  if (!L.alive) return;
  L.alive = false; L.revealed = false; S.stats.launchersKilled++;
  explode(L.x, L.y, 3);
  for (let i = 1; i <= 3; i++) later(i * 0.35, () => explode(L.x + rand(-14, 14), L.y + rand(-10, 10), rand(1.4, 2.2)));
  addFire(L.x, L.y, 1.1);
  S.treasury += CFG.bounty; S.stats.bounty += CFG.bounty;
  popup(L.x, L.y - 36, '+$3M BOUNTY', '#7cffb2', 18, 2.4);
  SFX.cash();
  const left = S.launchers.filter((l) => l.alive).length;
  banner('LAUNCHER DESTROYED', left ? `${left} mobile launcher${left > 1 ? 's' : ''} left. Future waves are smaller.` : 'All enemy launchers neutralized', '#7cffb2', 2.6);
  demoEvent(L.x, L.y + 40, 1.7, 2.8, 8);
  if (!left) later(2.2, () => endGame(true, 'All five enemy launchers destroyed. The strait is open.'));
}

// ============================== WAVES ==============================
function buildWave(n) {
  const d = WAVES[n - 1];
  const alive = S.launchers.filter((l) => l.alive).length;
  const f = 0.35 + 0.65 * alive / CFG.launchers;
  const cnt = (v) => (v > 0 ? Math.max(1, Math.round(v * f)) : 0);
  const lightList = [];
  for (let i = 0; i < cnt(d.d); i++) lightList.push('drone');
  for (let i = 0; i < cnt(d.x); i++) lightList.push('decoy');
  shuffle(lightList);
  const salvos = [];
  while (lightList.length) salvos.push(lightList.splice(0, Math.min(lightList.length, randi(3, 6))));
  let c = cnt(d.c); while (c > 0) { const k = Math.min(c, randi(1, 2)); salvos.push(Array(k).fill('cruise')); c -= k; }
  const bf = 0.25 + 0.75 * S.bunkers.filter((x) => x.alive).length / AIR.bunkers;
  let b = d.b > 0 ? Math.max(1, Math.round(d.b * f * bf)) : 0; while (b > 0) { const k = Math.min(b, randi(1, 2)); salvos.push(Array(k).fill('ballistic')); b -= k; }
  const first = salvos.shift(); shuffle(salvos); salvos.unshift(first);
  const gap = lerp(4.6, 2.3, (n - 1) / 9);
  const q = []; let t = 1.0;
  salvos.forEach((s, si) => {
    s.forEach((type, i) => q.push({ t: t + i * (type === 'ballistic' ? 0.7 : 0.35), type, salvo: si }));
    t += gap * rand(0.75, 1.25) + s.length * 0.15;
  });
  q.sort((a, b2) => a.t - b2.t);
  return q;
}
function startWave(n) {
  S.wave = n; S.mode = 'wave'; S.waveT = 0; S.salvoL = {};
  S.queue = buildWave(n);
  S.waveStart = { your: S.stats.your, enemy: S.stats.enemy };
  banner(`WAVE ${n} / 10`, n === 10 ? 'FINAL ASSAULT' : 'Hostile launches detected', '#ff6b5a', 2.4);
  if (S.demo) {
    const fl = { 1: 'Shahed drones and decoys. Cheap for them, expensive for us if we pick the wrong weapon.', 3: 'Cruise missiles join the drone swarms.', 4: 'First ballistic missiles expected from underground bases.', 10: 'Final assault. Everything they have left.' };
    say(`WAVE ${n} / 10`, fl[n] || `${S.queue.length} inbound threats from ${S.launchers.filter((l) => l.alive).length} mobile launchers.`, n >= 4 ? 'red' : '');
  }
  refreshButtons();
}
function spawnFromQueue() {
  while (S.queue.length && S.queue[0].t <= S.waveT) {
    const it = S.queue.shift();
    if (it.type === 'ballistic') { const bs = S.bunkers.filter((x) => x.alive); if (bs.length) { spawnThreat('ballistic', pick(bs)); continue; } }
    let L = S.salvoL[it.salvo];
    if (!L || !L.alive) {
      const alive = S.launchers.filter((l) => l.alive);
      if (!alive.length) continue;
      L = S.salvoL[it.salvo] = pick(alive);
    }
    spawnThreat(it.type, L);
  }
}
function waveCleared() {
  if (S.wave >= WAVES.length) { endGame(true, 'You held the strait through all 10 waves.'); return; }
  const y = S.stats.your - S.waveStart.your, e = S.stats.enemy - S.waveStart.enemy;
  banner(`WAVE ${S.wave} CLEARED`, `This wave: you spent ${money(y)} vs enemy ${money(e)}`, '#7cffb2', 3);
  S.mode = 'prep'; S.prepT = CFG.prepTime;
  refreshButtons();
}
function nextWaveNow() {
  if (S.mode !== 'prep' || S.paused) return;
  S.treasury += CFG.earlyBonus; S.stats.bonus += CFG.earlyBonus;
  popup(W / 2, 160, `+${money(CFG.earlyBonus, true)} EARLY BONUS`, '#7cffb2', 14);
  SFX.click();
  startWave(S.wave + 1);
}

// ============================== ECONOMY / FLOW ==============================
function incomeRate() { let v = 0; for (const b of S.buildings) v += b.income * b.hp / b.max; return v; }
function updIncome(dt) {
  S.incomeT += dt;
  if (S.incomeT < CFG.incomeEvery) return;
  S.incomeT -= CFG.incomeEvery;
  let tot = 0;
  for (const b of S.buildings) {
    const v = b.income * b.hp / b.max;
    if (v > 0) { tot += v; popup(b.x + rand(-12, 12), b.y - 64, '+' + money(v, true), '#7cffb2', 12, 1.4); }
  }
  S.treasury += tot; S.stats.income += tot;
}
function checkLose() {
  if (S.mode === 'over') return;
  if (S.treasury < CFG.bankruptLimit) { endGame(false, 'Bankrupt: debt went past −$20M. The war cost more than the state could borrow.'); return; }
  if (!S.loseQueued && S.buildings.every((b) => b.hp <= 0)) { S.loseQueued = true; later(2.2, () => endGame(false, 'All coastal infrastructure was destroyed.')); }
}
function endGame(win, reason) {
  if (S.mode === 'over') return;
  if (S.demo) {
    S.mode = 'over'; S.queue = []; S.result = { win, reason }; closePanel(); D.actions = []; D.act = null;
    banner(win ? 'VICTORY' : 'DEFEAT', reason, win ? '#7cffb2' : '#ff4d4d', 3.5);
    D.endT = 11;
    later(2.5, () => { const st = S.stats; const r = st.enemy ? (st.your / st.enemy).toFixed(1) : '\u2014'; say(win ? 'VICTORY' : 'DEFEAT', `Defense spent ${money(st.your)} vs attacker ${money(st.enemy)} (${r} : 1). Next game starting...`, win ? 'grn' : 'red'); });
    return;
  }
  S.mode = 'over'; S.queue = []; S.result = { win, reason };
  closePanel();
  banner(win ? 'VICTORY' : 'DEFEAT', reason, win ? '#7cffb2' : '#ff4d4d', 3);
  refreshButtons();
  later(2.4, showReport);
}
function later(t, fn) { S.timers.push({ t, fn }); }
function updTimers(dt) {
  const run = [];
  S.timers = S.timers.filter((x) => { x.t -= dt; if (x.t <= 0) { run.push(x.fn); return false; } return true; });
  for (const fn of run) fn();
}

function popup(x, y, text, color, size = 13, life = 1.6) {
  if (S.popups.length > 70) S.popups.shift();
  S.popups.push({ x: clamp(x, 90, W - 90), y, text, color, size, life, age: 0 });
}
function banner(text, sub, color, life = 2.6) { S.banner = { text, sub, color, life, age: 0 }; }

// ============================== UI (HTML) ==============================
const elPanel = document.getElementById('panel');
const elOverlay = document.getElementById('overlay');
const elPause = document.getElementById('pauseOverlay');
const btnNext = document.getElementById('btnNext');
const btnPause = document.getElementById('btnPause');
const btnMute = document.getElementById('btnMute');
const ui = { panel: null, sel: null, mx: -100, my: -100, tick: 0 };

function closePanel() { ui.panel = null; ui.sel = null; elPanel.classList.add('hidden'); elPanel.innerHTML = ''; }
function placePanel(pad, w) {
  elPanel.style.width = w + 'px';
  elPanel.style.left = clamp(pad.x - w / 2, 8, W - w - 8) + 'px';
  elPanel.style.bottom = (H - pad.y + 34) + 'px';
  elPanel.classList.remove('hidden');
}
function openShop(i) {
  ui.sel = null; ui.panel = { kind: 'shop', pad: i };
  let h = `<div class="ph"><span>DEPLOY TO PAD ${i + 1}</span><button class="x" data-act="close">✕</button></div><div class="cards">`;
  for (const k of ['ciws', 'patriot', 'himars']) {
    const U = UNIT[k];
    h += `<button class="card" data-act="buy" data-unit="${k}"><img src="${ICONS[k]}" alt="">
      <div class="cn">${U.name}</div><div class="ctag">${U.tag}</div>
      <div class="cost"><span>BUILD</span><b>${money(U.build)}</b></div>
      <div class="cost"><span>AMMO ${U.ammo}</span><b>${money(U.shot)}</b></div>
      <div class="crole">${U.role}</div></button>`;
  }
  h += '</div>';
  elPanel.innerHTML = h; placePanel(PADS[i], 620); refreshPanel();
}
function selectUnit(u) {
  ui.sel = u; ui.panel = { kind: 'unit', u };
  const U = UNIT[u.type];
  let h = `<div class="ph"><span>${U.name}</span><button class="x" data-act="close">✕</button></div>
    <div class="row"><span>ARMOR</span><b id="u-hp"></b></div><div class="bar"><i id="u-hpbar"></i></div>`;
  if (u.type === 'patriot') {
    h += `<div class="row"><span>INTERCEPTORS READY</span><b id="u-ammo"></b></div>
      <button class="btn ${u.mode}" data-act="mode">${u.mode === 'auto' ? 'MODE: AUTO · ALL THREATS' : 'MODE: HEAVY ONLY'}</button>
      <div class="hint">${u.mode === 'auto'
        ? '<span class="warn">⚠ AUTO fires $4M missiles at anything, including $20K drones and $5K decoys.</span>'
        : 'Engages only ballistic and cruise missiles. Leave drones to your CIWS.'}<br>Tip: while selected, click any threat to fire one missile manually.</div>`;
  } else if (u.type === 'ciws') {
    h += `<div class="row"><span>AMMO</span><b>$5K / burst</b></div>
      <div class="hint">Auto-engages Shahed drones and cruise missiles in its range circle. Cannot hit ballistic missiles. Ignores decoys.</div>`;
  } else {
    h += `<div class="row"><span>STATUS</span><b id="u-status"></b></div>
      <div class="hint">Click a <span class="warn">red-pinged enemy launcher</span> on the top coast to fire 6 rockets for $1.5M. Launchers move when their ping fades, so strike fast.</div>`;
  }
  h += `<button class="btn sell" data-act="sell">SELL · REFUND ${money(U.build * CFG.refund)}</button>`;
  elPanel.innerHTML = h; placePanel(PADS[u.pad], 290); refreshPanel();
}
function refreshPanel() {
  if (!ui.panel) return;
  if (ui.panel.kind === 'shop') {
    elPanel.querySelectorAll('.card').forEach((c) => c.classList.toggle('off', S.treasury < UNIT[c.dataset.unit].build));
    return;
  }
  if (ui.panel.kind === 'carrier') {
    const el = document.getElementById('c-ready');
    if (el) { const re = S.carrier.slots.filter((x) => x.state === 'rearm').map((x) => Math.ceil(x.t)); el.textContent = `${jetsReady()} / ${AIR.jets}` + (re.length ? `  (rearm ${Math.min(...re)}s)` : ''); }
    return;
  }
  const u = ui.panel.u;
  const hp = document.getElementById('u-hp'), bar = document.getElementById('u-hpbar');
  if (hp) hp.textContent = `${Math.max(0, Math.round(u.hp))} / ${u.max}`;
  if (bar) { const r = u.hp / u.max; bar.style.width = (r * 100) + '%'; bar.style.background = r > 0.6 ? '#4cd97b' : r > 0.3 ? '#ffc04d' : '#ff4d4d'; }
  const am = document.getElementById('u-ammo'); if (am) am.textContent = `${u.tubes.filter(Boolean).length} / 4`;
  const st = document.getElementById('u-status');
  if (st) st.textContent = u.salvo ? 'FIRING' : u.reload > 0 ? `RELOADING ${Math.ceil(u.reload)}s` : 'READY';
}
function buy(type) {
  const pad = ui.panel && ui.panel.pad; if (pad === undefined || S.pads[pad]) return;
  const U = UNIT[type];
  if (S.treasury < U.build) { SFX.err(); popup(PADS[pad].x, PADS[pad].y - 40, 'INSUFFICIENT FUNDS', '#ff4d4d', 13); return; }
  spend(U.build, 'build');
  const u = makeUnit(type, pad); S.pads[pad] = u;
  for (let k = 0; k < 16; k++) { const a = rand(0, TAU); P({ k: 'soft', spr: SPR.dust, x: u.x, y: u.y + 6, vx: Math.cos(a) * rand(40, 90), vy: Math.sin(a) * rand(20, 45), drag: 2.4, life: rand(0.9, 1.5), s0: 4, s1: 16, a0: 0.4, fadeIn: true }); }
  popup(u.x, u.y - 40, `${U.short} DEPLOYED  -${money(U.build, true)}`, '#8fdcff', 12);
  SFX.build();
  if (type === 'ciws') closePanel(); else selectUnit(u);
}
function sell(u) {
  const refund = UNIT[u.type].build * CFG.refund;
  S.treasury += refund; S.stats.build -= refund; S.stats.your -= refund;
  u.dead = true; S.pads[u.pad] = null;
  popup(u.x, u.y - 30, `SOLD  +${money(refund, true)}`, '#7cffb2', 12);
  SFX.click(); closePanel();
}
elPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
elPanel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') { SFX.click(); closePanel(); }
  else if (act === 'buy') buy(b.dataset.unit);
  else if (act === 'mode' && ui.panel && ui.panel.u) {
    const u = ui.panel.u; u.mode = u.mode === 'auto' ? 'heavy' : 'auto';
    popup(u.x, u.y - 52, u.mode === 'auto' ? 'AUTO: ALL THREATS' : 'HEAVY ONLY', u.mode === 'auto' ? '#ffb36b' : '#7cffb2', 12);
    SFX.click(); selectUnit(u);
  } else if (act === 'sell' && ui.panel && ui.panel.u) sell(ui.panel.u);
});

function refreshButtons() {
  const prep = S.mode === 'prep';
  btnNext.classList.toggle('hidden', !prep);
  if (prep) btnNext.firstChild.textContent = S.wave === 0 ? 'START WAVE 1' : 'NEXT WAVE NOW';
}
function togglePause(force) {
  if (S.mode !== 'prep' && S.mode !== 'wave') return;
  S.paused = force !== undefined ? force : !S.paused;
  elPause.classList.toggle('hidden', !S.paused);
  btnPause.textContent = S.paused ? '▶' : 'II';
}
function toggleMute() { SFX.setMuted(!SFX.muted); btnMute.textContent = SFX.muted ? 'SOUND OFF' : 'SOUND ON'; }
btnNext.addEventListener('click', () => { SFX.init(); nextWaveNow(); });
btnPause.addEventListener('click', () => { SFX.click(); togglePause(); });
btnMute.addEventListener('click', () => { SFX.init(); toggleMute(); });
document.getElementById('btnResume').addEventListener('click', () => togglePause(false));
elOverlay.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'btnStart' || b.id === 'btnAgain') { SFX.init(); SFX.click(); startGame(); }
  else if (b.id === 'btnDemo') startDemo();
});
for (const el of [btnNext, btnPause, btnMute]) el.addEventListener('pointerdown', (e) => e.stopPropagation());

function startGame() {
  S = newState();
  parts = [];
  placeBunkers();
  for (const L of S.launchers) placeLauncher(L);
  camReset();
  S.mode = 'prep'; S.prepT = CFG.firstPrep;
  elOverlay.classList.add('hidden'); elPause.classList.add('hidden');
  closePanel(); refreshButtons();
  banner('DEPLOY YOUR DEFENSES', 'Click a concrete pad on your coast to build. $50M in the treasury.', '#5ad2ff', 4);
}

function showReport() {
  const s = S.stats, win = S.result.win;
  const ratio = s.enemy > 0 ? s.your / s.enemy : 0;
  const tot = S.buildings.reduce((a, b) => a + b.max, 0);
  const infra = Math.round(S.buildings.reduce((a, b) => a + b.hp, 0) / tot * 100);
  const grade = !win ? 'F' : ratio <= 2 && infra >= 70 ? 'S' : ratio <= 3.5 ? 'A' : ratio <= 5 ? 'B' : ratio <= 8 ? 'C' : 'D';
  const waves = win ? S.wave : Math.max(0, S.wave - 1);
  let insight;
  if (s.patriotWaste > 0) insight = `Your Patriots fired ${s.patriotWaste} interceptor${s.patriotWaste > 1 ? 's' : ''} (${money(s.patriotWaste * UNIT.patriot.shot)}) at drones and decoys. That is exactly the trade cheap swarms are designed to force.`;
  else if (ratio > 1) insight = `Even with disciplined targeting you spent ${ratio.toFixed(1)}× what the enemy did. Cheap attacks against expensive defenses is the core of asymmetric warfare.`;
  else insight = 'You beat the cost curve, which is rare in real air defense.';
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const thr = (k, label) => row(label, `${s.launched[k]} sent · ${s.killed[k]} down`);
  elOverlay.innerHTML = `<div class="box report">
    <div class="kicker">END-OF-WAR ECONOMIC REPORT</div>
    <h1 class="${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</h1>
    <p class="reason">${S.result.reason}</p>
    <div class="vs">
      <div><span>YOU SPENT</span><b class="red">${money(s.your)}</b></div>
      <div class="mid">${ratio ? ratio.toFixed(1) : '—'} : 1<small>COST-EXCHANGE RATIO</small></div>
      <div><span>ENEMY SPENT</span><b class="amb">${money(s.enemy)}</b></div>
    </div>
    <div class="cols">
      <div><h3>YOUR SPENDING</h3><table>
        ${row('Defenses built (net of sales)', money(s.build))}
        ${row(`Patriot interceptors ×${s.patriotShots}`, money(s.patriot))}
        ${row(`CIWS bursts ×${s.ciwsBursts}`, money(s.ciws))}
        ${row(`HIMARS salvos ×${s.salvos}`, money(s.himars))}
        ${row(`F-35 sorties ×${s.strikes + s.busters}`, money(s.air))}
        ${row('Income earned', '<span class="grn">+' + money(s.income) + '</span>')}
        ${row('Bounties &amp; bonuses', '<span class="grn">+' + money(s.bounty + s.bonus) + '</span>')}
      </table></div>
      <div><h3>ENEMY ATTACKS</h3><table>
        ${thr('drone', 'Shahed ($20K)')}
        ${thr('decoy', 'Decoys ($5K)')}
        ${thr('cruise', 'Cruise ($800K)')}
        ${thr('ballistic', 'Ballistic ($500K)')}
        ${row('Launchers destroyed', `${s.launchersKilled} / ${CFG.launchers}`)}
        ${row('Underground bases destroyed', `${s.bunkersKilled} / ${AIR.bunkers}`)}
        ${row('Hits on infrastructure', s.hits)}
      </table></div>
    </div>
    <div class="grade">GRADE<b>${grade}</b>· Waves survived ${waves} / 10 · Infrastructure intact ${infra}%</div>
    <p class="insight">${insight}</p>
    <div class="btnrow"><button id="btnAgain" class="big">PLAY AGAIN</button><button id="btnDemo" class="big ghost">WATCH AI DEMO</button></div>
  </div>`;
  elOverlay.classList.remove('hidden');
}

// ============================== AIR WING: CARRIER, F-35, BUNKERS ==============================
const F35 = [[15, 0], [8, 1.8], [4, 2.6], [-1, 9.5], [-5, 9.5], [-6, 3.6], [-9, 3.6], [-12.5, 7], [-15, 7], [-14, 2], [-15, 1.2], [-15, -1.2], [-14, -2], [-15, -7], [-12.5, -7], [-9, -3.6], [-6, -3.6], [-5, -9.5], [-1, -9.5], [4, -2.6], [8, -1.8]];
const CV_HULL = [[-86, -14], [58, -16], [78, -10], [90, 0], [78, 10], [58, 16], [-86, 15]];
const CV_ANGLED = [[-86, -14], [-70, -22], [-6, -23], [10, -15]];

function drawF35(g, x, y, ang, s, alpha = 1, shadow = false) {
  g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha = alpha;
  pathShape(g, F35, s);
  if (shadow) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill(); g.restore(); return; }
  g.fillStyle = '#7d868d'; g.fill(); g.strokeStyle = '#262c31'; g.lineWidth = 0.8; g.stroke();
  g.strokeStyle = '#3a4248'; g.lineWidth = 1.2; g.beginPath();
  g.moveTo(-9 * s, 2.6 * s); g.lineTo(-12 * s, 3.8 * s); g.moveTo(-9 * s, -2.6 * s); g.lineTo(-12 * s, -3.8 * s); g.stroke();
  g.fillStyle = 'rgba(214,170,70,0.85)'; g.beginPath(); g.ellipse(7 * s, 0, 2.8 * s, 1.1 * s, 0, 0, TAU); g.fill();
  g.restore();
}
function drawCarrier() {
  const c = S.carrier;
  ctx.save(); ctx.translate(c.x, c.y);
  ctx.strokeStyle = 'rgba(200,230,245,0.13)'; ctx.lineWidth = 1.4;
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(-86, -8); ctx.lineTo(-86 - 44 * i, -10 - 7 * i); ctx.moveTo(-86, 8); ctx.lineTo(-86 - 44 * i, 10 + 7 * i); ctx.stroke(); }
  ctx.save(); ctx.translate(5, 6); ctx.fillStyle = 'rgba(0,0,0,0.4)'; pathShape(ctx, CV_HULL, 1); ctx.fill(); pathShape(ctx, CV_ANGLED, 1); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#353c43'; pathShape(ctx, CV_HULL, 1); ctx.fill(); pathShape(ctx, CV_ANGLED, 1); ctx.fill();
  ctx.fillStyle = '#464e56'; pathShape(ctx, CV_HULL, 0.96); ctx.fill(); pathShape(ctx, CV_ANGLED, 0.96); ctx.fill();
  ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-80, -6); ctx.lineTo(4, -19); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(-80, 3); ctx.lineTo(84, 3); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,220,120,0.45)'; ctx.beginPath(); ctx.moveTo(22, -4); ctx.lineTo(86, -4); ctx.moveTo(26, 6); ctx.lineTo(82, 6); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-34, 8, 13, 7); ctx.fillRect(40, -14, 12, 7);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(14, 10, 26, 8);
  ctx.fillStyle = '#5d666e'; ctx.fillRect(10, 7, 24, 8); ctx.fillStyle = '#79828a'; ctx.fillRect(13, 8, 9, 5);
  ctx.fillStyle = '#aab2b8'; circle(ctx, 28, 11, 2.2);
  const spots = [[-58, 9], [-42, 9], [-26, 9]];
  c.slots.forEach((s, i) => { if (s.state !== 'flying') drawF35(ctx, spots[i][0], spots[i][1], -2.6, 0.62, s.state === 'rearm' ? 0.45 : 1); });
  ctx.restore();
}
function drawJets() { for (const j of S.jets) drawF35(ctx, j.sx, j.sy, j.ang, 1.05 + j.z / 500); }

function jetsReady() { return S.carrier.slots.filter((s) => s.state === 'ready').length; }
function launchStrike(target, weapon) {
  const slot = S.carrier.slots.find((s) => s.state === 'ready');
  if (!slot) return false;
  const c = S.carrier;
  slot.state = 'flying';
  spend(weapon === 'bunker' ? AIR.busterCost : AIR.strikeCost, 'air');
  if (weapon === 'bunker') S.stats.busters++; else S.stats.strikes++;
  const j = { slot, weapon, target, gen: target.gen, tx: target.x, ty: target.y, x: c.x - 48, y: c.y - 4, z: 0, ang: 0, spd: 10, phase: 'cat', t: 0, acc: 0, dropped: false, done: false };
  j.sx = j.x; j.sy = j.y;
  S.jets.push(j);
  for (let k = 0; k < 10; k++) puff(c.x - 48 + k * 8, c.y - 4, { spr: SPR.steam, s0: 3, s1: 12, a0: 0.45, life: rand(1, 1.6), vx: rand(-10, 10), vy: rand(-8, 4) });
  SFX.jet();
  popup(c.x, c.y - 52, weapon === 'bunker' ? `F-35 BUNKER BUSTER  -${money(AIR.busterCost, true)}` : `F-35 STRIKE  -${money(AIR.strikeCost, true)}`, '#8fdcff', 12);
  return true;
}
function updJets(dt) {
  const c = S.carrier;
  for (const j of S.jets) {
    j.t += dt;
    const T = j.target;
    if (j.phase === 'cat') {
      j.spd = Math.min(280, j.spd + 300 * dt); j.x += j.spd * dt;
      if (j.x > c.x + 90) j.phase = 'climb';
    } else if (j.phase === 'land') {
      j.spd = Math.max(0, j.spd - 300 * dt); j.ang = turnToward(j.ang, 0, 3 * dt);
      j.x += Math.cos(j.ang) * j.spd * dt; j.y += (c.y - 4 - j.y) * Math.min(1, dt * 4); j.z = Math.max(0, j.z - 50 * dt);
      if (j.spd <= 0) { j.done = true; j.slot.state = 'rearm'; j.slot.t = AIR.rearm; }
    } else if (j.phase === 'final') {
      const B = j.path;
      B.u = Math.min(1, B.u + j.spd * dt / B.len);
      const u = B.u, iu = 1 - u;
      const bx = iu * iu * iu * B.p[0][0] + 3 * iu * iu * u * B.p[1][0] + 3 * iu * u * u * B.p[2][0] + u * u * u * B.p[3][0];
      const by = iu * iu * iu * B.p[0][1] + 3 * iu * iu * u * B.p[1][1] + 3 * iu * u * u * B.p[2][1] + u * u * u * B.p[3][1];
      const dx = 3 * iu * iu * (B.p[1][0] - B.p[0][0]) + 6 * iu * u * (B.p[2][0] - B.p[1][0]) + 3 * u * u * (B.p[3][0] - B.p[2][0]);
      const dy = 3 * iu * iu * (B.p[1][1] - B.p[0][1]) + 6 * iu * u * (B.p[2][1] - B.p[1][1]) + 3 * u * u * (B.p[3][1] - B.p[2][1]);
      j.x = bx; j.y = by; if (dx || dy) j.ang = Math.atan2(dy, dx);
      j.spd += (180 - j.spd) * Math.min(1, dt * 1.2);
      j.z += (14 - j.z) * Math.min(1, dt * 1.4);
      if (u >= 1) { j.phase = 'land'; j.ang = 0; }
    } else {
      if (!j.dropped && T.alive && T.gen === j.gen) { j.tx = T.x; j.ty = T.y; }
      let gx = j.tx, gy = j.ty;
      if (j.phase === 'egress') { gx = c.x - 40; gy = c.y - 150; }
      const da = Math.atan2(gy - j.y, gx - j.x);
      j.ang = turnToward(j.ang, da, 2.1 * dt);
      j.spd += (310 - j.spd) * Math.min(1, dt * 1.6);
      j.x += Math.cos(j.ang) * j.spd * dt; j.y += Math.sin(j.ang) * j.spd * dt;
      j.z += (78 - j.z) * Math.min(1, dt * 1.2);
      const d = dist(j.x, j.y, gx, gy);
      if (j.phase === 'climb' && j.t > 1.3) j.phase = 'ingress';
      if (j.phase === 'ingress' && !j.dropped) { if ((d < 140 && Math.abs(angDiff(j.ang, da)) < 0.45) || j.t > 16) dropBombs(j); }
      else if (j.phase === 'egress' && d < 190) {
        const p = [[j.x, j.y], [j.x + Math.cos(j.ang) * 170, j.y + Math.sin(j.ang) * 170], [c.x - 200, c.y - 4], [c.x - 90, c.y - 4]];
        let len = 0, px = p[0][0], py = p[0][1];
        for (let i = 1; i <= 12; i++) { const u = i / 12, iu = 1 - u; const qx = iu * iu * iu * p[0][0] + 3 * iu * iu * u * p[1][0] + 3 * iu * u * u * p[2][0] + u * u * u * p[3][0], qy = iu * iu * iu * p[0][1] + 3 * iu * iu * u * p[1][1] + 3 * iu * u * u * p[2][1] + u * u * u * p[3][1]; len += Math.hypot(qx - px, qy - py); px = qx; py = qy; }
        j.path = { p, len: Math.max(60, len), u: 0 }; j.phase = 'final';
      }
    }
    j.ang = Math.atan2(Math.sin(j.ang), Math.cos(j.ang));
    j.sx = j.x; j.sy = j.y - j.z;
    j.acc += dt;
    while (j.acc > 0.03) {
      j.acc -= 0.03;
      if (j.z > 45) for (const sg of [-1, 1]) {
        const a = j.ang + sg * Math.PI / 2;
        P({ k: 'soft', spr: SPR.smoke, x: j.sx + Math.cos(a) * 9 - Math.cos(j.ang) * 4, y: j.sy + Math.sin(a) * 9 - Math.sin(j.ang) * 4, vx: rand(-2, 2), vy: rand(-2, 2), wind: 2, life: 1.3, s0: 1.2, s1: 5, a0: 0.28 });
      }
      if (j.phase === 'cat' || j.phase === 'climb') P({ k: 'soft', spr: SPR.grey, x: j.sx - Math.cos(j.ang) * 15, y: j.sy - Math.sin(j.ang) * 15, vx: rand(-8, 8), vy: rand(-8, 8), wind: 4, drag: 0.8, life: rand(0.8, 1.3), s0: 3, s1: 12, a0: 0.3, fadeIn: true });
    }
  }
  S.jets = S.jets.filter((j) => !j.done);
  for (const s of c.slots) if (s.state === 'rearm') { s.t -= dt; if (s.t <= 0) { s.state = 'ready'; popup(c.x, c.y - 52, 'F-35 REARMED', '#7cffb2', 11); } }
}
function dropBombs(j) {
  j.dropped = true; j.phase = 'egress';
  const base = { x0: j.x, y0: j.y, z0: j.z, T: 0, target: j.target, gen: j.gen, x: j.x, y: j.y, z: j.z, sx: j.sx, sy: j.sy, ang: j.ang, dead: false };
  if (j.weapon === 'bunker') S.bombs.push(Object.assign({}, base, { kind: 'bunker', tx: j.tx, ty: j.ty, dur: 1.5, delay: 0, last: true }));
  else for (let i = 0; i < 2; i++) S.bombs.push(Object.assign({}, base, { kind: 'jdam', tx: j.tx + rand(-6, 6), ty: j.ty + rand(-4, 4), dur: 1.1, delay: i * 0.22, last: i === 1 }));
  SFX.whistle();
}
function updBombs(dt) {
  for (const b of S.bombs) {
    if (b.delay > 0) { b.delay -= dt; continue; }
    b.T += dt / b.dur;
    const T = Math.min(1, b.T);
    b.x = lerp(b.x0, b.tx, T); b.y = lerp(b.y0, b.ty, T); b.z = b.z0 * (1 - T * T);
    b.sx = b.x; b.sy = b.y - b.z;
    b.ang = Math.atan2((b.ty - b.y0) + 2 * b.z0 * T, b.tx - b.x0);
    if (b.T >= 1) { b.dead = true; bombImpact(b); }
  }
  S.bombs = S.bombs.filter((b) => !b.dead);
}
function drawBombs(shadow) {
  for (const b of S.bombs) {
    if (b.delay > 0) continue;
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 3, 1.5, 0, 0, TAU); ctx.fill(); continue; }
    const big = b.kind === 'bunker';
    ctx.save(); ctx.translate(b.sx, b.sy); ctx.rotate(b.ang);
    ctx.fillStyle = big ? '#5b6652' : '#3d444a'; rr(ctx, big ? -8 : -5, big ? -2 : -1.4, big ? 16 : 10, big ? 4 : 2.8, 1.4); ctx.fill();
    ctx.fillStyle = '#1d2124'; ctx.fillRect(big ? -9 : -6, big ? -3 : -2, 2, big ? 6 : 4);
    ctx.restore();
  }
}
function bombImpact(b) {
  const T = b.target;
  if (b.kind === 'bunker') { bunkerBlast(b.tx, b.ty, T); return; }
  explode(b.tx, b.ty, 2);
  if (T.kind === 'launcher' && T.alive && T.gen === b.gen && dist(b.tx, b.ty, T.x, T.y) < 30) {
    T.hp -= AIR.strikeDmg / 2;
    if (T.hp <= 0) destroyLauncher(T);
    else if (b.last) popup(T.x, T.y - 30, `LAUNCHER HIT: ARMOR ${Math.max(0, Math.ceil(T.hp))}/${T.max}`, '#ffcf6b', 13);
  } else if (b.last && T.alive) popup(b.tx, b.ty - 30, 'MISSED: LAUNCHER RELOCATED', '#ffcf6b', 13);
}
function bunkerBlast(x, y, B) {
  for (let i = 0; i < 8; i++) puff(x, y, { spr: SPR.dust, s0: 4, s1: 14, a0: 0.6, life: rand(0.8, 1.4), vx: rand(-40, 40), vy: rand(-30, 10) });
  light(x, y, 30, 0.15, 0.6); addShake(3); SFX.thud();
  popup(x, y - 26, 'PENETRATING...', '#ffcf6b', 12, 1);
  demoEvent(x, y + 30, 1.8, 4.5, 12);
  later(0.8, () => {
    explode(x, y, 4.2);
    flashA = Math.max(flashA, 0.45); slowmo(0.8); addShake(14);
    for (let i = 0; i < 52; i++) { const a = i / 52 * TAU; P({ k: 'soft', spr: SPR.dust, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 7, vx: Math.cos(a) * rand(140, 240), vy: Math.sin(a) * rand(90, 160), drag: 2.3, life: rand(1.6, 2.6), s0: 8, s1: rand(22, 32), a0: 0.55, fadeIn: true }); }
    P({ k: 'ring', add: true, c: 'rgb(255,220,180)', w: 6, x, y, life: 0.9, s0: 10, s1: 200, a0: 0.8 });
    for (let k = 0; k < 34; k++) P({ k: 'soft', spr: Math.random() < 0.4 ? SPR.yellow : SPR.fire, add: true, x: x + rand(-14, 14), y: y + rand(-8, 8), vx: rand(-25, 25), vy: -rand(60, 210), drag: 1.1, life: rand(0.9, 1.7), s0: rand(12, 24), s1: 3, a0: 0.9 });
    light(x, y, 240, 0.8, 0.8);
    for (let i = 0; i < 5; i++) later(0.3 + i * 0.3, () => explode(x + rand(-46, 46), y + rand(-24, 24), rand(1.8, 2.8)));
    addFire(x, y, 1.8); scorch(x, y, 50);
    if (B && B.alive) destroyBunker(B);
  });
}
function destroyBunker(B) {
  B.alive = false; B.revealed = false; S.stats.bunkersKilled++;
  S.treasury += AIR.bunkerBounty; S.stats.bounty += AIR.bunkerBounty;
  const left = S.bunkers.filter((b) => b.alive).length;
  popup(B.x, B.y - 40, `+${money(AIR.bunkerBounty, true)} BOUNTY`, '#7cffb2', 18, 2.4);
  banner('UNDERGROUND BASE DESTROYED', left ? `${left} base${left > 1 ? 's' : ''} left. Fewer ballistic missiles from now on.` : 'No underground bases left. Ballistic attacks reduced to a trickle.', '#7cffb2', 3);
  SFX.cash();
}
function placeBunkers() { S.bunkers.forEach((B, i) => { B.x = 210 + i * 430 + rand(-90, 90); B.y = Math.max(HUD_H + 26, enemyShore(B.x) - rand(58, 82)); }); }
function revealSource(src) { if (src.kind === 'bunker') revealBunker(src); else revealLauncher(src); }
function revealBunker(B) {
  if (!B.revealed) { B.revealed = true; B.pingT = 0; B.fade = 0; SFX.ping(); if (!B.known) popup(B.x, B.y - 34, 'UNDERGROUND BASE LOCATED', '#ffb347', 13, 2.2); }
  B.known = true; B.revealT = 12;
}
function updBunkers(dt) {
  for (const B of S.bunkers) {
    if (!B.alive || !B.revealed) continue;
    B.revealT -= dt; B.pingT -= dt; B.fade = Math.min(1, B.fade + dt * 4);
    if (B.pingT <= 0) { B.pingT = 1.25; P({ k: 'ring', add: true, c: 'rgb(255,170,60)', w: 2.5, x: B.x, y: B.y, life: 1.2, s0: 6, s1: 52, a0: 0.9 }); }
    if (B.revealT <= 0) B.revealed = false;
  }
}
function drawBunkers() {
  for (const B of S.bunkers) {
    if (!B.alive) {
      if (!B.known) continue;
      ctx.fillStyle = '#0f0c0a'; ctx.beginPath(); ctx.ellipse(B.x, B.y, 24, 16, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(120,100,80,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(B.x, B.y, 29, 20, 0, 0, TAU); ctx.stroke();
      continue;
    }
    if (!B.known) continue;
    ctx.save(); ctx.globalAlpha = B.revealed ? Math.min(1, B.fade + 0.4) : 0.6; ctx.translate(B.x, B.y);
    ctx.fillStyle = '#4a4030'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5e5442'; ctx.beginPath(); ctx.ellipse(0, -1, 18, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8d8a82'; ctx.beginPath(); ctx.moveTo(-10, 5); ctx.lineTo(10, 5); ctx.lineTo(7, -6); ctx.lineTo(-7, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#101010'; ctx.fillRect(-5, -3, 10, 8);
    ctx.fillStyle = '#2a2620'; circle(ctx, -16, -4, 2.2); circle(ctx, 16, -3, 2.2);
    ctx.strokeStyle = B.revealed ? '#ffb347' : 'rgba(255,179,71,0.6)'; ctx.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(sx * 30, sy * 12); ctx.lineTo(sx * 30, sy * 21); ctx.lineTo(sx * 20, sy * 21); ctx.stroke(); }
    ctx.font = '700 10px ' + FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const lbl = B.revealed ? 'UNDERGROUND BASE' : 'BASE · LAST KNOWN';
    ctx.strokeText(lbl, 0, 34); ctx.fillStyle = '#ffb347'; ctx.fillText(lbl, 0, 34);
    if (jetsReady() && (S.mode === 'prep' || S.mode === 'wave')) { ctx.strokeText('CLICK: BUNKER BUSTER', 0, 46); ctx.fillStyle = '#ffd36b'; ctx.fillText('CLICK: BUNKER BUSTER', 0, 46); }
    ctx.restore();
  }
}
function selectCarrier() {
  ui.sel = S.carrier; ui.panel = { kind: 'carrier' };
  elPanel.innerHTML = `<div class="ph"><span>CARRIER AIR WING</span><button class="x" data-act="close">✕</button></div>
    <div class="row"><span>F-35s READY</span><b id="c-ready"></b></div>
    <div class="row"><span>PRECISION STRIKE</span><b>${money(AIR.strikeCost, true)} / sortie</b></div>
    <div class="row"><span>BUNKER BUSTER</span><b>${money(AIR.busterCost, true)} / sortie</b></div>
    <div class="hint">While the carrier is selected, click a <span class="warn">red-pinged launcher</span> to send an F-35 with 2 guided bombs.<br>Click an <span class="warn">orange underground base</span> at any time to send a bunker buster. Each base destroyed cuts ballistic missiles for the rest of the war.</div>`;
  placePanel({ x: S.carrier.x + 70, y: S.carrier.y - 14 }, 300); refreshPanel();
}
function carrierAt(x, y) { const c = S.carrier; return Math.abs(x - c.x) < 92 && Math.abs(y - c.y) < 24; }
function bunkerAt(x, y) { return S.bunkers.find((B) => B.alive && B.known && dist(x, y, B.x, B.y) < 30) || null; }

// ============================== CAMERA ==============================
const cam = { x: W / 2, y: H / 2, z: 1, tx: W / 2, ty: H / 2, tz: 1, follow: null };
function camTo(x, y, z) { cam.follow = null; cam.tx = x; cam.ty = y; cam.tz = z; }
function camFollow(o, z) { cam.follow = o; cam.tz = z; }
function camReset() { cam.follow = null; cam.x = cam.tx = W / 2; cam.y = cam.ty = H / 2; cam.z = cam.tz = 1; }
function objGone(o) { return !o || o.dead === true || o.done === true || o.alive === false; }
function updCam(dt) {
  if (cam.follow) {
    if (objGone(cam.follow)) cam.follow = null;
    else { cam.tx = cam.follow.sx !== undefined ? cam.follow.sx : cam.follow.x; cam.ty = cam.follow.sy !== undefined ? cam.follow.sy : cam.follow.y; }
  }
  const k = 1 - Math.exp(-dt * 2.4);
  cam.z += (cam.tz - cam.z) * k;
  const hw = W / (2 * cam.z), hh = H / (2 * cam.z);
  cam.x += (clamp(cam.tx, hw, W - hw) - cam.x) * k; cam.y += (clamp(cam.ty, hh, H - hh) - cam.y) * k;
  cam.x = clamp(cam.x, hw, W - hw); cam.y = clamp(cam.y, hh, H - hh);
}
function worldToScreen(x, y) { return { x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 }; }

// ============================== DEMO: AI COMMANDER ==============================
const PERSONAS = [
  { name: 'BALANCED', desc: 'mixes air defense with counter-strikes', order: [[2, 'ciws'], [3, 'patriot'], [4, 'himars'], [1, 'ciws'], [5, 'ciws'], [0, 'patriot']], reserve: 6e6, heavyFirst: false, busterAt: 14e6, strikeAt: 14e6 },
  { name: 'HUNTER', desc: 'goes after launchers and bases early', order: [[2, 'ciws'], [4, 'himars'], [3, 'patriot'], [1, 'ciws'], [5, 'himars'], [0, 'ciws']], reserve: 5e6, heavyFirst: false, busterAt: 10e6, strikeAt: 10e6 },
  { name: 'SHIELD', desc: 'builds a deep air-defense wall first', order: [[2, 'ciws'], [3, 'patriot'], [1, 'ciws'], [5, 'ciws'], [4, 'himars'], [0, 'patriot']], reserve: 8e6, heavyFirst: true, busterAt: 18e6, strikeAt: 18e6 },
];
const D = { on: false, games: 0, offset: 0, persona: PERSONAS[0], actions: [], act: null, cur: { x: W / 2, y: H / 2, vis: false }, thinkT: 0, shot: null, shotT: 0, shotP: 0, letter: 0, fade: 0, fadeT: 0, endT: 0, seenWaste: 0, used: {}, manualT: 0 };
const elDemo = document.getElementById('demoUI');
const elCap = document.getElementById('demoCaption');
const elCur = document.getElementById('demoCursor');
const elDemoSound = document.getElementById('demoSound');

function say(title, text, tone = '') {
  if (!S.demo) return;
  elCap.innerHTML = `<b class="${tone}">${title}</b><span>${text}</span>`;
  elCap.classList.remove('show'); void elCap.offsetWidth; elCap.classList.add('show');
}
function sayOnce(key, title, text, tone) { if (D.used[key]) return false; D.used[key] = true; say(title, text, tone); return true; }
function demoEvent(x, y, z, hold, prio) {
  if (!S.demo) return;
  if (D.shotT > 0 && prio < D.shotP && !objGone(D.shot)) return;
  camTo(x, y, z); D.shot = {}; D.shotT = hold; D.shotP = prio;
}
function qWorld(x, y, track) { D.actions.push({ kind: 'world', x, y, track }); }
function qEl(sel) { D.actions.push({ kind: 'el', sel }); }
function qDo(fn) { D.actions.push({ kind: 'do', fn }); }
function elStagePos(sel) {
  const el = document.querySelector(sel);
  if (!el || el.offsetParent === null) return null;
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  return { el, x: (r.left + r.width / 2 - s.left) / VS, y: (r.top + r.height / 2 - s.top) / VS };
}
function clickFx() { elCur.classList.remove('click'); void elCur.offsetWidth; elCur.classList.add('click'); SFX.click(); }
function runActions(dt) {
  if (!D.act) {
    if (!D.actions.length) return;
    D.act = D.actions.shift(); D.act.t = 0;
    if (D.act.kind === 'do') { D.act.fn(); D.act = null; return; }
  }
  const a = D.act; a.t += dt;
  let tx, ty;
  if (a.kind === 'world') {
    if (a.track) { if (objGone(a.track)) { D.act = null; D.actions = []; closePanel(); return; } a.x = a.track.sx; a.y = a.track.sy; }
    const p = worldToScreen(a.x, a.y); tx = p.x; ty = p.y;
  } else {
    const p = elStagePos(a.sel);
    if (!p) { D.act = null; return; }
    tx = p.x; ty = p.y; a.el = p.el;
  }
  D.cur.vis = true;
  const k = Math.min(1, dt * 7);
  D.cur.x += (tx - D.cur.x) * k; D.cur.y += (ty - D.cur.y) * k;
  if (!a.clicked && a.t > 0.5 && Math.hypot(tx - D.cur.x, ty - D.cur.y) < 6) {
    a.clicked = true; a.wait = 0.35; clickFx();
    if (a.kind === 'world') handleWorldClick(a.x, a.y); else a.el.click();
  }
  if (a.clicked) { a.wait -= dt; if (a.wait <= 0) D.act = null; }
  if (a.t > 4) D.act = null;
}
function aiThink() {
  const P2 = S.pads, c = S.carrier, pr = D.persona;
  if (S.mode !== 'prep' && S.mode !== 'wave') return;
  if (D.shotT > 0 && D.shotP >= 9 && !objGone(D.shot)) return;
  // 1. Learn from a wasted Patriot shot
  if (S.stats.patriotWaste > D.seenWaste) {
    D.seenWaste = S.stats.patriotWaste;
    const p = P2.find((u) => u && u.type === 'patriot' && u.mode === 'auto');
    if (p) {
      say('COMMANDER', 'That Patriot just fired $4M at a $20K drone. Switching it to HEAVY ONLY.', 'red');
      qWorld(p.x, p.y); qEl('#panel [data-act="mode"]'); qDo(closePanel); return;
    }
  }
  // 2. Bunker buster on a known underground base
  const B = S.bunkers.find((b) => b.alive && b.known && !S.jets.some((j) => j.target === b));
  if (B && jetsReady() && S.treasury > pr.busterAt) {
    say('COMMANDER', 'Underground missile base located. Sending an F-35 with a bunker buster: $20M, one shot.', 'amb');
    qWorld(c.x, c.y); qWorld(B.x, B.y); qDo(closePanel); return;
  }
  // 3. Counter-strike an exposed launcher
  const L = S.launchers.find((l) => l.alive && l.revealed && l.revealT > 3.2 && !S.rockets.some((r) => r.L === l) && !S.jets.some((j) => j.target === l));
  if (L) {
    if (P2.some(himarsReady)) { say('COMMANDER', 'Launcher exposed. HIMARS salvo before it relocates.'); qWorld(L.x, L.y); return; }
    if (jetsReady() && S.treasury > pr.strikeAt) { say('COMMANDER', 'HIMARS is reloading. Launching an F-35 from the carrier instead.'); qWorld(c.x, c.y); qWorld(L.x, L.y); qDo(closePanel); return; }
  }
  // 4. Build or rebuild
  for (const [pad, type] of pr.order) {
    if (P2[pad]) continue;
    if (S.treasury < UNIT[type].build + (S.wave === 0 ? 0 : pr.reserve)) break;
    const lines = { ciws: 'a CIWS, the cheap answer to drone swarms.', patriot: 'a Patriot battery for the missile threat.', himars: 'a HIMARS to hunt the mobile launchers.' };
    say('COMMANDER', `Deploying ${lines[type]}`);
    qWorld(PADS[pad].x, PADS[pad].y); qEl(`#panel .card[data-unit="${type}"]`);
    if (type === 'patriot' && pr.heavyFirst) { qEl('#panel [data-act="mode"]'); qDo(() => say('COMMANDER', 'Patriot set to HEAVY ONLY from the start. No $4M shots at drones.')); }
    qDo(closePanel);
    return;
  }
  // 5. Manual Patriot shot on a cruise missile closing in
  const pat = P2.find((u) => u && u.type === 'patriot' && u.tubes.includes(1));
  if (pat && D.manualT <= 0) {
    const cm = S.threats.find((t) => t.type === 'cruise' && t.engaged === 0 && dist(t.x, t.y, t.tx, t.ty) < 300 && t.sy > HUD_H + 40);
    if (cm) {
      D.manualT = 25;
      say('COMMANDER', 'Cruise missile slipping through. Taking a manual Patriot shot.', 'amb');
      qWorld(pat.x, pat.y); qWorld(cm.sx, cm.sy, cm); qDo(closePanel); return;
    }
  }
  // 6. Call the next wave early
  if (S.mode === 'prep' && S.prepT < 6 && S.prepT > 1.2 && P2.filter(Boolean).length >= 3) {
    qDo(() => { sayOnce('early', 'COMMANDER', 'Defenses ready. Calling the next wave early for the $0.5M bonus.'); nextWaveNow(); });
  }
}
function directorTick(dt) {
  D.shotT -= dt;
  if (D.act || D.actions.length) {
    if (cam.tz > 1.01 || cam.follow) camTo(W / 2, H / 2, 1);
    return;
  }
  if (D.shotT > 0 && !objGone(D.shot)) return;
  const cands = [];
  for (const t of S.threats) if (t.type === 'ballistic' && t.T > 0.42 && !t.cw) cands.push([10, t, 1.55, 3.4, 'cw']);
  for (const j of S.jets) {
    if (j.phase === 'cat' && !j.cw1) cands.push([9, j, 2.0, 2.6, 'cw1']);
    else if (j.phase === 'ingress' && !j.cw2 && dist(j.x, j.y, j.tx, j.ty) < 420) cands.push([9, j, 1.5, 3, 'cw2']);
  }
  for (const b of S.bombs) if (b.kind === 'bunker' && !b.cw) cands.push([11, b, 1.8, 3, 'cw']);
  for (const r of S.rockets) if (!r.salvo.cw) cands.push([7, r, 1.25, 2.4, 'salvo']);
  for (const m of S.missiles) if (m.phase === 'guide' && m.target && m.target.type === 'cruise' && !m.cw) cands.push([5, m, 1.45, 2.2, 'cw']);
  if (!cands.length) {
    if (cam.tz > 1.01 || cam.follow) camTo(W / 2, H / 2, 1);
    D.shot = {}; D.shotT = 1.2; D.shotP = 0; return;
  }
  cands.sort((a, b) => b[0] - a[0]);
  const [p, o, z, hold, flag] = cands[0];
  if (flag === 'salvo') o.salvo.cw = true; else o[flag] = true;
  camFollow(o, z); D.shot = o; D.shotT = hold; D.shotP = p;
}
function demoTick(dt) {
  if (!D.on) return;
  D.manualT -= dt;
  if (S.mode === 'over') {
    D.endT -= dt;
    if (cam.tz > 1.01 || cam.follow) camTo(W / 2, H / 2, 1);
    if (D.endT < 1.3) D.fadeT = 1;
    if (D.endT <= 0) newDemoGame();
    return;
  }
  runActions(dt);
  directorTick(dt);
  D.thinkT -= dt;
  if (D.thinkT <= 0 && !D.act && !D.actions.length) { D.thinkT = 0.8; aiThink(); }
  if (!D.act && !D.actions.length) D.cur.vis = false;
}
function newDemoGame() {
  D.games++;
  D.persona = PERSONAS[(D.games - 1 + D.offset) % PERSONAS.length];
  S = newState(); parts = []; S.demo = true;
  placeBunkers(); for (const L of S.launchers) placeLauncher(L);
  S.mode = 'prep'; S.prepT = 14;
  closePanel(); camReset();
  D.actions = []; D.act = null; D.seenWaste = 0; D.used = {}; D.shot = null; D.shotT = 0; D.shotP = 0; D.thinkT = 2; D.manualT = 30; D.endT = 0;
  D.fade = 1; D.fadeT = 0;
  say(`AI COMMANDER · GAME ${D.games}`, `Strategy: ${D.persona.name}, ${D.persona.desc}. Every game plays out differently.`);
  refreshButtons();
}
function startDemo() {
  SFX.init();
  D.on = true; D.games = 0; D.offset = randi(0, PERSONAS.length - 1);
  elDemo.classList.remove('hidden'); elOverlay.classList.add('hidden'); elPause.classList.add('hidden');
  document.getElementById('hudButtons').classList.add('hidden');
  newDemoGame();
}
function stopDemo(play) {
  D.on = false; D.actions = []; D.act = null; D.cur.vis = false; D.fade = 0; D.fadeT = 0;
  elDemo.classList.add('hidden'); document.getElementById('hudButtons').classList.remove('hidden');
  camReset();
  if (play) startGame(); else showTitle();
}
function showTitle() {
  S = newState(); parts = []; placeBunkers(); for (const L of S.launchers) placeLauncher(L);
  closePanel(); camReset();
  elOverlay.innerHTML = START_HTML; elOverlay.classList.remove('hidden');
  refreshButtons(); ui.lastInput = performance.now();
}
function drawDemoBars() {
  const L = D.letter; if (L <= 0.001) return;
  const th = 50 * L, bh = 48 * L;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, th); ctx.fillRect(0, H - bh, W, bh);
  if (!D.on || L < 0.9) return;
  const blink = Math.sin(S.time * 5) > 0;
  ctx.fillStyle = blink ? '#ff3b30' : '#7a1d18'; circle(ctx, 18, 25, 5);
  ctx.textAlign = 'left'; ctx.font = '800 12px ' + FONT; ctx.fillStyle = '#fff'; ctx.fillText('LIVE · AI COMMANDER', 30, 22);
  ctx.font = '600 10px ' + FONT; ctx.fillStyle = '#8fa9b8'; ctx.fillText(`GAME ${D.games} · ${D.persona.name} STRATEGY`, 30, 37);
  const s = S.stats, ratio = s.enemy > 0 ? s.your / s.enemy : 0;
  const items = [
    ['WAVE', `${S.wave} / 10`, '#ffffff', 84], ['TREASURY', money(S.treasury), S.treasury < 0 ? '#ff4d4d' : '#7cffb2', 112],
    ['DEFENSE SPENT', money(s.your), '#ff6b5a', 122], ['ATTACKER SPENT', money(s.enemy), '#ffc04d', 122], ['COST RATIO', ratio ? ratio.toFixed(1) + ' : 1' : '—', '#ffffff', 100],
  ];
  let x = 218;
  for (const [l, v, c, w] of items) {
    ctx.font = '700 9px ' + FONT; ctx.fillStyle = '#5f8fa8'; ctx.fillText(l, x, 18);
    ctx.font = '700 15px ' + MONO; ctx.fillStyle = c; ctx.fillText(v, x, 37); x += w;
  }
}

// ============================== INPUT ==============================
function toLocal(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
function threatAt(x, y) {
  let best = null, bd = 26;
  for (const t of S.threats) { if (!t.alive || t.sy < HUD_H) continue; const d = dist(x, y, t.sx, t.sy); if (d < bd) { bd = d; best = t; } }
  return best;
}
function launcherAt(x, y) { return S.launchers.find((L) => L.alive && L.revealed && dist(x, y, L.x, L.y) < 30) || null; }
function padAt(x, y) { return PADS.findIndex((p) => Math.abs(x - p.x) < 36 && Math.abs(y - p.y) < 30); }

cv.addEventListener('pointermove', (e) => {
  const p = toLocal(e); ui.mx = p.x; ui.my = p.y;
  if (D.on || (S.mode !== 'prep' && S.mode !== 'wave')) { cv.style.cursor = 'default'; return; }
  const hot = padAt(p.x, p.y) >= 0 || launcherAt(p.x, p.y) || bunkerAt(p.x, p.y) || carrierAt(p.x, p.y) || (ui.sel && ui.sel.type === 'patriot' && threatAt(p.x, p.y));
  cv.style.cursor = hot ? 'pointer' : 'crosshair';
});
cv.addEventListener('pointerdown', (e) => {
  SFX.init();
  if (D.on) return;
  const p = toLocal(e); ui.mx = p.x; ui.my = p.y;
  if ((S.mode !== 'prep' && S.mode !== 'wave') || S.paused) return;
  handleWorldClick(p.x, p.y);
});
function handleWorldClick(x, y) {
  if (ui.sel && ui.sel.type === 'patriot' && !ui.sel.dead) {
    const t = threatAt(x, y);
    if (t) {
      if (!firePatriot(ui.sel, t, true)) { SFX.err(); popup(ui.sel.x, ui.sel.y - 52, 'RELOADING', '#ffcf6b', 12); }
      else refreshPanel();
      return;
    }
  }
  const B = bunkerAt(x, y);
  if (B) {
    if (!launchStrike(B, 'bunker')) { SFX.err(); popup(B.x, B.y - 30, 'NO F-35 READY', '#ffcf6b', 13); }
    if (ui.sel === S.carrier) closePanel();
    return;
  }
  const L = launcherAt(x, y);
  if (L) {
    if (ui.sel === S.carrier) {
      if (!launchStrike(L, 'jdam')) { SFX.err(); popup(L.x, L.y - 28, 'NO F-35 READY', '#ffcf6b', 13); }
      closePanel(); return;
    }
    let u = himarsReady(ui.sel) ? ui.sel : null;
    if (!u) { let bd = 1e9; for (const h of S.pads) if (himarsReady(h)) { const d = Math.abs(h.x - L.x); if (d < bd) { bd = d; u = h; } } }
    if (u) fireSalvo(u, L);
    else { SFX.err(); popup(L.x, L.y - 28, jetsReady() ? 'NO HIMARS READY: SELECT THE CARRIER FOR AN F-35' : S.pads.some((h) => h && h.type === 'himars') ? 'HIMARS RELOADING' : 'DEPLOY A HIMARS TO STRIKE', '#ffcf6b', 13); }
    return;
  }
  if (carrierAt(x, y)) { SFX.click(); selectCarrier(); return; }
  const i = padAt(x, y);
  if (i >= 0) { SFX.click(); if (S.pads[i]) selectUnit(S.pads[i]); else openShop(i); return; }
  if (ui.panel) closePanel();
}
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (D.on) { SFX.init(); if (k === 'escape') stopDemo(false); else if (k === 'm') toggleMute(); return; }
  if (k === 'm') { SFX.init(); toggleMute(); }
  else if (k === 'escape' && ui.panel) closePanel();
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'n') nextWaveNow();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && (S.mode === 'prep' || S.mode === 'wave')) togglePause(true); });
window.addEventListener('resize', resize);
for (const ev of ['pointerdown', 'pointermove', 'keydown']) window.addEventListener(ev, () => { ui.lastInput = performance.now(); });

// ============================== RENDER ==============================
const droneShape = [[11, 0], [3, 2.5], [-6, 10], [-8.5, 10], [-6, 2], [-9, 1.5], [-9, -1.5], [-6, -2], [-8.5, -10], [-6, -10], [3, -2.5]];
function pathShape(g, pts, s) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.closePath(); }

function drawAmbient() {
  ctx.lineWidth = 1;
  for (const d of S.dashes) {
    const a = 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(S.time * 0.8 + d.ph));
    ctx.strokeStyle = `rgba(140,200,230,${a})`;
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len, d.y); ctx.stroke();
  }
  // radar sweep
  ctx.save(); ctx.beginPath(); ctx.rect(0, HUD_H, W, 520); ctx.clip();
  const a = S.radarA % TAU, cx = 640, cy = 690, tail = 0.55;
  if (ctx.createConicGradient) {
    const g = ctx.createConicGradient(a - tail, cx, cy);
    const f = tail / TAU;
    g.addColorStop(0, 'rgba(60,220,255,0)'); g.addColorStop(f * 0.999, 'rgba(60,220,255,0.10)'); g.addColorStop(f * 1.001, 'rgba(60,220,255,0)'); g.addColorStop(1, 'rgba(60,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 820, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(90,230,255,0.25)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 820, cy + Math.sin(a) * 820); ctx.stroke();
  ctx.restore();
  for (const s of S.ships) drawShip(s);
}
function drawShip(s) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.scale(s.dir, 1);
  const L = s.len;
  ctx.strokeStyle = 'rgba(200,230,245,0.16)'; ctx.lineWidth = 1.2;
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 30 * i, -7 * i); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 30 * i, 7 * i); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(3, 4, L / 2, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3d2b27'; ctx.beginPath();
  ctx.moveTo(L / 2, 0); ctx.quadraticCurveTo(L / 2 - 4, -8, L / 2 - 16, -8.5); ctx.lineTo(-L / 2 + 3, -8.5); ctx.lineTo(-L / 2, -6); ctx.lineTo(-L / 2, 6); ctx.lineTo(-L / 2 + 3, 8.5); ctx.lineTo(L / 2 - 16, 8.5); ctx.quadraticCurveTo(L / 2 - 4, 8, L / 2, 0); ctx.fill();
  ctx.fillStyle = '#4d5a50'; ctx.fillRect(-L / 2 + 18, -6, L - 38, 12);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  for (let x = -L / 2 + 26; x < L / 2 - 22; x += 12) { ctx.beginPath(); ctx.arc(x, 0, 3, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = '#d8d6cf'; ctx.fillRect(-L / 2 + 4, -6, 11, 12);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-L / 2 + 7, -2, 4, 4);
  const blink = Math.sin(S.time * 3 + s.x) > 0.7;
  ctx.fillStyle = blink ? '#ff4d4d' : '#552020'; ctx.fillRect(L / 2 - 6, -6, 2, 2);
  ctx.fillStyle = blink ? '#4dff88' : '#205530'; ctx.fillRect(L / 2 - 6, 4, 2, 2);
  ctx.restore();
}
function drawScorches() {
  ctx.globalAlpha = 0.5;
  for (const s of S.scorches) ctx.drawImage(SPR.dark, s.x - s.r, s.y - s.r * 0.7, s.r * 2, s.r * 1.4);
  ctx.globalAlpha = 1;
}
function drawPads() {
  const hoverI = padAt(ui.mx, ui.my);
  const hintPulse = S.mode === 'prep' && S.wave === 0 && !S.pads.some(Boolean);
  PADS.forEach((p, i) => {
    const u = S.pads[i];
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, -31, -23, 68, 54, 4); ctx.fill();
    ctx.fillStyle = '#3a3f42'; rr(ctx, -34, -27, 68, 54, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, 0); ctx.moveTo(0, -27); ctx.lineTo(0, 27); ctx.stroke();
    ctx.strokeStyle = '#d9b43a'; ctx.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.moveTo(sx * 30, sy * 15); ctx.lineTo(sx * 30, sy * 23); ctx.lineTo(sx * 22, sy * 23); ctx.stroke();
    }
    if (!u) {
      const hov = hoverI === i && (S.mode === 'prep' || S.mode === 'wave');
      const pulse = hintPulse ? 0.5 + 0.5 * Math.sin(S.time * 5) : 0;
      if (hov || pulse > 0) { ctx.strokeStyle = `rgba(90,210,255,${hov ? 0.9 : 0.25 + 0.5 * pulse})`; ctx.lineWidth = 2; rr(ctx, -34, -27, 68, 54, 4); ctx.stroke(); }
      ctx.strokeStyle = hov ? '#8fdcff' : 'rgba(143,220,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(7, -3); ctx.moveTo(0, -10); ctx.lineTo(0, 4); ctx.stroke();
      ctx.fillStyle = hov ? '#8fdcff' : 'rgba(143,220,255,0.5)'; ctx.font = '700 9px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(hov ? 'DEPLOY' : `PAD ${i + 1}`, 0, 18);
    }
    ctx.restore();
  });
}
function drawLaunchers() {
  for (const L of S.launchers) {
    if (!L.alive) { ctx.fillStyle = '#1a1512'; ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.rot); ctx.fillRect(-7, -16, 14, 32); ctx.restore(); continue; }
    if (!L.revealed) continue;
    const a = Math.min(L.fade, L.revealT * 1.5, 1);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(L.x, L.y);
    ctx.save(); ctx.rotate(L.rot);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-4, -14, 14, 34);
    ctx.fillStyle = '#5b4a3c'; ctx.fillRect(-7, -17, 14, 34);
    ctx.fillStyle = '#6c5a48'; ctx.fillRect(-7, -17, 14, 9);
    ctx.fillStyle = '#b3ada3'; ctx.fillRect(-2.5, -11, 5, 25);
    ctx.fillStyle = '#d24a3a'; ctx.fillRect(-2.5, -11, 5, 4);
    ctx.restore();
    ctx.strokeStyle = '#ff4a3d'; ctx.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(sx * 24, sy * 14); ctx.lineTo(sx * 24, sy * 24); ctx.lineTo(sx * 14, sy * 24); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-22, 28, 44, 4);
    ctx.fillStyle = '#ff4a3d'; ctx.fillRect(-22, 28, 44 * clamp(L.revealT / CFG.reveal, 0, 1), 4);
    for (let i = 0; i < L.max; i++) { ctx.fillStyle = i < L.hp ? '#ffb347' : 'rgba(255,255,255,0.15)'; ctx.fillRect(-22 + i * 3.7, 34, 2.6, 3); }
    ctx.font = '700 10px ' + FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText('MOBILE LAUNCHER', 0, 49); ctx.fillStyle = '#ff6b5a'; ctx.fillText('MOBILE LAUNCHER', 0, 49);
    if (S.pads.some(himarsReady) || (ui.sel === S.carrier && jetsReady())) {
      const pl = 0.5 + 0.5 * Math.sin(S.time * 8);
      ctx.strokeStyle = `rgba(255,220,120,${0.5 + 0.5 * pl})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 30 + pl * 3, 0, TAU); ctx.moveTo(-38, 0); ctx.lineTo(-26, 0); ctx.moveTo(38, 0); ctx.lineTo(26, 0); ctx.moveTo(0, -38); ctx.lineTo(0, -26); ctx.moveTo(0, 38); ctx.lineTo(0, 26); ctx.stroke();
      ctx.strokeText('CLICK TO STRIKE', 0, 61); ctx.fillStyle = '#ffd36b'; ctx.fillText('CLICK TO STRIKE', 0, 61);
    }
    ctx.restore();
  }
}
function drawThreatShadows() {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  for (const t of S.threats) {
    if (t.type === 'ballistic') continue;
    ctx.save(); ctx.translate(t.x + 2, t.y + 2); ctx.rotate(t.ang);
    if (t.type === 'cruise') ctx.fillRect(-10, -2, 20, 4); else { pathShape(ctx, droneShape, t.type === 'decoy' ? 0.8 : 1); ctx.fill(); }
    ctx.restore();
  }
  for (const m of S.missiles) { const a = 0.3 * Math.max(0, 1 - m.z / 300); if (a <= 0.01) continue; ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(m.x, m.y + m.z, 5, 2.5, 0, 0, TAU); ctx.fill(); }
  for (const r of S.rockets) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(r.gx, r.gy, 4, 2, 0, 0, TAU); ctx.fill(); }
  for (const j of S.jets) drawF35(ctx, j.x + 2, j.y + 2, j.ang, 1.05, 1, true);
  drawBombs(true);
}
function drawThreatBodies() {
  for (const t of S.threats) {
    if (t.type === 'ballistic') continue;
    ctx.save(); ctx.translate(t.sx, t.sy); ctx.rotate(t.ang);
    if (t.type === 'cruise') {
      ctx.fillStyle = '#a7adb1'; ctx.fillRect(-2, -6.5, 5, 13);
      ctx.fillRect(-10, -4, 3, 8);
      ctx.fillStyle = '#d6d9db'; rr(ctx, -11, -1.9, 20, 3.8, 1.9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9, -1.9); ctx.lineTo(13, 0); ctx.lineTo(9, 1.9); ctx.fill();
    } else {
      const s = t.type === 'decoy' ? 0.82 : 1;
      pathShape(ctx, droneShape, s);
      ctx.fillStyle = t.type === 'decoy' ? '#8e989e' : '#bcc3c8'; ctx.fill();
      ctx.strokeStyle = '#262c30'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.strokeStyle = '#3a4146'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-6 * s, 10 * s); ctx.lineTo(-9 * s, 10 * s); ctx.moveTo(-6 * s, -10 * s); ctx.lineTo(-9 * s, -10 * s); ctx.stroke();
      ctx.fillStyle = 'rgba(230,230,230,0.35)'; ctx.beginPath(); ctx.ellipse(-10 * s, 0, 1.3, 5.5 * s, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.lineCap = 'round';
  for (const m of S.missiles) {
    const c = Math.cos(m.dir), s = Math.sin(m.dir);
    ctx.strokeStyle = '#f2f4f5'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(m.x - c * 5, m.y - s * 5); ctx.lineTo(m.x + c * 5, m.y + s * 5); ctx.stroke();
  }
  for (const r of S.rockets) {
    const c = Math.cos(r.ang), s = Math.sin(r.ang);
    ctx.strokeStyle = '#dfe3e5'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.sx - c * 4, r.sy - s * 4); ctx.lineTo(r.sx + c * 4, r.sy + s * 4); ctx.stroke();
  }
}
function drawGlows() {
  ctx.globalCompositeOperation = 'lighter';
  const g = (spr, x, y, s, a) => { ctx.globalAlpha = a; ctx.drawImage(spr, x - s, y - s, s * 2, s * 2); };
  const city = S.buildings[1];
  if (city.hp > 0) g(SPR.light, city.x, city.y, 120, 0.09 * powerLevel() * (city.hp / city.max));
  const ref = S.buildings[2];
  if (ref.hp > 0) { const f = 0.8 + Math.random() * 0.4; g(SPR.fire, ref.x + 68, ref.y - 35, 8 * f, 0.9); g(SPR.yellow, ref.x + 68, ref.y - 34, 4 * f, 0.9); g(SPR.light, ref.x + 68, ref.y - 32, 30, 0.3); }
  for (const f of S.fires) {
    let int = f.int; if (f.life !== undefined) int *= clamp(f.life / 3, 0, 1);
    const fl = 0.75 + 0.25 * Math.sin(S.time * 13 + f.seed) + 0.1 * Math.sin(S.time * 31 + f.seed * 2);
    g(SPR.light, f.x, f.y, 38 * int, 0.35 * fl * Math.min(1.3, int));
  }
  for (const L of S.launchers) if (L.alive && L.revealed) g(SPR.red, L.x, L.y, 46, 0.22 * Math.min(1, L.fade, L.revealT));
  for (const t of S.threats) {
    if (t.type === 'ballistic') {
      const h = t.hist;
      ctx.lineCap = 'round';
      for (let i = 1; i < h.length; i++) {
        const a = i / h.length;
        ctx.globalAlpha = a * 0.6; ctx.strokeStyle = `rgb(255,${(60 + 90 * a) | 0},40)`; ctx.lineWidth = 1 + a * 4;
        ctx.beginPath(); ctx.moveTo(h[i - 1][0], h[i - 1][1]); ctx.lineTo(h[i][0], h[i][1]); ctx.stroke();
      }
      g(SPR.red, t.sx, t.sy, 18, 0.95); g(SPR.white, t.sx, t.sy, 5, 1);
    } else if (t.type === 'cruise') {
      const c = Math.cos(t.ang), s = Math.sin(t.ang);
      g(SPR.fire, t.sx - c * 12, t.sy - s * 12, 5 + Math.random() * 2, 0.9);
    } else if (Math.sin(S.time * 8 + t.wob * 3) > 0.6) g(SPR.red, t.sx + Math.cos(t.ang) * 8, t.sy + Math.sin(t.ang) * 8, 4, 0.9);
  }
  for (const m of S.missiles) {
    const c = Math.cos(m.dir), s = Math.sin(m.dir), tx = m.x - c * 6, ty = m.y - s * 6, f = 0.8 + Math.random() * 0.4;
    g(SPR.yellow, tx, ty, 7 * f, 1); g(SPR.light, tx, ty, 20, 0.4);
    if (m.phase === 'boost' || m.z < 80) g(SPR.light, m.x, m.y + m.z, 34, 0.5 * Math.max(0, 1 - m.z / 120));
  }
  for (const r of S.rockets) { const c = Math.cos(r.ang), s = Math.sin(r.ang); g(SPR.fire, r.sx - c * 5, r.sy - s * 5, 6 + Math.random() * 2, 1); }
  for (const j of S.jets) {
    const c = Math.cos(j.ang), s = Math.sin(j.ang), tx = j.sx - c * 15, ty = j.sy - s * 15, boost = j.phase === 'cat' || j.phase === 'climb';
    g(SPR.fire, tx, ty, (boost ? 7 : 4) + Math.random() * 2, 0.9);
    if (boost) { g(SPR.yellow, tx, ty, 4, 1); g(SPR.light, tx, ty, 30, 0.45); }
    if (Math.sin(S.time * 9 + j.t) > 0.7) { g(SPR.red, j.sx - s * 9.5, j.sy + c * 9.5, 3, 0.9); g(SPR.cyan, j.sx + s * 9.5, j.sy - c * 9.5, 3, 0.9); }
  }
  for (const B of S.bunkers) if (B.alive && B.revealed) g(SPR.fire, B.x, B.y, 40, 0.2 * Math.min(1, B.fade));
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawWarnings() {
  for (const t of S.threats) {
    if (t.type !== 'ballistic') continue;
    const rem = Math.max(0, (1 - t.T) * t.dur);
    const p = 0.5 + 0.5 * Math.sin(S.time * 12);
    ctx.strokeStyle = `rgba(255,50,40,${0.5 + 0.4 * p})`; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(t.tx, t.ty, 24 + p * 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(t.tx - 34, t.ty); ctx.lineTo(t.tx - 18, t.ty); ctx.moveTo(t.tx + 34, t.ty); ctx.lineTo(t.tx + 18, t.ty); ctx.stroke();
    ctx.font = '700 11px ' + MONO; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const txt = `IMPACT ${rem.toFixed(1)}s`;
    ctx.strokeText(txt, t.tx, t.ty - 34); ctx.fillStyle = '#ff5a4d'; ctx.fillText(txt, t.tx, t.ty - 34);
    if (t.engaged > 0) { ctx.strokeText('INTERCEPTOR AWAY', t.tx, t.ty + 44); ctx.fillStyle = '#8fdcff'; ctx.fillText('INTERCEPTOR AWAY', t.tx, t.ty + 44); }
  }
}
function drawWorldUI() {
  // building labels & health bars
  for (const b of S.buildings) {
    const y = b.y - b.h / 2 - 14, r = b.hp / b.max;
    ctx.textAlign = 'center'; ctx.font = '700 10px ' + FONT;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, b.x - 62, y - 16, 124, 22, 3); ctx.fill();
    ctx.fillStyle = b.hp > 0 ? '#cfe8f5' : '#ff6b5a';
    ctx.fillText(b.hp > 0 ? `${b.name}  +${money(b.income * r, true)}/5s` : `${b.name}  DESTROYED`, b.x, y - 5);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(b.x - 55, y, 110, 4);
    ctx.fillStyle = r > 0.6 ? '#4cd97b' : r > 0.3 ? '#ffc04d' : '#ff4d4d'; ctx.fillRect(b.x - 55, y, 110 * r, 4);
  }
  {
    const c = S.carrier, rd = jetsReady();
    ctx.textAlign = 'center'; ctx.font = '700 10px ' + FONT;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, c.x - 82, c.y - 47, 164, 15, 3); ctx.fill();
    ctx.fillStyle = rd ? '#8fdcff' : '#ffcf6b'; ctx.fillText(`CARRIER AIR WING \u00B7 F-35 ${rd}/${AIR.jets} READY`, c.x, c.y - 36);
  }
  // units: badges, hp, status
  for (const u of S.pads) {
    if (!u) continue;
    if (u.type === 'patriot') {
      const auto = u.mode === 'auto';
      ctx.fillStyle = auto ? '#d9822b' : '#2bbf7a'; rr(ctx, u.x - 30, u.y - 43, 60, 13, 3); ctx.fill();
      ctx.fillStyle = '#071018'; ctx.font = '800 9px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(auto ? 'AUTO: ALL' : 'HEAVY ONLY', u.x, u.y - 33.5);
    } else if (u.type === 'himars') {
      ctx.font = '700 9px ' + FONT; ctx.textAlign = 'center';
      ctx.fillStyle = u.reload > 0 || u.salvo ? '#ffcf6b' : '#7cffb2';
      ctx.fillText(u.salvo ? 'FIRING' : u.reload > 0 ? `RELOAD ${Math.ceil(u.reload)}s` : 'READY', u.x, u.y - 33);
    }
    if (u.hp < u.max) {
      const r = u.hp / u.max;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(u.x - 20, u.y + 29, 40, 4);
      ctx.fillStyle = r > 0.5 ? '#4cd97b' : '#ff4d4d'; ctx.fillRect(u.x - 20, u.y + 29, 40 * r, 4);
    }
  }
  // selection
  const s = ui.sel;
  if (s && !s.dead) {
    ctx.save(); ctx.strokeStyle = '#5ad2ff'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -S.time * 20;
    if (s === S.carrier) { rr(ctx, s.x - 96, s.y - 28, 192, 56, 6); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(s.x, s.y, 38, 0, TAU); ctx.stroke(); }
    if (s.type === 'ciws') { ctx.fillStyle = 'rgba(90,210,255,0.05)'; ctx.beginPath(); ctx.arc(s.x, s.y - 6, UNIT.ciws.range, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(90,210,255,0.35)'; ctx.stroke(); }
    if (s.type === 'patriot') { ctx.strokeStyle = 'rgba(90,210,255,0.22)'; ctx.beginPath(); ctx.arc(s.x, s.y, UNIT.patriot.range, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  // hover range for CIWS
  const hi = padAt(ui.mx, ui.my);
  if (hi >= 0 && S.pads[hi] && S.pads[hi].type === 'ciws' && S.pads[hi] !== s) {
    const u = S.pads[hi]; ctx.strokeStyle = 'rgba(90,210,255,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(u.x, u.y - 6, UNIT.ciws.range, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  // patriot manual-target hover
  if (s && s.type === 'patriot') {
    const t = threatAt(ui.mx, ui.my);
    if (t) { ctx.strokeStyle = '#8fdcff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(t.sx, t.sy, 14, 0, TAU); ctx.stroke(); }
  }
  // context hint
  let hint = null;
  if ((S.mode === 'prep' || S.mode === 'wave') && !S.demo) {
    if (s && s.type === 'patriot') hint = 'PATRIOT SELECTED: click any threat to fire one missile manually ($4M)';
    else if (s && s.type === 'himars') hint = 'HIMARS SELECTED: click a red-pinged launcher on the enemy coast';
    else if (s === S.carrier) hint = 'CARRIER SELECTED: click a red-pinged launcher (F-35 strike) or an orange base (bunker buster)';
    else if (S.launchers.some((L) => L.alive && L.revealed) && S.pads.some(himarsReady)) hint = 'ENEMY LAUNCHER REVEALED: click it to strike with HIMARS';
    else if (S.bunkers.some((b) => b.alive && b.known) && jetsReady()) hint = 'UNDERGROUND BASE LOCATED: click it to send an F-35 bunker buster ($20M)';
    else if (S.mode === 'prep' && S.wave === 0) hint = 'Click a concrete pad to deploy. Start with CIWS for drones and one Patriot for missiles.';
  }
  if (hint) {
    ctx.font = '700 13px ' + FONT; ctx.textAlign = 'center';
    const w = ctx.measureText(hint).width + 28;
    ctx.fillStyle = 'rgba(3,10,18,0.8)'; rr(ctx, W / 2 - w / 2, 524, w, 24, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(90,210,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#8fdcff'; ctx.fillText(hint, W / 2, 540);
  }
}
function drawPopups() {
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const p of S.popups) {
    const t = p.age / p.life;
    const a = t < 0.75 ? 1 : (1 - t) / 0.25;
    const sz = p.size * (p.age < 0.12 ? 1.35 - p.age * 2.9 : 1);
    ctx.globalAlpha = a; ctx.font = `800 ${sz.toFixed(1)}px ${FONT}`;
    const y = p.y - p.age * 22;
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(p.text, p.x, y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, y);
  }
  ctx.globalAlpha = 1;
}
function drawBanner() {
  const b = S.banner; if (!b) return;
  const t = b.age / b.life;
  const a = Math.min(1, b.age * 5, (1 - t) * 4);
  ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
  const y = (S.demo ? 300 : 226) + (b.age < 0.2 ? (0.2 - b.age) * 60 : 0);
  ctx.fillStyle = 'rgba(2,8,14,0.55)'; ctx.fillRect(0, y - 38, W, 66);
  ctx.fillStyle = b.color; ctx.globalAlpha = a * 0.6; ctx.fillRect(0, y - 38, W, 1); ctx.fillRect(0, y + 27, W, 1); ctx.globalAlpha = a;
  ctx.font = '800 34px ' + FONT; ctx.shadowColor = b.color; ctx.shadowBlur = 18; ctx.fillStyle = b.color;
  ctx.fillText(b.text, W / 2, y);
  ctx.shadowBlur = 0; ctx.font = '600 14px ' + FONT; ctx.fillStyle = '#cfe8f5';
  ctx.fillText(b.sub || '', W / 2, y + 20);
  ctx.restore();
}
function drawHUD() {
  ctx.fillStyle = 'rgba(3,9,16,0.94)'; ctx.fillRect(0, 0, W, HUD_H);
  const gl = ctx.createLinearGradient(0, 0, W, 0);
  gl.addColorStop(0, 'rgba(60,200,255,0)'); gl.addColorStop(0.5, 'rgba(60,200,255,0.7)'); gl.addColorStop(1, 'rgba(60,200,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, HUD_H - 1, W, 1);
  const lab = (x, y, t, al = 'left') => { ctx.textAlign = al; ctx.font = '700 10px ' + FONT; ctx.fillStyle = '#5f8fa8'; ctx.fillText(t, x, y); };
  const blink = Math.sin(S.time * 8) > 0;
  // treasury
  lab(16, 16, 'TREASURY');
  ctx.textAlign = 'left'; ctx.font = '700 22px ' + MONO;
  ctx.fillStyle = S.treasury < 0 ? (blink ? '#ff4d4d' : '#ff9a8f') : '#7cffb2';
  ctx.fillText(money(S.treasury), 16, 41);
  // income
  lab(152, 16, 'INCOME / 5s');
  ctx.font = '700 15px ' + MONO; ctx.fillStyle = '#bfe9ff'; ctx.fillText('+' + money(incomeRate()), 152, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(152, 41, 86, 3);
  ctx.fillStyle = '#7cffb2'; ctx.fillRect(152, 41, 86 * (S.incomeT / CFG.incomeEvery), 3);
  ctx.fillStyle = 'rgba(120,200,240,0.14)';
  for (const x of [252, 402, 884, 1010]) ctx.fillRect(x, 8, 1, HUD_H - 16);
  // wave
  let status = '';
  if (S.mode === 'prep') status = `NEXT IN ${Math.ceil(S.prepT)}s`;
  else if (S.mode === 'wave') status = `${S.threats.length + S.queue.length} THREATS`;
  else if (S.mode === 'over') status = S.result && S.result.win ? 'VICTORY' : 'DEFEAT';
  lab(266, 16, 'WAVE');
  ctx.font = '700 10px ' + FONT; ctx.fillStyle = S.mode === 'wave' ? '#ff8a7a' : '#8fdcff'; ctx.textAlign = 'right'; ctx.fillText(status, 390, 16);
  ctx.textAlign = 'left'; ctx.font = '700 22px ' + MONO; ctx.fillStyle = '#ffffff';
  ctx.fillText(`${Math.max(S.wave, 0)} / ${WAVES.length}`, 266, 41);
  // burn tracker
  const s = S.stats, ratio = s.enemy > 0 ? s.your / s.enemy : 0;
  lab(416, 16, 'ASYMMETRIC BURN TRACKER');
  ctx.textAlign = 'right'; ctx.font = '700 11px ' + MONO;
  ctx.fillStyle = ratio > 10 ? '#ff4d4d' : ratio > 3 ? '#ffb347' : '#7cffb2';
  ctx.fillText(ratio ? `RATIO ${ratio.toFixed(1)} : 1` : 'RATIO —', 870, 16);
  ctx.textAlign = 'left'; ctx.font = '700 14px ' + MONO;
  ctx.fillStyle = '#ff6b5a'; ctx.fillText(`YOUR COST: ${money(s.your)}`, 416, 34);
  ctx.fillStyle = '#ffc04d'; ctx.fillText(`ENEMY COST: ${money(s.enemy)}`, 650, 34);
  const tot = s.your + s.enemy;
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(416, 40, 454, 4);
  if (tot > 0) { const yw = 454 * s.your / tot; ctx.fillStyle = '#ff6b5a'; ctx.fillRect(416, 40, yw, 4); ctx.fillStyle = '#ffc04d'; ctx.fillRect(416 + yw, 40, 454 - yw, 4); }
  // launchers
  lab(896, 16, 'LAUNCHERS \u00B7 BASES');
  S.bunkers.forEach((B, i) => {
    const x = 980 + i * 12, y = 33;
    ctx.strokeStyle = B.alive ? '#ffb347' : '#4a5a66'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 4, y - 4, 8, 8);
    if (!B.alive) { ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.stroke(); }
    else if (B.known) { ctx.fillStyle = B.revealed && blink ? '#ffb347' : 'rgba(255,179,71,0.4)'; ctx.fillRect(x - 4, y - 4, 8, 8); }
  });
  S.launchers.forEach((L, i) => {
    const x = 902 + i * 15, y = 33;
    ctx.save(); ctx.translate(x, y);
    if (!L.alive) { ctx.strokeStyle = '#4a5a66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke(); }
    else {
      ctx.rotate(Math.PI / 4); ctx.strokeStyle = '#ff4a3d'; ctx.lineWidth = 1.5; ctx.strokeRect(-4, -4, 8, 8);
      if (L.revealed && blink) { ctx.fillStyle = '#ff4a3d'; ctx.fillRect(-4, -4, 8, 8); }
    }
    ctx.restore();
  });
  if (S.treasury < 0 && S.mode !== 'menu') {
    ctx.fillStyle = blink ? 'rgba(160,20,20,0.85)' : 'rgba(110,10,10,0.85)'; ctx.fillRect(W / 2 - 190, HUD_H + 4, 380, 20);
    ctx.fillStyle = '#fff'; ctx.font = '800 12px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText(`IN DEBT: BANKRUPT AT ${money(CFG.bankruptLimit)}`, W / 2, HUD_H + 18);
  }
}

function render() {
  const sx = (Math.random() * 2 - 1) * shake, sy = (Math.random() * 2 - 1) * shake;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  const z = cam.z, ox = W / 2 - cam.x * z + sx, oy = H / 2 - cam.y * z + sy;
  ctx.setTransform(PX * z, 0, 0, PX * z, ox * PX, oy * PX);
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawAmbient();
  drawCarrier();
  drawScorches();
  drawBunkers();
  drawLaunchers();
  drawPads();
  for (const b of S.buildings) drawBuilding(b);
  for (const u of S.pads) if (u) drawUnit(u);
  drawThreatShadows();
  drawThreatBodies();
  drawBombs(false);
  drawParticles(false);
  drawJets();
  drawGlows();
  drawParticles(true);
  drawWarnings();
  drawWorldUI();
  drawPopups();
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  ctx.drawImage(vignette, 0, 0, W, H);
  drawBanner();
  drawHUD();
  if (flashA > 0) { ctx.fillStyle = `rgba(255,240,220,${flashA})`; ctx.fillRect(0, 0, W, H); }
  drawDemoBars();
  if (D.fade > 0.003) { ctx.fillStyle = `rgba(0,0,0,${D.fade})`; ctx.fillRect(0, 0, W, H); }
}

// ============================== LOOP ==============================
function updAmbient(dt) {
  S.radarA += dt * 0.9;
  for (const d of S.dashes) { d.x += d.spd * dt; if (d.x > W + 30) d.x = -30; }
  for (const s of S.ships) {
    s.x += s.spd * s.dir * dt;
    if (s.dir > 0 && s.x > W + 90) s.x = -90; if (s.dir < 0 && s.x < -90) s.x = W + 90;
  }
  // power plant steam
  const pp = S.buildings[0];
  S.steamT += dt;
  while (S.steamT > 0.14) {
    S.steamT -= 0.14;
    if (pp.hp <= 0) continue;
    for (const t of pp.towers) if (pp.hp / pp.max >= t.th) P({ k: 'soft', spr: SPR.steam, x: pp.x + t.dx + rand(-4, 4), y: pp.y + t.dy - 3, vx: rand(-2, 2), vy: rand(-16, -10), wind: 7, drag: 0.3, life: rand(3, 4.5), s0: 7, s1: rand(24, 34), a0: 0.13, fadeIn: true });
  }
}
function update(dt) {
  updAmbient(dt);
  updateParticles(dt);
  updateFires(dt);
  for (const p of S.popups) p.age += dt;
  S.popups = S.popups.filter((p) => p.age < p.life);
  if (S.banner) { S.banner.age += dt; if (S.banner.age > S.banner.life) S.banner = null; }
  updTimers(dt);
  if (S.mode === 'menu') return;
  updLaunchers(dt);
  if (S.mode !== 'over') updateUnits(dt);
  updBunkers(dt);
  updThreats(dt); updMissiles(dt); updRockets(dt); updJets(dt); updBombs(dt);
  if (S.mode === 'prep') { S.prepT -= dt; if (S.prepT <= 0) startWave(S.wave + 1); }
  else if (S.mode === 'wave') { S.waveT += dt; spawnFromQueue(); if (!S.queue.length && !S.threats.length) waveCleared(); }
  if (S.mode === 'prep' || S.mode === 'wave') { updIncome(dt); checkLose(); }
  ui.tick += dt;
  if (ui.tick > 0.2) { ui.tick = 0; refreshPanel(); if (ui.sel && ui.sel.dead) closePanel(); }
  if (S.demo) demoTick(dt);
}

function updPresentation(dt) {
  updCam(dt);
  D.letter += ((D.on ? 1 : 0) - D.letter) * Math.min(1, dt * 3);
  D.fade += clamp(D.fadeT - D.fade, -dt / 1.2, dt / 1.2);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!S.paused) {
    let ts = 1;
    if (slowT > 0) { slowT -= dt; ts = 0.35; }
    const gdt = dt * ts;
    S.time += gdt;
    update(gdt);
    shake *= Math.exp(-dt * 9); if (shake < 0.05) shake = 0;
    flashA = Math.max(0, flashA - dt * 1.6);
  }
  updPresentation(dt);
  if (D.on) {
    const cs = D.cur;
    elCur.style.transform = `translate(${cs.x.toFixed(1)}px,${cs.y.toFixed(1)}px)`;
    elCur.classList.toggle('vis', cs.vis);
    const lbl = !SFX.ready ? 'CLICK FOR SOUND' : SFX.muted ? 'SOUND OFF' : 'SOUND ON';
    if (elDemoSound.textContent !== lbl) elDemoSound.textContent = lbl;
  } else if (S.mode === 'menu' && !elOverlay.classList.contains('hidden') && document.getElementById('btnStart') && performance.now() - ui.lastInput > 25000) startDemo();
  render();
  requestAnimationFrame(frame);
}

// ============================== BOOT ==============================
document.getElementById('demoPlay').addEventListener('click', () => { SFX.init(); stopDemo(true); });
document.getElementById('demoExit').addEventListener('click', () => stopDemo(false));
elDemoSound.addEventListener('click', () => { const was = SFX.ready; SFX.init(); if (!was) { if (SFX.muted) toggleMute(); } else toggleMute(); });
document.getElementById('demoFull').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); });
document.getElementById('demoBar').addEventListener('pointerdown', (e) => e.stopPropagation());
const START_HTML = elOverlay.innerHTML;
ui.lastInput = performance.now();
S = newState();
placeBunkers();
for (const L of S.launchers) placeLauncher(L);
ICONS = { ciws: unitIcon('ciws'), patriot: unitIcon('patriot'), himars: unitIcon('himars') };
resize();
requestAnimationFrame(frame);

// Small hook for automated testing / debugging in the console.
window.HORMUZ = {
  get state() { return S; }, startWave: (n) => startWave(n), money,
  step(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { S.time += 1 / 60; update(1 / 60); updPresentation(1 / 60); } render(); },
  startDemo, stopDemo, D, cam,
};
})();
