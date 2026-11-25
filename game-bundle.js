// Metro Dash 3D - bundled game (modules concatenated for static hosting)
import * as THREE from './three.module.min.js';

// ===== module: config =====
// Metro Dash 3D - shared tuning constants
const LANES = [-2.3, 0, 2.3];
const LANE_SWITCH_TIME = 0.16;
const GRAVITY = -34;
const JUMP_VELOCITY = 11.5;
const SLIDE_TIME = 0.75;
const PLAYER_HEIGHT = 1.7;
const PLAYER_SLIDE_HEIGHT = 0.8;
const PLAYER_HALF_W = 0.34;
const PLAYER_HALF_D = 0.32;

const START_SPEED = 11;
const MAX_SPEED = 34;
const SPEED_RAMP = 0.14;      // m/s gained per second
const BOOST_MULTIPLIER = 1.55;

const SEGMENT_LENGTH = 40;
const SEGMENT_COUNT = 7;      // recycled city blocks
const SPAWN_Z = -95;          // where obstacles appear
const DESPAWN_Z = 18;         // behind the camera

const DAY_LENGTH = 95;        // seconds for a full day/night cycle

const MAGNET_TIME = 8;
const BOOST_TIME = 6;
const SHIELD_TIME = 10;

const STORAGE_PREFIX = 'metrodash_';

// ===== module: storage =====
// Metro Dash 3D - persistence with an in-memory fallback.
// Sandboxed embeds (and some private browsers) throw on localStorage access;
// the game keeps working for the session when that happens.


const memoryStore = new Map();

function load(key, fallback) {
    if (memoryStore.has(key)) return memoryStore.get(key);
    try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
        if (raw != null) return JSON.parse(raw);
    } catch (err) {
        // storage unavailable - fall through to fallback
    }
    return fallback;
}

function save(key, value) {
    memoryStore.set(key, value);
    try {
        window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (err) {
        // storage unavailable - value kept in memory only
    }
}

function wipe() {
    memoryStore.clear();
    try {
        const doomed = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && k.indexOf(STORAGE_PREFIX) === 0) doomed.push(k);
        }
        doomed.forEach((k) => window.localStorage.removeItem(k));
    } catch (err) {
        // storage unavailable
    }
}

// ===== module: audio =====
// Metro Dash 3D - procedural WebAudio: every sound is synthesized, no audio files.
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.soundOn = true;
        this.musicOn = true;
        this._musicTimer = null;
        this._nextNoteTime = 0;
        this._step = 0;
    }

    // Must be called from a user gesture (Play button).
    unlock() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.9;
            this.master.connect(this.ctx.destination);
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.connect(this.master);
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.32;
            this.musicGain.connect(this.master);
            this._applyToggles();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    _applyToggles() {
        if (!this.ctx) return;
        this.sfxGain.gain.value = this.soundOn ? 1 : 0;
        this.musicGain.gain.value = this.musicOn ? 0.32 : 0;
    }

    setSound(on) { this.soundOn = on; this._applyToggles(); }
    setMusic(on) {
        this.musicOn = on; this._applyToggles();
        if (on) this.startMusic();
    }

    _tone(freq, dur, type, vol, when, slideTo) {
        if (!this.ctx || !this.soundOn) return;
        const t = when != null ? when : this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(this.sfxGain);
        osc.start(t); osc.stop(t + dur + 0.05);
    }

    _noise(dur, vol, filterFreq, when) {
        if (!this.ctx || !this.soundOn) return;
        const t = when != null ? when : this.ctx.currentTime;
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq || 1200;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol || 0.3, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
        src.start(t);
    }

    click() { this._tone(700, 0.07, 'triangle', 0.18); }
    coin() {
        if (!this.ctx || !this.soundOn) return;
        const t = this.ctx.currentTime;
        this._tone(1319, 0.09, 'sine', 0.22, t);
        this._tone(1760, 0.14, 'sine', 0.2, t + 0.07);
    }
    jump() { this._tone(280, 0.22, 'square', 0.12, null, 660); }
    slide() { this._noise(0.28, 0.16, 900); }
    lane() { this._tone(440, 0.06, 'triangle', 0.1, null, 560); }
    powerup() {
        if (!this.ctx || !this.soundOn) return;
        const t = this.ctx.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.14, 'triangle', 0.2, t + i * 0.06));
    }
    shieldBreak() {
        if (!this.ctx || !this.soundOn) return;
        const t = this.ctx.currentTime;
        this._tone(900, 0.25, 'sawtooth', 0.2, t, 220);
        this._noise(0.3, 0.25, 2000, t);
    }
    crash() {
        if (!this.ctx || !this.soundOn) return;
        const t = this.ctx.currentTime;
        this._noise(0.5, 0.5, 800, t);
        this._tone(160, 0.5, 'sawtooth', 0.3, t, 50);
    }
    countTick() { this._tone(660, 0.1, 'sine', 0.25); }
    countGo() { this._tone(990, 0.3, 'sine', 0.3); }
    gameOver() {
        if (!this.ctx || !this.soundOn) return;
        const t = this.ctx.currentTime;
        [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.32, 'triangle', 0.2, t + i * 0.22));
    }
    missionDone() {
        if (!this.ctx || !this.soundOn) return;
        const t = this.ctx.currentTime;
        [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, 0.16, 'sine', 0.2, t + i * 0.08));
    }

    // --- adaptive music: a two-bar bass + arp loop, intensity rises with speed ---
    startMusic() {
        if (!this.ctx || this._musicTimer || !this.musicOn) return;
        this._nextNoteTime = this.ctx.currentTime + 0.1;
        this._step = 0;
        this._musicTimer = setInterval(() => this._schedule(), 90);
    }

    stopMusic() {
        if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    }

    setIntensity(level) { this._intensity = Math.min(1, Math.max(0, level)); }

    _schedule() {
        if (!this.ctx || !this.musicOn) return;
        const bass = [110, 110, 131, 98];
        const arp = [220, 262, 330, 392, 330, 262];
        while (this._nextNoteTime < this.ctx.currentTime + 0.25) {
            const stepDur = 0.24 - (this._intensity || 0) * 0.05;
            const bar = Math.floor(this._step / 8) % 4;
            const t = this._nextNoteTime;
            if (this._step % 2 === 0) this._musicTone(bass[bar], stepDur * 1.8, 'triangle', 0.5, t);
            const arpNote = arp[this._step % arp.length] * (bar === 3 ? 0.891 : 1);
            if ((this._intensity || 0) > 0.15 || this._step % 2 === 0) {
                this._musicTone(arpNote * 2, stepDur * 0.9, 'square', 0.10 + (this._intensity || 0) * 0.06, t);
            }
            if (this._step % 4 === 2) this._musicHat(t);
            this._nextNoteTime += stepDur;
            this._step++;
        }
    }

    _musicTone(freq, dur, type, vol, t) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t); osc.stop(t + dur + 0.05);
    }

    _musicHat(t) {
        const len = Math.floor(this.ctx.sampleRate * 0.05);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        src.connect(f); f.connect(g); g.connect(this.musicGain);
        src.start(t);
    }

    destroy() {
        this.stopMusic();
        if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    }
}

// ===== module: player =====
// Metro Dash 3D - Dash, the original runner robot, with procedural animation.



function mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.55, metalness: 0.35 }, opts || {}));
}

function createPlayer() {
    const root = new THREE.Group();          // world position (lane x, jump y)
    const body = new THREE.Group();          // animated poses (run lean, slide tilt)
    root.add(body);

    const teal = mat(0x18b7a6);
    const darkTeal = mat(0x0e7c72);
    const graphite = mat(0x2a3140, { roughness: 0.4, metalness: 0.7 });
    const visorMat = mat(0x0a1420, { emissive: 0x53f2ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.4 });
    const accent = mat(0xff5a5a, { emissive: 0xff5a5a, emissiveIntensity: 0.35 });

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.4), teal);
    torso.position.y = 1.02; torso.castShadow = true;
    body.add(torso);
    const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.02), accent);
    chestStripe.position.set(0, 1.1, 0.21);
    body.add(chestStripe);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.42), graphite);
    belt.position.y = 0.72;
    body.add(belt);

    // head with glowing visor
    const headG = new THREE.Group();
    headG.position.y = 1.52;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.42), teal);
    head.castShadow = true;
    headG.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.03), visorMat);
    visor.position.set(0, 0.02, 0.215);
    headG.add(visor);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), graphite);
    antenna.position.set(0.14, 0.3, 0);
    headG.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), accent);
    antennaTip.position.set(0.14, 0.42, 0);
    headG.add(antennaTip);
    body.add(headG);

    // limbs with pivot groups
    function limb(x, y, upperLen, lowerLen, upperMat, lowerMat, endSize, endMat) {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, upperLen, 0.18), upperMat);
        upper.position.y = -upperLen / 2; upper.castShadow = true;
        pivot.add(upper);
        const lowerG = new THREE.Group();
        lowerG.position.y = -upperLen;
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.14, lowerLen, 0.15), lowerMat);
        lower.position.y = -lowerLen / 2; lower.castShadow = true;
        lowerG.add(lower);
        const end = new THREE.Mesh(new THREE.BoxGeometry(endSize[0], endSize[1], endSize[2]), endMat);
        end.position.set(0, -lowerLen - endSize[1] / 2 + 0.02, endSize[2] * 0.12);
        end.castShadow = true;
        lowerG.add(end);
        pivot.add(lowerG);
        body.add(pivot);
        return { pivot: pivot, lower: lowerG };
    }

    const armL = limb(-0.4, 1.26, 0.3, 0.26, teal, graphite, [0.13, 0.13, 0.13], accent);
    const armR = limb(0.4, 1.26, 0.3, 0.26, teal, graphite, [0.13, 0.13, 0.13], accent);
    const legL = limb(-0.17, 0.68, 0.32, 0.3, darkTeal, graphite, [0.16, 0.1, 0.26], mat(0xffc93d, { emissive: 0xffc93d, emissiveIntensity: 0.3 }));
    const legR = limb(0.17, 0.68, 0.32, 0.3, darkTeal, graphite, [0.16, 0.1, 0.26], mat(0xffc93d, { emissive: 0xffc93d, emissiveIntensity: 0.3 }));

    // shield bubble (toggled by the game)
    const shield = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0x59ffa0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    shield.position.y = 1.0;
    shield.visible = false;
    root.add(shield);

    const state = {
        lane: 1,
        targetLane: 1,
        laneT: 1,
        fromX: 0,
        y: 0,
        vy: 0,
        grounded: true,
        sliding: false,
        slideT: 0,
        runPhase: 0,
        dead: false,
        deadT: 0,
    };

    const api = {
        group: root,
        shieldMesh: shield,
        state: state,

        reset() {
            state.lane = 1; state.targetLane = 1; state.laneT = 1; state.fromX = 0;
            state.y = 0; state.vy = 0; state.grounded = true;
            state.sliding = false; state.slideT = 0; state.runPhase = 0;
            state.dead = false; state.deadT = 0;
            root.position.set(0, 0, 0);
            root.rotation.set(0, 0, 0);
            body.rotation.set(0, 0, 0);
            body.position.y = 0;
            body.scale.set(1, 1, 1);
            shield.visible = false;
        },

        move(dir) { // -1 left, +1 right
            if (state.dead) return false;
            const next = state.targetLane + dir;
            if (next < 0 || next > 2) return false;
            state.fromX = root.position.x;
            state.targetLane = next;
            state.laneT = 0;
            return true;
        },

        jump() {
            if (state.dead || !state.grounded) return false;
            state.vy = 11.5;
            state.grounded = false;
            state.sliding = false;
            return true;
        },

        slide() {
            if (state.dead) return false;
            if (!state.grounded) { state.vy = Math.min(state.vy, -18); } // fast-fall into the slide
            state.sliding = true;
            state.slideT = 0;
            return true;
        },

        update(dt, speed) {
            // lane change easing
            if (state.laneT < 1) {
                state.laneT = Math.min(1, state.laneT + dt / LANE_SWITCH_TIME);
                const e = 1 - Math.pow(1 - state.laneT, 3);
                root.position.x = state.fromX + (LANES[state.targetLane] - state.fromX) * e;
                body.rotation.z = (LANES[state.targetLane] - state.fromX) * -0.1 * Math.sin(state.laneT * Math.PI);
            } else {
                root.position.x = LANES[state.targetLane];
                body.rotation.z *= 0.8;
            }

            // vertical physics
            if (!state.grounded) {
                state.vy += -34 * dt;
                state.y += state.vy * dt;
                if (state.y <= 0) { state.y = 0; state.vy = 0; state.grounded = true; }
            }
            root.position.y = state.y;

            if (state.dead) {
                state.deadT += dt;
                body.rotation.x = Math.min(Math.PI / 2, state.deadT * 6);
                body.position.y = Math.max(-0.4, body.position.y - dt * 1.2);
                return;
            }

            // slide timing
            if (state.sliding) {
                state.slideT += dt;
                if (state.slideT > 0.75 && state.grounded) state.sliding = false;
            }

            // pose
            if (state.sliding && state.grounded) {
                body.rotation.x = -1.05;
                body.position.y = 0.16;
                state.runPhase += speed * dt * 0.4;
            } else if (!state.grounded) {
                body.rotation.x = 0.28;
                body.position.y = 0;
                legL.pivot.rotation.x = -1.1; legL.lower.rotation.x = 1.6;
                legR.pivot.rotation.x = 0.4; legR.lower.rotation.x = 0.9;
                armL.pivot.rotation.x = -2.4; armR.pivot.rotation.x = -2.4;
                armL.lower.rotation.x = -0.4; armR.lower.rotation.x = -0.4;
                return;
            } else {
                body.rotation.x = 0.12;
                body.position.y = Math.abs(Math.sin(state.runPhase)) * 0.05;
                state.runPhase += speed * dt * 0.9;
            }

            const s = Math.sin(state.runPhase);
            const c = Math.cos(state.runPhase);
            if (state.sliding) {
                legL.pivot.rotation.x = -0.5; legL.lower.rotation.x = 1.3;
                legR.pivot.rotation.x = -0.7; legR.lower.rotation.x = 1.5;
                armL.pivot.rotation.x = 0.8; armR.pivot.rotation.x = 0.9;
                armL.lower.rotation.x = -0.6; armR.lower.rotation.x = -0.6;
            } else {
                legL.pivot.rotation.x = s * 1.0; legL.lower.rotation.x = Math.max(0, -c) * 1.3;
                legR.pivot.rotation.x = -s * 1.0; legR.lower.rotation.x = Math.max(0, c) * 1.3;
                armL.pivot.rotation.x = -s * 0.9; armL.lower.rotation.x = -0.5;
                armR.pivot.rotation.x = s * 0.9; armR.lower.rotation.x = -0.5;
            }
        },

        die() { state.dead = true; state.deadT = 0; },

        hitboxHeight() { return state.sliding ? 0.8 : PLAYER_HEIGHT; },
    };

    return api;
}

// ===== module: world =====
// Metro Dash 3D - the city: recycled segments of track, buildings, tunnels and lights,
// plus a full day/night cycle driving the sky, fog and sun.



const BUILDING_COLORS = [0x3b4a6b, 0x53486b, 0x2f4a55, 0x5c4a5a, 0x445064, 0x3d5a50, 0x4b3f5e];
const TRAIN_LINE_COLORS = [0xff5a5a, 0x3fd0ff, 0xffc93d, 0x8dffa9, 0xc77dff];

function canvasTexture(draw, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// glowing window grid for building facades
function windowTexture() {
    return canvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#101623';
        ctx.fillRect(0, 0, w, h);
        for (let y = 6; y < h - 6; y += 14) {
            for (let x = 5; x < w - 6; x += 12) {
                const lit = Math.random() < 0.42;
                ctx.fillStyle = lit ? (Math.random() < 0.8 ? '#ffd98a' : '#9adfff') : '#1a2334';
                ctx.fillRect(x, y, 7, 8);
            }
        }
    }, 128, 256);
}

function hazardTexture() {
    return canvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#e8b400';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#16181d';
        for (let x = -h; x < w + h; x += 24) {
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x + 12, 0); ctx.lineTo(x + 12 + h, h); ctx.lineTo(x + h, h);
            ctx.fill();
        }
    }, 128, 32);
}

function createWorld(scene, quality) {
    const world = {
        time: DAY_LENGTH * 0.28, // start mid-morning
        nightFactor: 0,
        segments: [],
        lamps: [],
        buildingMats: [],
    };

    // ---------- sky, fog, stars ----------
    scene.background = new THREE.Color(0x87b7e8);
    scene.fog = new THREE.Fog(0x87b7e8, 26, 105);

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * Math.PI * 0.45 + 0.08;
        const r = 260;
        starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
        starPos[i * 3 + 1] = Math.sin(e) * r;
        starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    stars.position.z = -120;
    scene.add(stars);

    // moon
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(9, 18, 14),
        new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false })
    );
    moon.position.set(-70, 95, -200);
    scene.add(moon);

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x514a3c, 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(14, 30, -18);
    sun.castShadow = quality !== 'low';
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -62;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 170;
    sun.shadow.bias = -0.002;
    scene.add(sun);
    scene.add(sun.target);

    // ---------- shared materials / textures ----------
    const winTex = windowTexture();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.95 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x484f5c, roughness: 0.9 });
    const bedMat = new THREE.MeshStandardMaterial({ color: 0x3a2d20, roughness: 1 });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x453522, roughness: 1 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.25, metalness: 0.9 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343e, roughness: 0.6, metalness: 0.5 });
    const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x3d4350, roughness: 0.85 });
    const hazTex = hazardTexture();
    const tunnelStripeMat = new THREE.MeshBasicMaterial({ map: hazTex });

    // static under-layer so no sliver of empty scene ever shows near the camera
    const baseGround = new THREE.Mesh(new THREE.PlaneGeometry(140, 800), groundMat);
    baseGround.rotation.x = -Math.PI / 2;
    baseGround.position.set(0, -0.02, -300);
    baseGround.receiveShadow = true;
    scene.add(baseGround);

    const groundGeo = new THREE.PlaneGeometry(26, SEGMENT_LENGTH);
    const bedGeo = new THREE.BoxGeometry(1.9, 0.12, SEGMENT_LENGTH);
    const tieGeo = new THREE.BoxGeometry(1.5, 0.07, 0.24);
    const railGeo = new THREE.BoxGeometry(0.09, 0.12, SEGMENT_LENGTH);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.4, 6);
    const lampHeadGeo = new THREE.SphereGeometry(0.16, 8, 8);

    // ---------- one recycled city block ----------
    function buildSegment(index) {
        const g = new THREE.Group();

        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        g.add(ground);

        for (const sx of [-8.4, 8.4]) {
            const walk = new THREE.Mesh(boxGeo, sidewalkMat);
            walk.scale.set(5, 0.24, SEGMENT_LENGTH);
            walk.position.set(sx, 0.12, 0);
            walk.receiveShadow = true;
            g.add(walk);
        }

        // three track beds with ties and rails
        for (const laneX of LANES) {
            const bed = new THREE.Mesh(bedGeo, bedMat);
            bed.position.set(laneX, 0.06, 0);
            bed.receiveShadow = true;
            g.add(bed);
            for (let t = 0; t < 26; t++) {
                const tie = new THREE.Mesh(tieGeo, tieMat);
                tie.position.set(laneX, 0.14, -SEGMENT_LENGTH / 2 + 0.8 + t * 1.5);
                g.add(tie);
            }
            for (const rx of [-0.62, 0.62]) {
                const rail = new THREE.Mesh(railGeo, railMat);
                rail.position.set(laneX + rx, 0.2, 0);
                g.add(rail);
            }
        }

        // buildings (heights/colors re-rolled on recycle)
        const buildings = [];
        for (let i = 0; i < 8; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const bMat = new THREE.MeshStandardMaterial({
                color: BUILDING_COLORS[(Math.random() * BUILDING_COLORS.length) | 0],
                roughness: 0.85,
                emissive: 0xffd98a,
                emissiveMap: winTex,
                emissiveIntensity: 0,
            });
            world.buildingMats.push(bMat);
            const b = new THREE.Mesh(boxGeo, bMat);
            b.castShadow = true;
            buildings.push({ mesh: b, side: side, slot: Math.floor(i / 2) });
            g.add(b);
        }

        // street lights
        const lampsHere = [];
        for (const lx of [-5.6, 5.6]) {
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.set(lx, 2.2, -SEGMENT_LENGTH / 4);
            pole.castShadow = true;
            g.add(pole);
            const lampMat = new THREE.MeshStandardMaterial({ color: 0x30343e, emissive: 0xffd98a, emissiveIntensity: 0 });
            const head = new THREE.Mesh(lampHeadGeo, lampMat);
            head.position.set(lx * 0.92, 4.4, -SEGMENT_LENGTH / 4);
            g.add(head);
            lampsHere.push(lampMat);
            world.lamps.push(lampMat);
        }

        // occasional tunnel frame over all lanes
        let tunnel = null;
        if (index % 4 === 3) {
            tunnel = new THREE.Group();
            const top = new THREE.Mesh(boxGeo, tunnelMat);
            top.scale.set(13, 1.1, 10);
            top.position.y = 5.6;
            top.castShadow = true;
            tunnel.add(top);
            for (const wx of [-6.6, 6.6]) {
                const wall = new THREE.Mesh(boxGeo, tunnelMat);
                wall.scale.set(1.1, 5.2, 10);
                wall.position.set(wx, 2.6, 0);
                wall.castShadow = true;
                tunnel.add(wall);
            }
            for (const zx of [-5.02, 5.02]) {
                const stripe = new THREE.Mesh(new THREE.PlaneGeometry(13, 0.5), tunnelStripeMat);
                stripe.position.set(0, 4.7, zx);
                if (zx < 0) stripe.rotation.y = Math.PI;
                tunnel.add(stripe);
            }
            g.add(tunnel);
        }

        g.position.z = -index * SEGMENT_LENGTH;
        scene.add(g);
        return { group: g, buildings: buildings, tunnel: tunnel };
    }

    for (let i = 0; i < SEGMENT_COUNT; i++) world.segments.push(buildSegment(i));

    function reroll(segment) {
        for (const b of segment.buildings) {
            const w = 3 + Math.random() * 3.2;
            const h = 5 + Math.random() * 13;
            const d = 6 + Math.random() * 4;
            b.mesh.scale.set(w, h, d);
            b.mesh.position.set(b.side * (8.2 + Math.random() * 2.4), h / 2, -SEGMENT_LENGTH / 2 + 4 + b.slot * 10 + Math.random() * 2);
            b.mesh.material.color.setHex(BUILDING_COLORS[(Math.random() * BUILDING_COLORS.length) | 0]);
        }
        if (segment.tunnel) segment.tunnel.visible = Math.random() < 0.4;
    }
    world.segments.forEach(reroll);

    // ---------- day/night palettes ----------
    const skyDay = new THREE.Color(0x87b7e8);
    const skySunset = new THREE.Color(0xe8875a);
    const skyNight = new THREE.Color(0x0a0f26);
    const fogDay = new THREE.Color(0x9cc3ea);
    const fogNight = new THREE.Color(0x0c1230);
    const sunDay = new THREE.Color(0xfff2d8);
    const sunSet = new THREE.Color(0xff9a5a);
    const tmpA = new THREE.Color();
    const tmpB = new THREE.Color();

    function daylight(t) { // 0 night .. 1 noon, smooth over the cycle
        return THREE.MathUtils.clamp(Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 0, 1);
    }

    world.update = function (dt, playerZ, speed) {
        world.time = (world.time + dt) % DAY_LENGTH;
        const t = world.time / DAY_LENGTH;
        const day = daylight(t);
        world.nightFactor = 1 - day;

        // sky + fog
        if (day > 0.55) tmpA.lerpColors(skySunset, skyDay, (day - 0.55) / 0.45);
        else tmpA.lerpColors(skyNight, skySunset, day / 0.55);
        scene.background.copy(tmpA);
        tmpB.lerpColors(fogNight, fogDay, day);
        scene.fog.color.copy(tmpB);
        scene.fog.near = 24 - world.nightFactor * 6;
        scene.fog.far = 100 - world.nightFactor * 22;

        // sun stays on the camera side so the faces the player sees are lit;
        // warm and low at dawn/dusk, high and white at noon, moonlight-blue at night
        const sunHeight = 16 + day * 18;
        sun.position.set(8, sunHeight, playerZ + 14);
        sun.target.position.set(0, 1, playerZ - 28);
        if (day > 0.12) {
            sun.color.lerpColors(sunSet, sunDay, THREE.MathUtils.clamp((day - 0.12) / 0.5, 0, 1));
            sun.intensity = 0.4 + day * 1.3;
        } else {
            sun.color.setHex(0x8aa6ff);
            sun.intensity = 0.32;
        }
        hemi.intensity = 0.5 + day * 0.8;
        starMat.opacity = Math.max(0, 0.9 - day * 1.6);
        moon.visible = day < 0.4;

        // city lights wake up at dusk
        const glow = THREE.MathUtils.clamp(1 - day * 1.7, 0, 1);
        for (const m of world.buildingMats) m.emissiveIntensity = glow * 0.9;
        for (const m of world.lamps) m.emissiveIntensity = glow * 2.2;

        // recycle segments that fell behind the camera
        for (const s of world.segments) {
            if (s.group.position.z > SEGMENT_LENGTH * 1.5) {
                s.group.position.z -= SEGMENT_COUNT * SEGMENT_LENGTH;
                reroll(s);
            }
        }
    };

    // the whole city slides past the runner
    world.advance = function (dist) {
        for (const s of world.segments) s.group.position.z += dist;
    };

    world.setQuality = function (q) {
        sun.castShadow = q !== 'low';
    };

    world.dispose = function () {
        scene.remove(baseGround);
        scene.remove(stars); scene.remove(moon);
        starGeo.dispose(); starMat.dispose();
        for (const s of world.segments) scene.remove(s.group);
    };

    return world;
}

{ windowTexture, hazardTexture, TRAIN_LINE_COLORS, canvasTexture };

// ===== module: obstacles =====
// Metro Dash 3D - obstacle pool: trains (parked and moving), jump barriers,
// slide-under signal bars and tall signal boxes. Spawn patterns guarantee a way through.




function box(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
}

function trainMesh(length, colorHex, hazTex) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.6, metalness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1a26, roughness: 0.1, metalness: 0.6, emissive: 0x35566e, emissiveIntensity: 0.5 });

    g.add(box(2.0, 1.9, length, bodyMat, 0, 1.65, 0));            // body
    g.add(box(2.04, 0.34, length, darkMat, 0, 0.62, 0));          // undercarriage
    g.add(box(1.86, 0.22, length * 0.96, darkMat, 0, 2.72, 0));   // roof
    g.add(box(2.02, 0.52, length * 0.94, glassMat, 0, 2.05, 0));  // window band
    // nose + headlight face the runner (+z)
    const nose = box(1.9, 1.5, 0.5, bodyMat, 0, 1.45, length / 2 + 0.2);
    g.add(nose);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xfff6c9, emissiveIntensity: 2.4 });
    for (const lx of [-0.6, 0.6]) {
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), lightMat);
        head.rotation.x = Math.PI / 2;
        head.position.set(lx, 1.15, length / 2 + 0.46);
        g.add(head);
    }
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), new THREE.MeshBasicMaterial({ map: hazTex }));
    stripe.position.set(0, 0.95, length / 2 + 0.47);
    g.add(stripe);
    return g;
}

function barrierMesh(hazMat, postMat) {
    // low barrier: jump it
    const g = new THREE.Group();
    g.add(box(2.0, 0.34, 0.18, hazMat, 0, 0.82, 0));
    g.add(box(0.14, 1.0, 0.14, postMat, -0.9, 0.5, 0));
    g.add(box(0.14, 1.0, 0.14, postMat, 0.9, 0.5, 0));
    return g;
}

function overhangMesh(hazMat, postMat) {
    // high bar with side posts: slide under it
    const g = new THREE.Group();
    g.add(box(0.16, 2.7, 0.16, postMat, -1.0, 1.35, 0));
    g.add(box(0.16, 2.7, 0.16, postMat, 1.0, 1.35, 0));
    g.add(box(2.2, 0.5, 0.3, hazMat, 0, 1.6, 0));
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xff2222, emissiveIntensity: 2.0 });
    for (const lx of [-0.7, 0.7]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), lampMat);
        lamp.position.set(lx, 1.95, 0);
        g.add(lamp);
    }
    return g;
}

function signalBoxMesh(boxMat, lightMat) {
    // tall cabinet: cannot jump or slide, change lane
    const g = new THREE.Group();
    g.add(box(1.3, 2.4, 0.9, boxMat, 0, 1.2, 0));
    g.add(box(1.0, 0.5, 0.1, lightMat, 0, 2.0, 0.46));
    g.add(box(1.4, 0.14, 1.0, new THREE.MeshStandardMaterial({ color: 0x14171d }), 0, 0.07, 0));
    return g;
}

function createObstacles(scene) {
    const hazTex = hazardTexture();
    const hazMat = new THREE.MeshStandardMaterial({ map: hazTex, roughness: 0.7 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.6 });
    const signalMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 });
    const signalLightMat = new THREE.MeshStandardMaterial({ color: 0xffc93d, emissive: 0xffae00, emissiveIntensity: 1.6 });

    const pool = [];
    const active = [];

    function make(type) {
        let mesh;
        if (type === 'train') {
            const len = 9 + Math.random() * 12;
            mesh = trainMesh(len, TRAIN_LINE_COLORS[(Math.random() * TRAIN_LINE_COLORS.length) | 0], hazTex);
            return { type: type, mesh: mesh, len: len };
        }
        if (type === 'barrier') { mesh = barrierMesh(hazMat, postMat); return { type: type, mesh: mesh, len: 0.4 }; }
        if (type === 'overhang') { mesh = overhangMesh(hazMat, postMat); return { type: type, mesh: mesh, len: 0.5 }; }
        mesh = signalBoxMesh(signalMat, signalLightMat);
        return { type: 'signal', mesh: mesh, len: 1.0 };
    }

    function obtain(type) {
        for (const o of pool) {
            if (!o.busy && o.type === type) {
                if (type === 'train') { o.mesh.visible = true; }
                return o;
            }
        }
        const o = make(type);
        o.busy = false;
        pool.push(o);
        scene.add(o.mesh);
        return o;
    }

    function place(type, lane, z, extraSpeed) {
        const o = obtain(type);
        o.busy = true;
        o.lane = lane;
        o.z = z;
        o.extraSpeed = extraSpeed || 0;
        o.hit = false;
        o.mesh.visible = true;
        o.mesh.position.set(LANES[lane], 0, z - o.len / 2);
        // half-extents for AABB vs the runner
        if (type === 'train') o.box = { hx: 1.02, y0: 0.3, y1: 2.85, hz: o.len / 2 };
        else if (type === 'barrier') o.box = { hx: 1.0, y0: 0.62, y1: 1.0, hz: 0.12 };
        else if (type === 'overhang') o.box = { hx: 1.1, y0: 1.32, y1: 1.9, hz: 0.18 };
        else o.box = { hx: 0.68, y0: 0, y1: 2.45, hz: 0.48 };
        active.push(o);
        return o;
    }

    // one cluster of obstacles, always leaving a survivable path
    function spawnCluster(speed, difficulty) {
        const dz = Math.max(24, speed * 1.05);
        const lanes = [0, 1, 2];
        const freeLane = lanes[(Math.random() * 3) | 0];
        const blocked = lanes.filter((l) => l !== freeLane && Math.random() < 0.45 + difficulty * 0.4);
        if (blocked.length === 0) blocked.push(lanes[(Math.random() * 3) | 0] === freeLane ? (freeLane + 1) % 3 : lanes[(Math.random() * 3) | 0]);

        const movingChance = Math.min(0.34, 0.08 + difficulty * 0.3);
        for (const lane of blocked) {
            if (lane === freeLane) continue;
            const roll = Math.random();
            if (roll < 0.34) place('train', lane, SPAWN_Z, Math.random() < movingChance ? 5 + Math.random() * 8 : 0);
            else if (roll < 0.62) place('barrier', lane, SPAWN_Z, 0);
            else if (roll < 0.84) place('overhang', lane, SPAWN_Z, 0);
            else place('signal', lane, SPAWN_Z, 0);
        }
        // at higher difficulty, drop a second staggered cluster, still escapable
        if (difficulty > 0.35 && Math.random() < 0.5) {
            const secondFree = [0, 1, 2][(Math.random() * 3) | 0];
            for (const lane of lanes) {
                if (lane === secondFree || Math.random() < 0.5) continue;
                place(Math.random() < 0.5 ? 'barrier' : 'overhang', lane, SPAWN_Z - dz * 0.55, 0);
            }
        }
        return dz;
    }

    let sinceSpawn = 0;

    const api = {
        active: active,

        reset() {
            for (const o of active) { o.busy = false; o.mesh.visible = false; }
            active.length = 0;
            sinceSpawn = -30; // small grace gap at run start
        },

        update(dt, speed, difficulty) {
            sinceSpawn += speed * dt;
            const wantGap = Math.max(30, 54 - difficulty * 22);
            if (sinceSpawn >= wantGap) {
                sinceSpawn = 0;
                spawnCluster(speed, difficulty);
            }
            for (let i = active.length - 1; i >= 0; i--) {
                const o = active[i];
                o.z += (speed + o.extraSpeed) * dt;
                o.mesh.position.z = o.z - o.len / 2;
                if (o.z - o.len > DESPAWN_Z) {
                    o.busy = false;
                    o.mesh.visible = false;
                    active.splice(i, 1);
                }
            }
        },

        // player AABB vs every active obstacle; returns the obstacle hit, or null
        collide(px, py, halfW, height) {
            for (const o of active) {
                if (o.hit) continue;
                const b = o.box;
                const zFront = o.z;                    // face nearest the runner
                const zBack = o.z - o.len;
                if (Math.abs(px - LANES[o.lane]) > b.hx + halfW) continue;
                if (zFront < -0.5 || zBack > 0.5) continue;
                if (py > b.y1 || py + height < b.y0) continue;
                return o;
            }
            return null;
        },

        smash(o) { // shield absorbed the hit
            o.hit = true;
            o.busy = false;
            o.mesh.visible = false;
            const idx = active.indexOf(o);
            if (idx >= 0) active.splice(idx, 1);
        },

        nearestAhead() { // for testing/debug
            let best = null;
            for (const o of active) if (!best || o.z < best.z) best = o;
            return best;
        },
    };

    return api;
}

// ===== module: collectibles =====
// Metro Dash 3D - coins and power-ups (magnet, boost, shield), pooled and recycled.



const COIN_POOL = 48;
const POWER_POOL = 6;

function createCollectibles(scene) {
    // ---- coins ----
    const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 20);
    const coinMat = new THREE.MeshStandardMaterial({
        color: 0xffc93d, metalness: 0.85, roughness: 0.25,
        emissive: 0xa06a00, emissiveIntensity: 0.5,
    });
    const coins = [];
    for (let i = 0; i < COIN_POOL; i++) {
        const m = new THREE.Mesh(coinGeo, coinMat);
        m.rotation.x = Math.PI / 2;
        m.visible = false;
        m.castShadow = false;
        scene.add(m);
        coins.push({ mesh: m, busy: false, x: 0, y: 0, z: 0, spin: Math.random() * Math.PI * 2, pull: 0 });
    }

    // ---- power-ups: floating emissive icons on a glowing ring ----
    const powerDefs = {
        magnet: { color: 0x3fd0ff, shape: 'torus' },
        boost: { color: 0xff9a3d, shape: 'bolt' },
        shield: { color: 0x59ffa0, shape: 'shield' },
    };
    const powers = [];
    for (let i = 0; i < POWER_POOL; i++) {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.52, 0.05, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
        );
        g.add(ring);
        const core = new THREE.Group();
        g.add(core);
        const light = new THREE.PointLight(0xffffff, 0, 7);
        light.position.y = 0.2;
        g.add(light);
        g.visible = false;
        scene.add(g);
        powers.push({ group: g, core: core, ring: ring, light: light, busy: false, kind: null, x: 0, y: 0, z: 0, bob: Math.random() * Math.PI * 2 });
    }

    function buildIcon(kind) {
        const def = powerDefs[kind];
        const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.4, roughness: 0.3 });
        const g = new THREE.Group();
        if (kind === 'magnet') {
            const t = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.11, 8, 18, Math.PI), mat);
            t.rotation.z = Math.PI; // U shape
            g.add(t);
            for (const px of [-0.24, 0.24]) {
                const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), new THREE.MeshStandardMaterial({ color: 0xdfe8ff, metalness: 0.8, roughness: 0.3 }));
                tip.position.set(px, -0.1, 0);
                g.add(tip);
            }
        } else if (kind === 'boost') {
            const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), mat);
            bolt.rotation.z = Math.PI;
            bolt.position.y = 0.12;
            const bolt2 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), mat);
            bolt2.position.y = -0.12;
            bolt2.rotation.y = Math.PI / 4;
            g.add(bolt); g.add(bolt2);
        } else {
            const s = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 5), mat);
            s.rotation.x = Math.PI / 2;
            s.scale.set(1, 1.2, 1);
            g.add(s);
        }
        return g;
    }

    function freeCoin() {
        for (const c of coins) if (!c.busy) return c;
        return null;
    }

    const api = {
        magnetLeft: 0,

        reset() {
            for (const c of coins) { c.busy = false; c.mesh.visible = false; c.pull = 0; }
            for (const p of powers) { p.busy = false; p.group.visible = false; }
            api.magnetLeft = 0;
        },

        // a friendly line of coins, optionally arcing over a jump
        spawnCoinLine(lane, zStart, count, arc) {
            for (let i = 0; i < count; i++) {
                const c = freeCoin();
                if (!c) return;
                c.busy = true;
                c.x = LANES[lane];
                c.z = zStart - i * 1.6;
                c.y = arc ? 0.9 + Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 1.5 : 0.9;
                c.pull = 0;
                c.mesh.visible = true;
                c.mesh.position.set(c.x, c.y, c.z);
            }
        },

        spawnCoinArcOverBarrier(lane, zCenter) {
            api.spawnCoinLine(lane, zCenter + 4, 6, true);
        },

        spawnPowerUp(kind, lane, z) {
            for (const p of powers) {
                if (p.busy) continue;
                p.busy = true;
                p.kind = kind;
                p.x = LANES[lane];
                p.z = z == null ? SPAWN_Z : z;
                p.y = 1.15;
                while (p.core.children.length) p.core.remove(p.core.children[0]);
                p.core.add(buildIcon(kind));
                p.ring.material.color.setHex(powerDefs[kind].color);
                p.light.color.setHex(powerDefs[kind].color);
                p.light.intensity = 1.2;
                p.group.visible = true;
                p.group.position.set(p.x, p.y, p.z);
                return p;
            }
            return null;
        },

        update(dt, speed, px, py, magnetActive, onCoin, onPower) {
            for (const c of coins) {
                if (!c.busy) continue;
                c.z += speed * dt;
                c.spin += dt * 5;
                if (magnetActive && !c.pull) {
                    const dx = px - c.x, dy = (py + 0.9) - c.y, dz = 0 - c.z;
                    if (dx * dx + dy * dy + dz * dz < 64) c.pull = 0.001;
                }
                if (c.pull) {
                    c.pull = Math.min(1, c.pull + dt * 3.2);
                    const k = c.pull * c.pull;
                    c.x += (px - c.x) * k;
                    c.y += ((py + 0.9) - c.y) * k;
                    c.z += (0 - c.z) * k;
                }
                c.mesh.position.set(c.x, c.y, c.z);
                c.mesh.rotation.z = c.spin;
                const dx = px - c.x, dy = (py + 0.9) - c.y, dz = c.z;
                if (Math.abs(dx) < 0.7 && Math.abs(dy) < 1.0 && Math.abs(dz) < 0.8) {
                    c.busy = false; c.mesh.visible = false;
                    onCoin(c.x, c.y, c.z);
                    continue;
                }
                if (c.z > DESPAWN_Z) { c.busy = false; c.mesh.visible = false; c.pull = 0; }
            }
            for (const p of powers) {
                if (!p.busy) continue;
                p.z += speed * dt;
                p.bob += dt * 2.4;
                p.group.position.set(p.x, p.y + Math.sin(p.bob) * 0.14, p.z);
                p.core.rotation.y += dt * 2.2;
                p.ring.rotation.y -= dt * 1.4;
                const dx = px - p.x, dy = (py + 1.0) - p.group.position.y, dz = p.z;
                if (Math.abs(dx) < 0.85 && Math.abs(dy) < 1.2 && Math.abs(dz) < 0.9) {
                    p.busy = false; p.group.visible = false;
                    onPower(p.kind, p.x, p.group.position.y, p.z);
                    continue;
                }
                if (p.z > DESPAWN_Z) { p.busy = false; p.group.visible = false; }
            }
        },
    };

    return api;
}

// ===== module: effects =====
// Metro Dash 3D - particles, camera shake and boost tunnel-vision.


const MAX_PARTICLES = 240;

function createEffects(scene) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    const particles = []; // {x,y,z,vx,vy,vz,life,maxLife,r,g,b}
    let shakeTime = 0;
    let shakeStrength = 0;

    function burst(x, y, z, colorHex, count, spread, up) {
        const c = new THREE.Color(colorHex);
        for (let i = 0; i < count; i++) {
            if (particles.length >= MAX_PARTICLES) particles.shift();
            particles.push({
                x: x, y: y, z: z,
                vx: (Math.random() - 0.5) * (spread || 4),
                vy: Math.random() * (up || 4) + 1,
                vz: (Math.random() - 0.5) * (spread || 4),
                life: 0, maxLife: 0.5 + Math.random() * 0.45,
                r: c.r, g: c.g, b: c.b,
            });
        }
    }

    const api = {
        coinBurst(x, y, z) { burst(x, y, z, 0xffd34d, 8, 2.4, 3); },
        powerBurst(x, y, z, colorHex) { burst(x, y, z, colorHex, 20, 4, 5); },
        crashBurst(x, y, z) {
            burst(x, y, z, 0xff5a5a, 26, 7, 6);
            burst(x, y, z, 0xdfe8ff, 14, 5, 4);
        },
        runDust(x, y, z) {
            if (Math.random() < 0.35) burst(x + (Math.random() - 0.5) * 0.3, y + 0.05, z + 0.3, 0x8a7f6a, 1, 0.6, 0.8);
        },

        shake(strength, time) {
            shakeStrength = Math.max(shakeStrength, strength);
            shakeTime = Math.max(shakeTime, time);
        },

        shakeOffset(out) {
            if (shakeTime <= 0) { out.set(0, 0, 0); return; }
            const s = shakeStrength * (shakeTime > 0 ? Math.min(1, shakeTime * 3) : 0);
            out.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.5);
        },

        update(dt) {
            if (shakeTime > 0) { shakeTime -= dt; if (shakeTime <= 0) shakeStrength = 0; }
            let n = 0;
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life += dt;
                if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
                p.vy -= 9 * dt;
                p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.4; }
            }
            for (const p of particles) {
                const fade = 1 - p.life / p.maxLife;
                positions[n * 3] = p.x; positions[n * 3 + 1] = p.y; positions[n * 3 + 2] = p.z;
                colors[n * 3] = p.r * fade; colors[n * 3 + 1] = p.g * fade; colors[n * 3 + 2] = p.b * fade;
                n++;
            }
            geo.setDrawRange(0, n);
            geo.attributes.position.needsUpdate = true;
            geo.attributes.color.needsUpdate = true;
        },

        dispose() {
            scene.remove(points);
            geo.dispose(); mat.dispose();
        },
    };

    return api;
}

// ===== module: ui =====
// Metro Dash 3D - every screen and the HUD, plain DOM over the canvas.
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

function button(cls, text, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
    return b;
}

function createUI(root, handlers) {
    // ---------- HUD ----------
    const hud = el('div', 'md-hud');
    const hudLeft = el('div', 'md-hud-left');
    const scoreEl = el('div', 'md-score', '0');
    const multEl = el('div', 'md-mult', '');
    const coinsEl = el('div', 'md-coins');
    coinsEl.appendChild(el('span', 'md-coin-ico'));
    const coinsVal = el('span', null, '0');
    coinsEl.appendChild(coinsVal);
    hudLeft.appendChild(scoreEl);
    hudLeft.appendChild(multEl);
    hudLeft.appendChild(coinsEl);
    const hudRight = el('div', 'md-hud-right');
    const pauseBtn = button('md-pause-btn', '❚❚', handlers.onPause);
    pauseBtn.setAttribute('aria-label', 'Pause');
    const powerWrap = el('div', 'md-power');
    hudRight.appendChild(pauseBtn);
    hudRight.appendChild(powerWrap);
    hud.appendChild(hudLeft);
    hud.appendChild(hudRight);
    hud.hidden = true;
    root.appendChild(hud);

    const powerBadges = {};
    function setPower(kind, secondsLeft) {
        if (secondsLeft != null && secondsLeft > 0) {
            if (!powerBadges[kind]) {
                const badge = el('div', 'md-power-badge ' + kind);
                powerWrap.appendChild(badge);
                powerBadges[kind] = badge;
            }
            powerBadges[kind].textContent = kind.toUpperCase() + ' ' + Math.ceil(secondsLeft) + 's';
        } else if (powerBadges[kind]) {
            powerBadges[kind].remove();
            delete powerBadges[kind];
        }
    }

    // ---------- countdown + flash + toasts ----------
    const countdownEl = el('div', 'md-countdown');
    root.appendChild(countdownEl);
    const flash = el('div', 'md-flash');
    root.appendChild(flash);
    const toasts = el('div', 'md-toasts');
    root.appendChild(toasts);

    function toast(text, ms) {
        const t = el('div', 'md-toast', text);
        toasts.appendChild(t);
        setTimeout(() => { t.remove(); }, ms || 2600);
    }

    function flashRed() {
        flash.classList.remove('on');
        void flash.offsetWidth; // restart the animation
        flash.classList.add('on');
    }

    // ---------- screen factory ----------
    function makeScreen() {
        const s = el('div', 'md-screen');
        s.hidden = true;
        root.appendChild(s);
        return s;
    }

    // ---------- main menu ----------
    const menu = makeScreen();
    menu.appendChild(el('div', 'md-title', 'METRO DASH'));
    menu.appendChild(el('div', 'md-subtitle', 'Endless Railway Runner'));
    const menuBest = el('div', 'md-best', '');
    menu.appendChild(menuBest);
    menu.appendChild(button('md-btn', '▶  PLAY', handlers.onPlay));
    const menuRow = el('div', 'md-btn-row');
    menuRow.appendChild(button('md-btn secondary', 'MISSIONS', handlers.onShowMissions));
    menuRow.appendChild(button('md-btn secondary', 'SETTINGS', handlers.onShowSettings));
    menu.appendChild(menuRow);
    menu.appendChild(el('div', 'md-hint', 'Swipe or use arrow keys • Space to jump • P to pause'));

    // ---------- pause ----------
    const pause = makeScreen();
    pause.appendChild(el('h2', 'md-h2', 'PAUSED'));
    const pauseStats = el('div', 'md-stats');
    const pScore = stat(pauseStats, '0', 'SCORE');
    const pCoins = stat(pauseStats, '0', 'COINS');
    const pDist = stat(pauseStats, '0m', 'DISTANCE');
    pause.appendChild(pauseStats);
    pause.appendChild(button('md-btn', '▶  RESUME', handlers.onResume));
    const pauseRow = el('div', 'md-btn-row');
    pauseRow.appendChild(button('md-btn secondary', 'RESTART', handlers.onRestart));
    pauseRow.appendChild(button('md-btn secondary', 'SETTINGS', handlers.onShowSettings));
    pauseRow.appendChild(button('md-btn secondary', 'MAIN MENU', handlers.onQuit));
    pause.appendChild(pauseRow);

    // ---------- game over ----------
    const over = makeScreen();
    over.appendChild(el('h2', 'md-h2', 'WRECKED!'));
    const newBest = el('div', 'md-newbest', '★ NEW BEST! ★');
    newBest.hidden = true;
    over.appendChild(newBest);
    const overStats = el('div', 'md-stats');
    const oScore = stat(overStats, '0', 'SCORE');
    const oCoins = stat(overStats, '0', 'COINS');
    const oBest = stat(overStats, '0', 'BEST');
    over.appendChild(overStats);
    const overMissions = el('div', 'md-missions');
    over.appendChild(overMissions);
    over.appendChild(button('md-btn', '↻  RUN AGAIN', handlers.onRestart));
    over.appendChild(button('md-btn secondary', 'MAIN MENU', handlers.onQuit));

    // ---------- missions ----------
    const missions = makeScreen();
    missions.appendChild(el('h2', 'md-h2', 'MISSIONS'));
    const missionList = el('div', 'md-missions');
    missions.appendChild(missionList);
    const missionsBack = button('md-btn secondary', 'BACK', handlers.onBackFromMissions);
    missions.appendChild(missionsBack);

    // ---------- settings ----------
    const settings = makeScreen();
    settings.appendChild(el('h2', 'md-h2', 'SETTINGS'));
    const soundRow = el('div', 'md-set-row');
    soundRow.appendChild(el('span', null, 'Sound effects'));
    const soundToggle = button('md-toggle', '', handlers.onToggleSound);
    soundRow.appendChild(soundToggle);
    settings.appendChild(soundRow);
    const musicRow = el('div', 'md-set-row');
    musicRow.appendChild(el('span', null, 'Music'));
    const musicToggle = button('md-toggle', '', handlers.onToggleMusic);
    musicRow.appendChild(musicToggle);
    settings.appendChild(musicRow);
    const qualityRow = el('div', 'md-set-row');
    qualityRow.appendChild(el('span', null, 'Graphics'));
    const seg = el('div', 'md-seg');
    const qLow = button('', 'LOW', () => handlers.onQuality('low'));
    const qHigh = button('', 'HIGH', () => handlers.onQuality('high'));
    seg.appendChild(qLow); seg.appendChild(qHigh);
    qualityRow.appendChild(seg);
    settings.appendChild(qualityRow);
    settings.appendChild(button('md-btn danger', 'RESET PROGRESS', handlers.onResetProgress));
    settings.appendChild(button('md-btn secondary', 'BACK', handlers.onBackFromSettings));

    function stat(parent, value, label) {
        const wrap = el('div', 'md-stat');
        const b = el('b', null, value);
        wrap.appendChild(b);
        wrap.appendChild(el('span', null, label));
        parent.appendChild(wrap);
        return b;
    }

    const screens = { menu: menu, pause: pause, over: over, settings: settings, missions: missions };

    const ui = {
        show(name) {
            for (const key of Object.keys(screens)) screens[key].hidden = key !== name;
            hud.hidden = !(name == null || name === 'pause');
        },
        hideAll() { ui.show(null); },

        setScore(v) { scoreEl.textContent = String(v); },
        setCoins(v) { coinsVal.textContent = String(v); },
        setMultiplier(m) { multEl.textContent = m > 1 ? 'x' + m + ' SCORE' : ''; },
        setPower: setPower,

        setMenuBest(best, bank) {
            menuBest.textContent = best > 0 ? 'BEST ' + best.toLocaleString('en-US') + '  •  ' + bank.toLocaleString('en-US') + ' coins banked' : 'First run - make it count!';
        },

        setPauseStats(score, coins, dist) {
            pScore.textContent = String(score);
            pCoins.textContent = String(coins);
            pDist.textContent = Math.floor(dist) + 'm';
        },

        showGameOver(score, coins, best, isNewBest, missionStates) {
            oScore.textContent = score.toLocaleString('en-US');
            oCoins.textContent = String(coins);
            oBest.textContent = best.toLocaleString('en-US');
            newBest.hidden = !isNewBest;
            ui.renderMissions(overMissions, missionStates, 3);
            ui.show('over');
        },

        renderMissions(container, missionStates, limit) {
            container.innerHTML = '';
            missionStates.slice(0, limit || missionStates.length).forEach((m) => {
                const row = el('div', 'md-mission' + (m.done ? ' done' : ''));
                row.appendChild(el('span', null, (m.done ? '✓ ' : '') + m.desc));
                const bar = el('div', 'bar');
                const fill = el('i');
                fill.style.width = Math.min(100, Math.round((m.progress / m.target) * 100)) + '%';
                bar.appendChild(fill);
                row.appendChild(bar);
                container.appendChild(row);
            });
        },

        showMissionsScreen(missionStates) {
            ui.renderMissions(missionList, missionStates);
            ui.show('missions');
        },

        countdown(text, go) {
            countdownEl.textContent = text || '';
            countdownEl.classList.toggle('go', !!go);
        },

        syncSettings(s) {
            soundToggle.setAttribute('aria-pressed', String(!!s.sound));
            musicToggle.setAttribute('aria-pressed', String(!!s.music));
            qLow.setAttribute('aria-pressed', String(s.quality === 'low'));
            qHigh.setAttribute('aria-pressed', String(s.quality !== 'low'));
        },

        toast: toast,
        flashRed: flashRed,
    };

    return ui;
}

// ===== module: missions =====
// Metro Dash 3D - missions: three live at a time, harder tiers unlock as you finish them.


const MISSION_DEFS = [
    { id: 'dist1', desc: 'Run 500 m in one run', target: 500, metric: (r) => r.distance, tier: 1 },
    { id: 'coins1', desc: 'Grab 25 coins in one run', target: 25, metric: (r) => r.coins, tier: 1 },
    { id: 'jumps1', desc: 'Jump 15 times in one run', target: 15, metric: (r) => r.jumps, tier: 1 },
    { id: 'score1', desc: 'Score 1,500 in one run', target: 1500, metric: (r) => r.score, tier: 2 },
    { id: 'dist2', desc: 'Run 1,500 m in one run', target: 1500, metric: (r) => r.distance, tier: 2 },
    { id: 'slides1', desc: 'Slide 15 times in one run', target: 15, metric: (r) => r.slides, tier: 2 },
    { id: 'coins2', desc: 'Grab 75 coins in one run', target: 75, metric: (r) => r.coins, tier: 3 },
    { id: 'power1', desc: 'Use 3 power-ups in one run', target: 3, metric: (r) => r.powerups, tier: 3 },
    { id: 'score2', desc: 'Score 5,000 in one run', target: 5000, metric: (r) => r.score, tier: 3 },
    { id: 'dist3', desc: 'Run 3,000 m in one run', target: 3000, metric: (r) => r.distance, tier: 4 },
    { id: 'coins3', desc: 'Grab 200 coins in one run', target: 200, metric: (r) => r.coins, tier: 4 },
    { id: 'score3', desc: 'Score 12,000 in one run', target: 12000, metric: (r) => r.score, tier: 4 },
];

const REWARD = 40; // banked coins per finished mission

function createMissions() {
    const saved = load('missions', null);
    const state = saved && saved.slots ? saved : { slots: [0, 1, 2], done: {} };

    function persist() { save('missions', state); }

    function defFor(slotIndex) { return MISSION_DEFS[state.slots[slotIndex] % MISSION_DEFS.length]; }

    function nextIndex(afterIdx) {
        // pick the next unfinished def, preferring the lowest tier
        for (let i = 1; i <= MISSION_DEFS.length; i++) {
            const idx = (afterIdx + i) % MISSION_DEFS.length;
            if (!state.done[MISSION_DEFS[idx].id]) return idx;
        }
        return (afterIdx + 1) % MISSION_DEFS.length;
    }

    const api = {
        // snapshot for the UI, with live progress from the current run
        list(runStats) {
            return state.slots.map((slotIdx, i) => {
                const def = defFor(i);
                const progress = runStats ? Math.min(def.target, Math.floor(def.metric(runStats))) : 0;
                return { id: def.id, desc: def.desc, target: def.target, progress: progress, done: !!state.done[def.id] };
            });
        },

        // called live during a run; returns missions completed by this update
        check(runStats) {
            const completed = [];
            state.slots.forEach((slotIdx, i) => {
                const def = defFor(i);
                if (state.done[def.id]) return;
                if (def.metric(runStats) >= def.target) {
                    state.done[def.id] = true;
                    completed.push(def);
                    state.slots[i] = nextIndex(slotIdx);
                }
            });
            if (completed.length) persist();
            return completed;
        },

        reward: REWARD,
        allDone() { return MISSION_DEFS.every((d) => state.done[d.id]); },
    };

    return api;
}

// ===== module: main =====
// Metro Dash 3D - entry point: scene, loop, states, physics, scoring, input.












function startGame(host) {
    const root = document.createElement('div');
    root.className = 'md-root';
    host.appendChild(root);

    // ---------- renderer / scene / camera ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

    const settings = load('settings', { sound: true, music: true, quality: 'high' });

    const audio = new AudioEngine();
    audio.soundOn = settings.sound;
    audio.musicOn = settings.music;

    const world = createWorld(scene, settings.quality);
    const player = createPlayer();
    scene.add(player.group);
    const obstacles = createObstacles(scene);
    const collectibles = createCollectibles(scene);
    const effects = createEffects(scene);
    const missions = createMissions();

    function applyQuality() {
        const low = settings.quality === 'low';
        renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = !low;
        world.setQuality(settings.quality);
        resize();
    }

    // ---------- sizing (no vh units: this page may live in a page-height frame) ----------
    function resize() {
        const w = Math.max(280, host.clientWidth || root.clientWidth || 320);
        const h = Math.round(Math.min(Math.max(w * (w < 520 ? 1.32 : 0.72), 430), 660));
        root.style.height = h + 'px';
        renderer.setSize(w, h, true); // inline style: canvas always exactly fills the root
        renderer.setViewport(0, 0, w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const lateResize = setTimeout(resize, 400);

    // ---------- run state ----------
    const run = {
        state: 'menu', // menu | countdown | playing | dying | paused | over
        speed: START_SPEED,
        distance: 0,
        score: 0,
        coins: 0,
        jumps: 0,
        slides: 0,
        powerups: 0,
        multiplier: 1,
        magnetLeft: 0,
        boostLeft: 0,
        shieldLeft: 0,
        invulnLeft: 0,
        countdownT: 0,
        countdownStep: -1,
        deathT: 0,
        elapsed: 0,
    };
    let best = load('best', 0);
    let bank = load('bank', 0);
    let settingsReturnTo = 'menu';
    let missionsReturnTo = 'menu';
    let coinRoad = 0;   // meters since last coin line
    let powerRoad = 0;  // meters since last power-up

    // ---------- UI ----------
    const ui = createUI(root, {
        onPlay() { audio.unlock(); audio.click(); startRun(); },
        onPause() { if (run.state === 'playing' || run.state === 'countdown') pauseGame(); },
        onResume() { audio.click(); resumeGame(); },
        onRestart() { audio.unlock(); audio.click(); startRun(); },
        onQuit() { audio.click(); toMenu(); },
        onShowSettings() { audio.click(); settingsReturnTo = run.state === 'paused' ? 'pause' : 'menu'; ui.syncSettings(settings); ui.show('settings'); },
        onBackFromSettings() {
            audio.click();
            if (settingsReturnTo === 'pause') ui.show('pause'); else toMenu();
        },
        onShowMissions() { audio.click(); missionsReturnTo = run.state === 'paused' ? 'pause' : 'menu'; ui.showMissionsScreen(missions.list(currentStats())); },
        onBackFromMissions() { audio.click(); if (missionsReturnTo === 'pause') ui.show('pause'); else toMenu(); },
        onToggleSound() { settings.sound = !settings.sound; save('settings', settings); audio.setSound(settings.sound); audio.click(); ui.syncSettings(settings); },
        onToggleMusic() {
            settings.music = !settings.music; save('settings', settings);
            audio.setMusic(settings.music);
            if (!settings.music) audio.stopMusic(); else if (run.state === 'playing') audio.startMusic();
            audio.click(); ui.syncSettings(settings);
        },
        onQuality(q) { settings.quality = q; save('settings', settings); audio.click(); applyQuality(); ui.syncSettings(settings); },
        onResetProgress() {
            wipe();
            best = 0; bank = 0;
            settings.sound = true; settings.music = true; settings.quality = 'high';
            audio.setSound(true); audio.setMusic(true); applyQuality();
            const freshMissions = createMissions();
            Object.assign(missions, freshMissions);
            ui.syncSettings(settings);
            ui.setMenuBest(best, bank);
            ui.toast('Progress wiped. Fresh start!');
            audio.click();
        },
    });
    ui.syncSettings(settings);

    function currentStats() {
        return { distance: run.distance, coins: run.coins, jumps: run.jumps, slides: run.slides, score: Math.floor(run.score), powerups: run.powerups };
    }

    // ---------- state changes ----------
    function toMenu() {
        run.state = 'menu';
        audio.stopMusic();
        ui.setMenuBest(best, bank);
        ui.show('menu');
        ui.setPower('magnet', 0); ui.setPower('boost', 0); ui.setPower('shield', 0);
        ui.setMultiplier(1);
        player.reset();
        obstacles.reset();
        collectibles.reset();
    }

    function startRun() {
        run.state = 'countdown';
        run.speed = START_SPEED;
        run.distance = 0; run.score = 0; run.coins = 0;
        run.jumps = 0; run.slides = 0; run.powerups = 0;
        run.multiplier = 1;
        run.magnetLeft = 0; run.boostLeft = 0; run.shieldLeft = 0; run.invulnLeft = 0;
        run.countdownT = 0; run.countdownStep = -1; run.elapsed = 0;
        coinRoad = 0; powerRoad = 0;
        player.reset();
        obstacles.reset();
        collectibles.reset();
        player.shieldMesh.visible = false;
        ui.hideAll();
        ui.setScore(0); ui.setCoins(0); ui.setMultiplier(1);
        ui.setPower('magnet', 0); ui.setPower('boost', 0); ui.setPower('shield', 0);
        audio.startMusic();
    }

    function pauseGame() {
        if (run.state === 'countdown') { ui.countdown(''); run.countdownStep = -1; }
        run.pausedFrom = run.state;
        run.state = 'paused';
        audio.stopMusic();
        ui.setPauseStats(Math.floor(run.score), run.coins, run.distance);
        ui.show('pause');
    }

    function resumeGame() {
        if (run.pausedFrom === 'countdown') {
            startRun(); // countdown restarts, by design
            return;
        }
        run.state = 'playing';
        ui.hideAll();
        audio.startMusic();
    }

    function crashInto(obstacle) {
        const px = player.group.position.x;
        if (run.shieldLeft > 0 || run.invulnLeft > 0) {
            run.shieldLeft = 0;
            run.invulnLeft = 1.2;
            player.shieldMesh.visible = false;
            obstacles.smash(obstacle);
            effects.powerBurst(px, 1.2, 0, 0x59ffa0);
            effects.shake(0.5, 0.3);
            audio.shieldBreak();
            ui.toast('Shield absorbed the hit!');
            return;
        }
        run.state = 'dying';
        run.deathT = 0;
        player.die();
        effects.crashBurst(px, 1.2, 0);
        effects.shake(0.9, 0.6);
        ui.flashRed();
        audio.crash();
        audio.stopMusic();
    }

    function finishRun() {
        run.state = 'over';
        audio.gameOver();
        const finalScore = Math.floor(run.score);
        const isNewBest = finalScore > best;
        if (isNewBest) { best = finalScore; save('best', best); }
        bank += run.coins;
        save('bank', bank);
        ui.showGameOver(finalScore, run.coins, best, isNewBest, missions.list(currentStats()));
    }

    // ---------- collectibles callbacks ----------
    function onCoin(x, y, z) {
        run.coins += 1;
        run.score += 25 * run.multiplier;
        ui.setCoins(run.coins);
        effects.coinBurst(x, y, z);
        audio.coin();
    }

    function onPower(kind, x, y, z) {
        run.powerups += 1;
        audio.powerup();
        if (kind === 'magnet') {
            run.magnetLeft = MAGNET_TIME;
            ui.toast('MAGNET - coins come to you!');
            effects.powerBurst(x, y, z, 0x3fd0ff);
        } else if (kind === 'boost') {
            run.boostLeft = BOOST_TIME;
            ui.toast('BOOST - double score, full speed!');
            effects.powerBurst(x, y, z, 0xff9a3d);
        } else {
            run.shieldLeft = SHIELD_TIME;
            player.shieldMesh.visible = true;
            ui.toast('SHIELD - one free crash!');
            effects.powerBurst(x, y, z, 0x59ffa0);
        }
    }

    // ---------- input ----------
    function doLane(dir) { if (run.state === 'playing' && player.move(dir)) audio.lane(); }
    function doJump() { if (run.state === 'playing' && player.jump()) { run.jumps++; audio.jump(); } }
    function doSlide() { if (run.state === 'playing' && player.slide()) { run.slides++; audio.slide(); } }

    function onKeyDown(e) {
        if (e.repeat) return;
        const k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); doLane(-1); }
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); doLane(1); }
        else if (k === 'ArrowUp' || k === ' ' || k === 'w' || k === 'W') { e.preventDefault(); doJump(); }
        else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); doSlide(); }
        else if (k === 'p' || k === 'P' || k === 'Escape') {
            if (run.state === 'playing' || run.state === 'countdown') pauseGame();
            else if (run.state === 'paused') resumeGame();
        } else if (k === 'Enter') {
            if (run.state === 'menu' || run.state === 'over') { audio.unlock(); startRun(); }
        }
    }
    window.addEventListener('keydown', onKeyDown);

    // swipe (touch) + drag (mouse) share the same gesture math
    let gesture = null;
    function gestureStart(x, y) { gesture = { x: x, y: y, used: false }; }
    function gestureMove(x, y) {
        if (!gesture || gesture.used) return;
        const dx = x - gesture.x, dy = y - gesture.y;
        if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
        gesture.used = true;
        if (Math.abs(dx) > Math.abs(dy)) doLane(dx > 0 ? 1 : -1);
        else if (dy < 0) doJump();
        else doSlide();
    }
    function gestureEnd() { gesture = null; }

    function onTouchStart(e) { const t = e.changedTouches[0]; gestureStart(t.clientX, t.clientY); }
    function onTouchMove(e) {
        if (run.state === 'playing') e.preventDefault();
        const t = e.changedTouches[0]; gestureMove(t.clientX, t.clientY);
    }
    function onMouseDown(e) { gestureStart(e.clientX, e.clientY); }
    function onMouseMove(e) { if (e.buttons) gestureMove(e.clientX, e.clientY); }
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('touchend', gestureEnd);
    root.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', gestureEnd);

    function onVisibility() {
        if (document.hidden && (run.state === 'playing' || run.state === 'countdown')) pauseGame();
    }
    document.addEventListener('visibilitychange', onVisibility);

    // ---------- spawning extras (coins + power-ups) ----------
    function spawnExtras(distMoved) {
        coinRoad += distMoved;
        powerRoad += distMoved;
        if (coinRoad > 34) {
            coinRoad = 0;
            const lane = (Math.random() * 3) | 0;
            const z = -85;
            const blockedByTrain = obstacles.active.some((o) => o.type === 'train' && o.lane === lane && o.z > z - 6 && o.z - o.len < z + 6);
            if (!blockedByTrain) {
                if (Math.random() < 0.3) collectibles.spawnCoinArcOverBarrier(lane, z - 6);
                else collectibles.spawnCoinLine(lane, z, 5 + ((Math.random() * 4) | 0), false);
            }
        }
        if (powerRoad > 110) {
            powerRoad = 0;
            const kinds = ['magnet', 'boost', 'shield'];
            collectibles.spawnPowerUp(kinds[(Math.random() * 3) | 0], (Math.random() * 3) | 0, -90);
        }
    }

    // ---------- camera ----------
    const shakeVec = new THREE.Vector3();
    let menuCamT = 0;
    function updateCamera(dt) {
        const px = player.group.position.x;
        if (run.state === 'menu') {
            menuCamT += dt;
            camera.position.set(Math.sin(menuCamT * 0.24) * 3.2, 4.6 + Math.sin(menuCamT * 0.5) * 0.3, 8.8);
            camera.lookAt(0, 1.3, -10);
            camera.fov += (58 - camera.fov) * dt * 2;
        } else {
            const bob = player.state.grounded && !player.state.sliding ? Math.abs(Math.sin(player.state.runPhase)) * 0.07 : 0;
            camera.position.set(px * 0.45, 4.55 + bob, 7.6);
            camera.lookAt(px * 0.72, 1.25, -8);
            const targetFov = run.boostLeft > 0 ? 72 : 60;
            camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
        }
        effects.shakeOffset(shakeVec);
        camera.position.add(shakeVec);
        camera.updateProjectionMatrix();
    }

    // ---------- main loop ----------
    let last = performance.now();
    let raf = 0;

    function frame(now) {
        raf = requestAnimationFrame(frame);
        let dt = (now - last) / 1000;
        last = now;
        if (dt > 0.06) dt = 0.06;

        if (run.state === 'menu' || run.state === 'over') {
            // ambient backdrop: the city drifts by slowly
            world.advance(4.5 * dt);
            world.update(dt, 0, 4.5);
            player.update(dt, 4.5);
            effects.update(dt);
        } else if (run.state === 'countdown') {
            run.countdownT += dt;
            const step = Math.floor(run.countdownT);
            if (step !== run.countdownStep) {
                run.countdownStep = step;
                if (step < 3) { ui.countdown(String(3 - step)); audio.countTick(); }
                else {
                    ui.countdown('GO!', true);
                    audio.countGo();
                    run.state = 'playing';
                    setTimeout(() => ui.countdown(''), 600);
                }
            }
            world.advance(3 * dt);
            world.update(dt, 0, 3);
            player.update(dt, 6);
            effects.update(dt);
        } else if (run.state === 'playing' || run.state === 'dying') {
            const alive = run.state === 'playing';
            run.elapsed += dt;

            // difficulty + speed ramp
            const difficulty = Math.min(1, run.elapsed / 150);
            if (alive) run.speed = Math.min(MAX_SPEED, run.speed + SPEED_RAMP * dt * (1 + difficulty));
            const effSpeed = run.state === 'dying'
                ? Math.max(0, run.speed * (1 - run.deathT * 1.6))
                : run.speed * (run.boostLeft > 0 ? BOOST_MULTIPLIER : 1);
            const moved = effSpeed * dt;

            // power-up timers
            if (run.magnetLeft > 0) { run.magnetLeft = Math.max(0, run.magnetLeft - dt); ui.setPower('magnet', run.magnetLeft); }
            if (run.boostLeft > 0) { run.boostLeft = Math.max(0, run.boostLeft - dt); ui.setPower('boost', run.boostLeft); }
            if (run.shieldLeft > 0) {
                run.shieldLeft = Math.max(0, run.shieldLeft - dt);
                ui.setPower('shield', run.shieldLeft);
                if (run.shieldLeft === 0) player.shieldMesh.visible = false;
            }
            if (run.invulnLeft > 0) run.invulnLeft = Math.max(0, run.invulnLeft - dt);
            run.multiplier = run.boostLeft > 0 ? 2 : 1;

            if (alive) {
                run.distance += moved;
                run.score += moved * 1.2 * run.multiplier;
                ui.setScore(Math.floor(run.score));
                ui.setMultiplier(run.multiplier);
                spawnExtras(moved);
                audio.setIntensity(difficulty);

                const finished = missions.check(currentStats());
                for (const m of finished) {
                    bank += missions.reward;
                    save('bank', bank);
                    ui.toast('MISSION DONE: ' + m.desc + ' (+' + missions.reward + ' coins)');
                    audio.missionDone();
                }
            }

            world.advance(moved);
            world.update(dt, 0, effSpeed);
            obstacles.update(dt, effSpeed, difficulty);
            collectibles.update(dt, effSpeed, player.group.position.x, player.group.position.y, run.magnetLeft > 0, onCoin, onPower);
            player.update(dt, effSpeed);
            player.shieldMesh.visible = run.shieldLeft > 0;
            if (alive && player.state.grounded) effects.runDust(player.group.position.x, 0, 0.4);
            effects.update(dt);

            if (alive) {
                const hit = obstacles.collide(
                    player.group.position.x, player.group.position.y,
                    PLAYER_HALF_W, player.hitboxHeight()
                );
                if (hit) crashInto(hit);
            } else {
                run.deathT += dt;
                if (run.deathT > 0.95) finishRun();
            }
        }
        // paused: render the frozen scene as-is
        root.dataset.mdDebug = JSON.stringify({
            state: run.state, score: Math.floor(run.score), coins: run.coins,
            dist: Math.floor(run.distance), speed: Math.round(run.speed * 10) / 10,
            time: Math.round(world.time * 10) / 10, night: Math.round(world.nightFactor * 100) / 100,
            obstacles: obstacles.active.length,
        });

        updateCamera(dt);
        renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    // ---------- go ----------
    applyQuality();
    resize();
    toMenu();

    // debug handle (used by automated smoke tests; not part of the UI)
    window.__METRO_DASH__ = {
        state: () => run.state,
        score: () => Math.floor(run.score),
        coins: () => run.coins,
        distance: () => Math.floor(run.distance),
        speed: () => run.speed,
        best: () => best,
        start: () => { audio.unlock(); startRun(); },
        crash: () => { if (run.state === 'playing') { run.shieldLeft = 0; run.invulnLeft = 0; const o = obstacles.nearestAhead(); if (o) crashInto(o); else finishRun(); } },
        lane: doLane, jump: doJump, slide: doSlide,
    };

    return {
        destroy() {
            cancelAnimationFrame(raf);
            clearTimeout(lateResize);
            ro.disconnect();
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', gestureEnd);
            document.removeEventListener('visibilitychange', onVisibility);
            audio.destroy();
            effects.dispose();
            world.dispose();
            renderer.dispose();
            if (window.__METRO_DASH__ && window.__METRO_DASH__.state === window.__METRO_DASH__.state) {
                try { delete window.__METRO_DASH__; } catch (e) { window.__METRO_DASH__ = undefined; }
            }
            host.removeChild(root);
        },
    };
}

// ===== module: static-main =====
// Metro Dash 3D - static-host entry (Replit / any static server). No React.


const host = document.getElementById('game-host');
if (host) startGame(host);
