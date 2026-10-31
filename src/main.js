import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  SPEED_IDLE, SPEED_START, SPEED_MAX, SPEED_GAIN, DIFFICULTY_DISTANCE, BOOST_SPEED, HIT_GRACE,
  ZONE_PHYSICS, OXYGEN_DRAIN, OXYGEN_PER_BUBBLE, OXYGEN_LOW,
} from './config.js';
import { settings } from './settings.js';
import { ZonePlan } from './zones.js';
import { Tube } from './tube.js';
import { Player } from './player.js';
import { Track, OBSTACLES } from './track.js';
import { Chaser } from './chaser.js';
import { Powers } from './powers.js';
import { Bursts } from './effects.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Screens } from './screens.js';
import { Sound } from './audio.js';
import { Voice } from './voice.js';
import {
  START_LINES, RUN_LINES, ENTER_WATER_LINES, ENTER_SPACE_LINES, LOW_OXYGEN_LINES, HIT_LINES, CRASH_LINES,
  CAUGHT_LINES, DROWNED_LINES, POWER_LINES, SHIELD_BREAK_LINES, pick,
} from './dispatch.js';

const COIN_POINTS = 10;
const BEST_KEY = 'courier-runner-best';
const FOV = 72;
const BOOST_FOV = 92;
const TOUCH = window.matchMedia('(pointer: coarse)').matches;

// Fog, light and background per zone; the scene eases between them.
const ATMOSPHERE = {
  space: { color: 0x05060f, near: 30, far: 135, ambient: 0x6070a0, ambientIntensity: 0.55, sun: 0.7 },
  water: { color: 0x05394a, near: 10, far: 90, ambient: 0x4fa8b8, ambientIntensity: 0.9, sun: 0.25 },
};

// Rendering cost levels. 'auto' starts high on desktop / medium on phones and
// steps down if the frame rate drops during a run.
const QUALITY_LEVELS = [
  { pixelRatio: 2, bloom: true }, // high
  { pixelRatio: 1.5, bloom: true }, // medium
  { pixelRatio: 1, bloom: false }, // low
];
const SLOW_FPS = 40;

// Tips shown during the first ever run, at these distances (metres).
const HINTS = TOUCH
  ? [[15, 'Swipe ← → to change lane'], [90, 'Swipe ↑ to jump, ↓ to slide'], [170, 'Double-tap to flip to the far wall']]
  : [[15, '← → to change lane'], [90, '↑ to jump, ↓ to slide'], [170, 'Space to flip to the far wall']];

// ---------- renderer & scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(ATMOSPHERE.space.color, ATMOSPHERE.space.near, ATMOSPHERE.space.far);
scene.background = scene.fog.color; // same Color object, so they change together

const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 700);

const ambient = new THREE.AmbientLight(ATMOSPHERE.space.ambient, ATMOSPHERE.space.ambientIntensity);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff0dd, ATMOSPHERE.space.sun);
sun.position.set(1, 1, 0.4);
scene.add(sun);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.35, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

let qualityLevel = 0;
function applyQuality(level) {
  qualityLevel = level;
  const { pixelRatio, bloom: useBloom } = QUALITY_LEVELS[level];
  const ratio = Math.min(window.devicePixelRatio, pixelRatio);
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  bloom.enabled = useBloom;
  resize();
}
function qualityFromSettings() {
  const choice = settings.get('quality');
  if (choice === 'high') return 0;
  if (choice === 'low') return 2;
  return TOUCH ? 1 : 0;
}
applyQuality(qualityFromSettings());
settings.onChange((name) => { if (name === 'quality') applyQuality(qualityFromSettings()); });

// Auto quality: measure the frame rate over a few seconds of running.
const fpsWindow = { frames: 0, time: 0 };
function watchFrameRate(dt) {
  if (settings.get('quality') !== 'auto' || qualityLevel === QUALITY_LEVELS.length - 1) return;
  fpsWindow.frames++;
  fpsWindow.time += dt;
  if (fpsWindow.time < 3) return;
  if (fpsWindow.frames / fpsWindow.time < SLOW_FPS) applyQuality(qualityLevel + 1);
  fpsWindow.frames = 0;
  fpsWindow.time = 0;
}

// ---------- game objects ----------
const zones = new ZonePlan();
const tube = new Tube(scene, zones);
const player = new Player(scene, camera);
const track = new Track(scene, zones);
const chaser = new Chaser(scene);
const powers = new Powers();
const bursts = new Bursts(scene);
const sound = new Sound();
const voice = new Voice(sound);
const hud = new Hud(voice);
const screens = new Screens(sound, {
  play: () => start(),
  restart: () => start(),
  resume: () => resume(),
  menu: () => showMenu(),
});
const playerPosition = new THREE.Vector3();
const targetColor = new THREE.Color();

let state = 'menu'; // menu | running | paused | dead
let deathCause = null; // crash | caught | drowned
let zone = 'space';
let zoneSpeed = 1;
let oxygen = 1;
let lowOxygenWarned = false;
let oxygenBeep = 0;
let startZ = 0;
let distance = 0;
let coins = 0;
let coinStreak = 0;
let lastCoinTime = 0;
let runTime = 0;
let deadTime = 0;
let nextLineAt = 0;
let hints = [];

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function writeBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* storage unavailable */ }
}

const score = () => Math.floor(distance) + coins * COIN_POINTS;
const playerPoint = () => player.body.getWorldPosition(playerPosition).clone().add(new THREE.Vector3(0, 0, -1));
const water = () => zone === 'water';

// Ease fog, background and lights towards the current zone (t = 1 snaps).
function applyAtmosphere(t) {
  const target = ATMOSPHERE[zone];
  scene.fog.color.lerp(targetColor.set(target.color), t);
  scene.fog.near += (target.near - scene.fog.near) * t;
  scene.fog.far += (target.far - scene.fog.far) * t;
  ambient.color.lerp(targetColor.set(target.ambient), t);
  ambient.intensity += (target.ambientIntensity - ambient.intensity) * t;
  sun.intensity += (target.sun - sun.intensity) * t;
}

function setZone(next) {
  zone = next;
  player.setZone(next);
  tube.setZone(next, player.z);
  chaser.setZone(next);
  hud.setZone(next);
}

// ---------- game flow ----------

function showMenu() {
  state = 'menu';
  if (player.dead) player.reset();
  setZone('space');
  applyAtmosphere(1);
  hud.hide();
  sound.setPaused(false);
  sound.stopVoice();
  sound.playMusic('menu');
  screens.showMenu(readBest());
}

function start() {
  sound.unlock();
  if (player.dead) player.reset();
  zones.reset(player.z);
  tube.reset(player.z);
  track.reset(player.z);
  chaser.reset();
  powers.reset();
  bursts.clear();
  setZone('space');
  applyAtmosphere(1);
  zoneSpeed = 1;
  player.setShield(false);
  camera.fov = FOV;
  camera.updateProjectionMatrix();
  startZ = player.z;
  distance = 0;
  coins = 0;
  coinStreak = 0;
  runTime = 0;
  oxygen = 1;
  nextLineAt = 400;
  hints = readBest() ? [] : [...HINTS];
  state = 'running';
  screens.hide();
  hud.show();
  sound.setPaused(false);
  sound.playMusic('space');
  hud.say(pick(START_LINES));
}

function pause() {
  if (state !== 'running') return;
  state = 'paused';
  sound.setPaused(true);
  hud.hideDispatch();
  screens.showPause();
}

function resume() {
  if (state !== 'paused') return;
  state = 'running';
  sound.setPaused(false);
  screens.hide();
}

function die(cause) {
  state = 'dead';
  deathCause = cause;
  deadTime = 0;
  player.dead = true;
  sound.play({ crash: 'crash', caught: water() ? 'chomp' : 'crash', drowned: 'drown' }[cause], { water: water() });
  sound.play('gameover');
  sound.buzz([60, 40, 140]);
  const best = readBest();
  const final = score();
  if (final > best) writeBest(final);
  const quips = { crash: CRASH_LINES[zone], caught: CAUGHT_LINES[zone], drowned: DROWNED_LINES };
  const quip = pick(quips[cause]);
  hud.hide();
  sound.setPaused(true); // music drops back under the score card
  screens.showGameOver({
    score: final,
    distance: Math.floor(distance),
    coins,
    best: Math.max(best, final),
    newBest: final > best,
    quip,
  });
  voice.play(quip);
}

// Crossing a zone gate: crash into the ocean, or geyser back up to space.
function enterZone(next) {
  setZone(next);
  chaser.backOff();
  oxygen = 1;
  lowOxygenWarned = false;
  const wet = next === 'water';
  bursts.spawn(playerPoint(), { color: wet ? 0xbff7ff : 0xffffff, count: 160, speed: 14, size: 0.18, life: 1.3 });
  sound.play(wet ? 'splash' : 'geyser');
  sound.playMusic(next);
  sound.buzz(80);
  hud.flash(wet ? '#2f8fd0' : '#ffffff');
  hud.banner(wet ? 'OCEAN' : 'SPACE');
  hud.hideDispatch();
  hud.say(pick(wet ? ENTER_WATER_LINES : ENTER_SPACE_LINES), 1.5); // after the banner
}

// An obstacle the player failed to clear. Boost and the post-hit grace smash
// through; a shield absorbs one hit; otherwise walls crash and the rest zap.
function handleHit(item) {
  if (powers.has('boost') || player.grace > 0 || powers.has('shield')) {
    track.smash(item);
    const debris = water() ? 0xff6f91 : 0xff8a2a;
    bursts.spawn(item.object.position.clone().lerp(playerPoint(), 0.5), { color: debris, count: 30, speed: 8, size: 0.3 });
    sound.play('smash');
    if (powers.has('boost') || player.grace > 0) return;
    powers.end('shield');
    player.grace = HIT_GRACE * 2;
    sound.play('shield');
    sound.buzz(30);
    hud.flash('#35e8ff');
    hud.say(pick(SHIELD_BREAK_LINES));
    return;
  }
  if (OBSTACLES[item.type].effect === 'crash') return die('crash');
  if (chaser.dangerous) return die('caught');
  player.stumble();
  chaser.alert();
  bursts.spawn(playerPoint(), { color: water() ? 0xff6fd8 : 0xff2a4d, count: 24, speed: 6, size: 0.15, life: 0.5 });
  sound.play('zap', { water: water() });
  sound.buzz(45);
  hud.flash('#ff2a4d');
  hud.say(pick(HIT_LINES[zone]));
}

function collectPower(type) {
  powers.activate(type);
  if (type === 'boost') chaser.backOff();
  sound.play(type === 'boost' ? 'boost' : 'power');
  sound.buzz(20);
  hud.say(pick(POWER_LINES[type]));
}

function collectCoins(count) {
  if (!count) return;
  coins += count;
  coinStreak = runTime - lastCoinTime < 0.6 ? coinStreak + count : 0;
  lastCoinTime = runTime;
  sound.play('coin', { step: coinStreak });
}

function breathe(bubbles) {
  if (!bubbles) return;
  oxygen = Math.min(1, oxygen + bubbles * OXYGEN_PER_BUBBLE);
  bursts.spawn(playerPoint(), { color: 0xbff7ff, count: 10 * bubbles, speed: 3, size: 0.12, life: 0.6 });
  sound.play('bubble');
}

// ---------- input & buttons ----------

const muteButton = document.getElementById('mute');
const showMuted = () => { muteButton.textContent = settings.get('muted') ? '🔇' : '🔊'; };
function toggleMute() {
  sound.unlock();
  settings.set('muted', !settings.get('muted'));
  showMuted();
}
showMuted();
muteButton.addEventListener('click', () => {
  toggleMute();
  muteButton.blur(); // keep Space/Enter for the game
});

const pauseButton = document.getElementById('pause');
pauseButton.addEventListener('click', () => {
  pause();
  pauseButton.blur();
});

// The first touch or click anywhere unlocks audio, so the menu music can start.
window.addEventListener('pointerdown', () => sound.unlock(), { once: true });

// Leaving the tab / app mid-run pauses the game.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

const ACTION_SOUNDS = { left: 'lane', right: 'lane', jump: 'jump', slide: 'slide', flip: 'flip' };

new Input((action, source) => {
  sound.unlock();
  if (action === 'mute') return toggleMute();

  if (state === 'running') {
    if (action === 'pause') return pause();
    if (player.act(action) && ACTION_SOUNDS[action]) sound.play(ACTION_SOUNDS[action], { water: water() });
    return;
  }

  // On the cards, keys drive the buttons: Space / Enter = main button, Esc = back.
  // Touches use the buttons themselves.
  if (source !== 'key') return;
  if (action === 'pause' && screens.back) return screens.back();
  if ((action === 'flip' || action === 'confirm') && screens.primary) {
    if (state === 'dead' && deadTime < 0.8) return; // a panicked key press shouldn't skip the score
    screens.primary();
  }
});

// ---------- loop ----------
const timer = new THREE.Timer();

function runFrame(dt) {
  runTime += dt;
  for (const ended of powers.update(dt)) {
    if (ended === 'boost') player.grace = Math.max(player.grace, 1); // time to find a safe lane
  }
  const boosting = powers.has('boost');
  player.boosting = boosting;
  player.setShield(powers.has('shield'));

  const prevZ = player.z;
  zoneSpeed += (ZONE_PHYSICS[zone].speedFactor - zoneSpeed) * Math.min(1, dt * 2);
  const baseSpeed = Math.min(SPEED_MAX, SPEED_START + distance * SPEED_GAIN) * zoneSpeed;
  player.update(dt, baseSpeed * player.speedFactor + (boosting ? BOOST_SPEED : 0));
  distance = startZ - player.z;
  track.update(dt, player.z, Math.min(1, distance / DIFFICULTY_DISTANCE));
  chaser.update(dt, player, 'chase');

  const zoneNow = zones.zoneAt(player.z);
  if (zoneNow !== zone) enterZone(zoneNow);

  const result = track.collide(player, prevZ);
  collectCoins(result.coins);
  breathe(result.bubbles);
  if (powers.has('magnet')) {
    const pulled = track.attract(dt, player.z, player.body.getWorldPosition(playerPosition));
    collectCoins(pulled.coins);
    breathe(pulled.bubbles);
  }
  if (result.power) collectPower(result.power);
  if (result.hit) handleHit(result.hit);
  if (state !== 'running') return;

  if (water()) {
    oxygen = Math.max(0, oxygen - OXYGEN_DRAIN * dt);
    if (oxygen === 0) return die('drowned');
    if (oxygen < OXYGEN_LOW) {
      if (!lowOxygenWarned) hud.say(pick(LOW_OXYGEN_LINES));
      lowOxygenWarned = true;
      oxygenBeep -= dt;
      if (oxygenBeep <= 0) {
        sound.play('oxygen');
        oxygenBeep = 1;
      }
    } else if (oxygen > 0.5) {
      lowOxygenWarned = false;
    }
  }

  if (hints.length && distance > hints[0][0]) hud.hint(hints.shift()[1]);
  if (distance > nextLineAt) {
    hud.say(pick(RUN_LINES[zone]));
    nextLineAt += 600;
  }
  hud.update(score(), coins, player.flipCharge, powers, chaser.dangerous, water() ? oxygen : null);

  const fov = boosting ? BOOST_FOV : FOV;
  if (Math.abs(camera.fov - fov) > 0.1) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

function frame(timestamp) {
  timer.update(timestamp);
  const rawDt = timer.getDelta();
  const dt = Math.min(rawDt, 1 / 30);

  if (state === 'running') {
    runFrame(dt);
    watchFrameRate(rawDt);
  } else if (state === 'dead') {
    deadTime += dt;
    player.updateDead(dt, Math.max(0, 0.6 - deadTime));
    chaser.update(dt, player, deathCause === 'caught' ? 'catch' : 'idle');
  } else if (state === 'menu') {
    player.update(dt, SPEED_IDLE);
    chaser.update(dt, player, 'idle');
  }

  if (state !== 'paused') {
    applyAtmosphere(Math.min(1, dt * 2.5));
    tube.update(dt, player.z);
    bursts.update(dt);
  }
  composer.render();
  requestAnimationFrame(frame);
}

// Handy for tuning from the browser console while running `npm run dev`.
// e.g. game.skipToZone() puts the next zone gate 40 m ahead.
if (import.meta.env.DEV) {
  window.game = {
    player, track, chaser, powers, zones, voice, sound, settings, collectPower,
    get state() { return state; },
    get zone() { return zone; },
    get quality() { return qualityLevel; },
    get oxygen() { return oxygen; },
    set oxygen(value) { oxygen = value; },
    skipToZone(ahead = 40) {
      // Rebuild the plan so the next gate is `ahead` metres away, keeping the current zone.
      zones.bounds = zone === 'space' ? [player.z - ahead] : [player.z + 1, player.z - ahead];
      track.reset(player.z);
      tube.reset(player.z);
    },
  };
}

showMenu();
requestAnimationFrame(frame);
