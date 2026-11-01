import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  SPEED_IDLE, SPEED_START, SPEED_MAX, SPEED_GAIN, DIFFICULTY_DISTANCE, BOOST_SPEED, HIT_GRACE,
  ZONE_PHYSICS, BATTERY_DRAIN, BATTERY_PER_PICKUP, BATTERY_LOW, TUBE_RADIUS,
} from './config.js';
import { settings } from './settings.js';
import { progress } from './progress.js';
import { LEVELS, ENDING } from './story.js';
import { ZonePlan } from './zones.js';
import { World } from './world.js';
import { City } from './city.js';
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
import { Cinematic } from './cinematic.js';
import { Stage } from './stage.js';
import { Tutorial } from './tutorial.js';
import { introBeats, outroBeats, endingBeats, picturesFor } from './scenes.js';
import {
  START_LINES, RUN_LINES, ENTER_TUNNEL_LINES, ENTER_ROAD_LINES, LOW_BATTERY_LINES, HIT_LINES, CRASH_LINES,
  CAUGHT_LINES, DARK_LINES, POWER_LINES, SHIELD_BREAK_LINES, pick,
} from './dispatch.js';

const COIN_POINTS = 10;
const BEST_KEY = 'courier-runner-best';
const FOV = 66;
const BOOST_FOV = 86;
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const STORY_SPEED_RANGE = 22; // story speed = SPEED_START + difficulty * this
const LOAD_TIMEOUT = 8000; // ms to wait for a cutscene's pictures and voices before going anyway
const CHECKPOINT_EVERY = 3; // seconds of running between saves of the delivery in progress
const CUTSCENE_PIXEL_RATIO = Math.min(window.devicePixelRatio, 2); // cutscenes are cheap: always full sharpness
const ARRIVE_TIME = 1.6; // seconds to glide to a stop at the drop-off
const GEMS_FOR_STAR = 0.6;

// Fog, light and background per zone; the scene eases between them. The road
// is a hazy Patna afternoon (the same haze as the sky's horizon, world.js); the tunnel is dark apart from Riya's phone torch,
// and how far she can see shrinks as its battery runs down.
const ATMOSPHERE = {
  road: { color: 0xd9e8ef, near: 35, far: 170, ambient: 0xffffff, ambientIntensity: 1.0, sun: 1.3, torch: 0 },
  tunnel: { color: 0x0b0a09, near: 4, far: 70, ambient: 0x6a5f50, ambientIntensity: 0.35, sun: 0.05, torch: 70 },
};
const WIDE_FAR = 850; // fog distance during the drone shot over the city
const DARK_FAR = 16; // fog distance in a tunnel when the torch is almost dead
const INTRO_BEHIND = 55; // metres of street kept behind Riya during an intro (the opening glide starts 46 m back)
const EXIT_SETTLE = 40; // metres before a tunnel exit when Riya steers back to the floor

// Rendering cost levels. 'auto' starts high on desktop / medium on phones and
// steps down if the frame rate drops during a run.
const QUALITY_LEVELS = [
  { pixelRatio: 2, bloom: true }, // high
  { pixelRatio: 1.5, bloom: true }, // medium
  { pixelRatio: 1, bloom: false }, // low
];
const SLOW_FPS = 40;

// ---------- renderer & scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(ATMOSPHERE.road.color, ATMOSPHERE.road.near, ATMOSPHERE.road.far);
scene.background = scene.fog.color; // same Color object, so they change together

const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 700);

const ambient = new THREE.AmbientLight(ATMOSPHERE.road.ambient, ATMOSPHERE.road.ambientIntensity);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff3dc, ATMOSPHERE.road.sun); // afternoon sun
sun.position.set(-1, 0.8, 0.6);
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
const world = new World(scene, zones);
const player = new Player(scene, camera);
// Riya's phone torch: lights the tunnel ahead of her, dimming with the battery.
const torch = new THREE.SpotLight(0xfff2d6, 0, 55, 0.6, 0.55, 1.1);
torch.position.set(0, 2.2, 0);
torch.target.position.set(0, 0.8, -22);
player.body.add(torch, torch.target);
const track = new Track(scene, zones);
const chaser = new Chaser(scene);
const powers = new Powers();
const bursts = new Bursts(scene);
const sound = new Sound();
const voice = new Voice(sound);
const hud = new Hud(voice);
const stage = new Stage(sound);
window.addEventListener('resize', () => {
  stage.camera.aspect = window.innerWidth / window.innerHeight;
  stage.camera.updateProjectionMatrix();
});
const cinematic = new Cinematic({ camera, scene, voice, stage });
const tutorial = new Tutorial(sound);
const screens = new Screens(sound, {
  play: (id) => startLevel(id),
  endless: () => startEndless(),
  retry: () => retry(),
  resume: () => (state === 'paused' ? resume() : resumeCheckpoint()),
  menu: () => showMenu(),
});
const playerPosition = new THREE.Vector3();
const targetColor = new THREE.Color();

// menu | cinematic | running | paused | arriving | results | dead
let state = 'menu';
let level = null; // the story delivery being played, or null in endless
let city = null; // old Patna round the start of the first delivery, for the drone shot (city.js)
let deathCause = null; // crash | caught | dark
let zone = 'road';
let zoneSpeed = 1;
let timeScale = 1;
let battery = 1; // phone torch, in tunnels
let lowBatteryWarned = false;
let batteryBeep = 0;
let startZ = 0;
let distance = 0;
let coins = 0;
let hits = 0;
let coinStreak = 0;
let lastCoinTime = 0;
let runTime = 0;
let deadTime = 0;
let nextLineAt = 0;
let arrive = null; // { speed, time } while gliding to a stop at the drop-off
let checkpointTimer = 0;
let stageSharp = false; // renderer switched to full resolution for a 2.5D cutscene

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function writeBest(value) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* storage unavailable */ }
}

const score = () => Math.floor(distance) + coins * COIN_POINTS;
const playerPoint = () => player.body.getWorldPosition(playerPosition).clone().add(new THREE.Vector3(0, 0, -1));
const floorPoint = () => new THREE.Vector3(0, -TUBE_RADIUS, player.z); // under Riya when she's on the floor lane
const inTunnel = () => zone === 'tunnel';
const chaserActive = () => !level || level.chaser;
const routeLength = () => (level ? level.zones.reduce((sum, [, m]) => sum + m, 0) : Infinity);

// Ease fog, background and lights towards the current zone (t = 1 snaps).
function applyAtmosphere(t) {
  const target = ATMOSPHERE[zone];
  let far = inTunnel() ? DARK_FAR + (target.far - DARK_FAR) * battery : target.far;
  let near = target.near;
  if (cinematic.wide) { // the drone shot: see the whole city
    far = WIDE_FAR;
    near = WIDE_FAR * 0.3;
  }
  scene.fog.color.lerp(targetColor.set(target.color), t);
  scene.fog.near += (near - scene.fog.near) * t;
  scene.fog.far += (far - scene.fog.far) * t;
  torch.intensity += (target.torch * (0.25 + 0.75 * battery) - torch.intensity) * t;
  ambient.color.lerp(targetColor.set(target.ambient), t);
  ambient.intensity += (target.ambientIntensity - ambient.intensity) * t;
  sun.intensity += (target.sun - sun.intensity) * t;
}

function setZone(next) {
  zone = next;
  player.setZone(next);
}

// ---------- game flow ----------

// Reset the world for a fresh run along `route` (null = endless).
function setupRun(route) {
  cinematic.finish();
  city?.dispose();
  city = null;
  tutorial.stop();
  voice.stop(); // nothing from the last run (a game-over quip, a radio line) carries over
  hud.hideDispatch();
  player.reset();
  zones.reset(player.z, route);
  world.reset(player.z);
  track.reset(player.z, { powers: !level || level.powers, auto: !level?.tutorial || level.tutorial !== 'basics' });
  chaser.reset();
  chaser.object.visible = false; // shown again by its first update, if it's in this run
  powers.reset();
  bursts.clear();
  setZone(zones.zoneAt(player.z - 1));
  applyAtmosphere(1);
  zoneSpeed = ZONE_PHYSICS[zone].speedFactor;
  player.setShield(false);
  camera.fov = FOV;
  camera.updateProjectionMatrix();
  startZ = player.z;
  distance = 0;
  coins = 0;
  hits = 0;
  coinStreak = 0;
  runTime = 0;
  battery = 1;
  timeScale = 1;
  arrive = null;
  nextLineAt = 400;
  hud.setRoute(route);
  hud.showStamp(false);
  sound.setPaused(false);
  sound.playMusic(zone);
}

function showMenu() {
  state = 'menu';
  level = null;
  setupRun(null);
  hud.hide();
  sound.stopVoice();
  sound.playMusic('menu');
  screens.showTitle();
}

// Everything a delivery's cutscenes say and show, so it can be loaded up front.
function cutsceneLines(lvl) {
  return [...lvl.intro, ...lvl.outro, ...(lvl.finale ? ENDING : [])];
}

// Load a delivery's cutscene pictures and voices (giving up after a while, so a
// slow connection can't block the game: missing bits are just skipped).
function loadCutscenes(lvl) {
  const lines = cutsceneLines(lvl);
  const loading = Promise.all([stage.load(picturesFor(lines)), voice.preload(lines.map((l) => l.text))]);
  return Promise.race([loading, new Promise((resolve) => setTimeout(resolve, LOAD_TIMEOUT))]);
}

// Start a story delivery. The intro plays unless this is a retry or a resume.
// `resumeAt` is a saved checkpoint to continue from.
async function startLevel(id, { intro = true, resumeAt = null } = {}) {
  sound.unlock();
  if (!resumeAt) progress.clearCheckpoint();
  level = LEVELS[id - 1];
  const thisLevel = level;
  setupRun(level.zones);
  hud.hide();
  state = 'loading';
  screens.showLoading(level);
  await loadCutscenes(level);
  if (level !== thisLevel || state !== 'loading') return; // picked something else meanwhile
  screens.hide();
  if (resumeAt) return resumeFrom(resumeAt);
  if (!intro) return beginRun();
  if (level.chaser) chaser.chase = 1; // Mamu is right there in the intro
  world.reset(player.z, INTRO_BEHIND); // street behind Riya for the opening camera moves
  if (level.id === 1) { // the drone opening flies over old Patna
    const [streetTo, streetFrom] = world.span;
    city = new City(scene, player.z, streetFrom, streetTo);
  }
  state = 'cinematic';
  cinematic.play(introBeats(level), {
    anchor: floorPoint,
    player,
    inTunnel,
    onDone: () => {
      progress.markSeen(level.id);
      chaser.reset();
      world.keepBehind(); // the street behind her moves back ahead
      city?.handOver();
      beginRun();
    },
  });
}

// Continue the delivery saved in the checkpoint (after a refresh, or from the menu).
function resumeCheckpoint() {
  const checkpoint = progress.checkpoint;
  if (checkpoint) startLevel(checkpoint.level, { intro: false, resumeAt: checkpoint });
}

// Move a freshly set-up run forward to a checkpoint's distance. A first
// delivery left mid-tutorial starts over (the lessons run in order).
function resumeFrom(checkpoint) {
  if (!checkpoint.tutorialDone || checkpoint.distance < 1) return beginRun();
  distance = checkpoint.distance;
  player.z = startZ - distance;
  coins = checkpoint.coins;
  hits = checkpoint.hits;
  track.reset(player.z, { powers: level.powers });
  world.reset(player.z);
  setZone(zones.zoneAt(player.z));
  applyAtmosphere(1);
  zoneSpeed = ZONE_PHYSICS[zone].speedFactor;
  sound.playMusic(zone);
  beginRun({ lessons: false });
  hud.banner(`${distance} m`);
}

function startEndless() {
  sound.unlock();
  level = null;
  setupRun(null);
  screens.hide();
  beginRun();
  hud.say(pick(START_LINES));
}

function retry() {
  if (level) startLevel(level.id, { intro: false });
  else startEndless();
}

function beginRun({ lessons = true } = {}) {
  state = 'running';
  checkpointTimer = 0;
  hud.show();
  if (lessons) tutorial.start(level?.tutorial, track);
  if (!chaserActive()) chaser.backOff();
}

// Remember the delivery in progress, so a refresh can resume it.
function saveCheckpoint() {
  if (!level || state !== 'running' || tutorial.waiting) return;
  progress.saveCheckpoint({
    level: level.id,
    distance: Math.floor(distance),
    coins,
    hits,
    tutorialDone: level.tutorial !== 'basics' || !tutorial.step,
  });
}

function pause() {
  if (state !== 'running') return;
  saveCheckpoint();
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
  progress.clearCheckpoint(); // a failed delivery starts again from the beginning
  state = 'dead';
  deathCause = cause;
  deadTime = 0;
  player.dead = true;
  tutorial.stop();
  sound.play({ crash: 'crash', caught: 'whistle', dark: 'powerdown' }[cause], { muffled: inTunnel() });
  sound.play('gameover');
  sound.buzz([60, 40, 140]);
  const quips = { crash: CRASH_LINES[zone], caught: CAUGHT_LINES, dark: DARK_LINES };
  const quip = pick(quips[cause]);
  hud.hide();
  sound.setPaused(true); // music drops back under the score card
  if (level) {
    screens.showFailed({ level, distance: Math.floor(distance), quip });
  } else {
    const best = readBest();
    const final = score();
    if (final > best) writeBest(final);
    screens.showEndlessOver({
      score: final, distance: Math.floor(distance), coins, best: Math.max(best, final), newBest: final > best, quip,
    });
  }
  voice.play(quip);
}

// Reached the drop-off: glide to a stop on the floor, stamp it, then the outro.
function reachDropOff(speed) {
  state = 'arriving';
  arrive = { speed, time: 0 };
  tutorial.stop();
  chaser.backOff();
  powers.reset();
  player.settleToFloor();
  player.pose = { cheer: true };
  hud.hide();
  hud.showStamp(true);
  sound.play('power');
  sound.buzz([30, 60, 30]);
}

function afterArrival() {
  player.lane = player.targetLane;
  hud.showStamp(false);
  const gemTotal = track.coinsSpawned;
  const undamaged = hits === 0;
  const stars = 1 + (coins >= gemTotal * GEMS_FOR_STAR ? 1 : 0) + (undamaged ? 1 : 0);
  progress.complete(level.id, stars);
  const results = () => {
    state = 'results';
    player.pose = { cheer: true };
    sound.setPaused(true);
    if (level.finale) return screens.showTheEnd();
    screens.showDelivered({ level, stars, gems: coins, gemTotal, undamaged, hasNext: level.id < LEVELS.length });
  };
  const beats = level.finale ? endingBeats() : outroBeats(level);
  if (!beats.length) return results();
  state = 'cinematic';
  cinematic.play(beats, { anchor: floorPoint, player, inTunnel, onDone: results });
}

// Through a tunnel mouth: down into a shortcut, or back out onto the road.
function enterZone(next) {
  setZone(next);
  if (chaserActive()) chaser.backOff();
  battery = 1;
  lowBatteryWarned = false;
  const down = next === 'tunnel';
  bursts.spawn(playerPoint(), { color: down ? 0x9a8f80 : 0xffe2b8, count: 120, speed: 10, size: 0.16, life: 1.1 });
  sound.play(down ? 'tunnelIn' : 'tunnelOut');
  sound.playMusic(next);
  sound.buzz(80);
  hud.flash(down ? '#121633' : '#fff1d6');
  hud.banner(down ? 'Shortcut!' : 'Back on the road!');
  hud.hideDispatch();
  hud.say(pick(down ? ENTER_TUNNEL_LINES : ENTER_ROAD_LINES), { delay: 1.5 }); // after the banner
}

// Metres to the next tunnel exit onto the road (Infinity if none is coming).
function distanceToRoad() {
  let i = 0;
  while (zones.boundary(i) >= player.z) i++;
  const gate = zones.boundary(i);
  return Number.isFinite(gate) && zones.zoneAt(gate - 1) === 'road' ? player.z - gate : Infinity;
}

// An obstacle the player failed to clear. Boost and the post-hit grace smash
// through; a shield absorbs one hit; otherwise walls crash and the rest zap.
function handleHit(item) {
  if (powers.has('boost') || player.grace > 0 || powers.has('shield')) {
    track.smash(item);
    const debris = inTunnel() ? 0x9a8f80 : 0xf59e1b;
    bursts.spawn(item.object.position.clone().lerp(playerPoint(), 0.5), { color: debris, count: 30, speed: 8, size: 0.3 });
    sound.play('smash');
    if (powers.has('boost') || player.grace > 0) return;
    powers.end('shield');
    hits++;
    player.grace = HIT_GRACE * 2;
    sound.play('shield');
    sound.buzz(30);
    hud.flash('#3fc1b0');
    hud.say(pick(SHIELD_BREAK_LINES));
    return;
  }
  if (OBSTACLES[item.type].effect === 'crash') return die('crash');
  if (chaserActive() && chaser.dangerous) return die('caught');
  hits++;
  player.stumble();
  if (chaserActive()) chaser.alert();
  bursts.spawn(playerPoint(), { color: 0xffc21a, count: 24, speed: 6, size: 0.15, life: 0.5 });
  sound.play('zap', { muffled: inTunnel() });
  if (chaserActive()) sound.play('whistle');
  sound.buzz(45);
  hud.flash('#d6246e');
  if (chaserActive()) hud.say(pick(HIT_LINES), { who: 'mamu' });
}

function collectPower(type) {
  powers.activate(type);
  if (type === 'boost') chaser.backOff();
  sound.play(type === 'boost' ? 'boost' : 'power');
  sound.buzz(20);
  hud.say(pick(POWER_LINES[type]), { priority: 'low' });
}

function collectCoins(count) {
  if (!count) return;
  coins += count;
  coinStreak = runTime - lastCoinTime < 0.6 ? coinStreak + count : 0;
  lastCoinTime = runTime;
  sound.play('coin', { step: coinStreak });
}

function recharge(batteries) {
  if (!batteries) return;
  battery = Math.min(1, battery + batteries * BATTERY_PER_PICKUP);
  bursts.spawn(playerPoint(), { color: 0x8fff9f, count: 10 * batteries, speed: 3, size: 0.12, life: 0.6 });
  sound.play('charge');
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
// Refreshing or closing the page mid-delivery keeps a checkpoint to resume from.
window.addEventListener('pagehide', () => saveCheckpoint());

const ACTION_SOUNDS = { left: 'lane', right: 'lane', jump: 'jump', slide: 'slide', flip: 'flip' };

new Input((action, source) => {
  sound.unlock();
  if (action === 'mute') return toggleMute();

  if (state === 'cinematic') {
    if (action === 'pause') return cinematic.finish(); // Esc skips
    if (['tap', 'flip', 'confirm'].includes(action)) cinematic.next(); // tap / Space: next line
    return;
  }

  if (state === 'running') {
    if (action === 'pause') return pause();
    if (!tutorial.allow(action, distance)) return;
    if (player.act(action) && ACTION_SOUNDS[action]) sound.play(ACTION_SOUNDS[action], { muffled: inTunnel() });
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

function runFrame(realDt) {
  // The tutorial can slow time right down while it waits for the player.
  const wanted = tutorial.update(realDt, { player, distance, zone });
  timeScale = wanted < timeScale ? timeScale + (wanted - timeScale) * Math.min(1, realDt * 10) : wanted;
  const dt = realDt * timeScale;
  runTime += dt;
  checkpointTimer += realDt;
  if (checkpointTimer > CHECKPOINT_EVERY) {
    checkpointTimer = 0;
    saveCheckpoint();
  }

  for (const ended of powers.update(dt)) {
    if (ended === 'boost') player.grace = Math.max(player.grace, 1); // time to find a safe lane
  }
  const boosting = powers.has('boost');
  player.boosting = boosting;
  player.setShield(powers.has('shield'));

  const prevZ = player.z;
  zoneSpeed += (ZONE_PHYSICS[zone].speedFactor - zoneSpeed) * Math.min(1, dt * 2);
  const difficulty = level
    ? level.difficulty[0] + (level.difficulty[1] - level.difficulty[0]) * Math.min(1, distance / routeLength())
    : Math.min(1, distance / DIFFICULTY_DISTANCE);
  const baseSpeed = level
    ? SPEED_START + difficulty * STORY_SPEED_RANGE
    : Math.min(SPEED_MAX, SPEED_START + distance * SPEED_GAIN);
  const speed = baseSpeed * zoneSpeed * player.speedFactor + (boosting ? BOOST_SPEED : 0);
  player.update(dt, speed);
  distance = startZ - player.z;
  track.update(dt, player.z, difficulty);
  if (chaserActive()) chaser.update(dt, player, 'chase');
  else chaser.object.visible = false;

  const zoneNow = zones.zoneAt(player.z);
  if (zoneNow !== zone) enterZone(zoneNow);
  if (inTunnel() && distanceToRoad() < EXIT_SETTLE) player.settleToFloor(); // ride out on the floor

  const result = track.collide(player, prevZ);
  collectCoins(result.coins);
  recharge(result.batteries);
  if (powers.has('magnet')) {
    const pulled = track.attract(dt, player.z, player.body.getWorldPosition(playerPosition));
    collectCoins(pulled.coins);
    recharge(pulled.batteries);
  }
  if (result.power) collectPower(result.power);
  if (result.hit) handleHit(result.hit);
  if (state !== 'running') return;

  if (level && player.z <= zones.finishZ) return reachDropOff(speed);

  if (inTunnel()) {
    battery = Math.max(0, battery - BATTERY_DRAIN * dt);
    if (battery === 0) return die('dark');
    if (battery < BATTERY_LOW) {
      if (!lowBatteryWarned) hud.say(pick(LOW_BATTERY_LINES), { who: 'riya' });
      lowBatteryWarned = true;
      batteryBeep -= dt;
      if (batteryBeep <= 0) {
        sound.play('lowBattery');
        batteryBeep = 1;
      }
    } else if (battery > 0.5) {
      lowBatteryWarned = false;
    }
  }

  if (distance > nextLineAt && level?.tutorial !== 'basics') {
    hud.say(pick(RUN_LINES[zone]), { priority: 'low' });
    nextLineAt += 600;
  }
  hud.update({
    score: score(),
    coins,
    flipCharge: player.flipCharge,
    powers,
    chaserClose: chaserActive() && chaser.dangerous,
    battery: inTunnel() ? battery : null,
    progress: level ? distance / routeLength() : null,
  });

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
  } else if (state === 'arriving') {
    arrive.time += dt;
    const speed = arrive.speed * Math.max(0, 1 - arrive.time / ARRIVE_TIME);
    player.update(dt, speed);
    if (arrive.time >= ARRIVE_TIME + 0.4) afterArrival();
  } else if (state === 'cinematic') {
    player.update(dt, 0);
    if (chaserActive() && level) chaser.update(dt, player, 'idle');
    cinematic.update(dt);
  } else if (state === 'results' || state === 'loading') {
    player.update(dt, 0);
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
    world.update(dt, player.z);
    if (city) {
      city.update(dt);
      if (player.z < city.endZ) { // ridden out of the old city
        city.dispose();
        city = null;
      }
    }
    bursts.update(dt);
  }
  // 2.5D cutscenes render at full sharpness whatever the game's quality setting.
  if (cinematic.onStage !== stageSharp) {
    stageSharp = cinematic.onStage;
    if (stageSharp) {
      renderer.setPixelRatio(CUTSCENE_PIXEL_RATIO);
      renderer.setSize(window.innerWidth, window.innerHeight);
    } else {
      applyQuality(qualityLevel);
    }
  }
  if (stageSharp) stage.render(renderer);
  else composer.render();
  requestAnimationFrame(frame);
}

// Handy for tuning from the browser console while running `npm run dev`.
// e.g. game.skipToZone() puts the next zone gate 40 m ahead; game.progress.unlockAll().
if (import.meta.env.DEV) {
  window.game = {
    player, track, chaser, powers, zones, voice, sound, settings, progress, cinematic, tutorial, stage,
    collectPower, startLevel, startEndless,
    get state() { return state; },
    get zone() { return zone; },
    get level() { return level; },
    get quality() { return qualityLevel; },
    get timeScale() { return timeScale; },
    get battery() { return battery; },
    set battery(value) { battery = value; },
    get distance() { return distance; },
    skipToZone(ahead = 40) {
      // Rebuild the plan so the next gate is `ahead` metres away, keeping the current zone.
      zones.reset(player.z);
      zones.bounds = zone === 'road' ? [player.z - ahead] : [player.z + 1, player.z - ahead];
      track.reset(player.z);
      world.reset(player.z);
    },
    // Jump to `metres` before the drop-off of the current delivery.
    skipToFinish(metres = 60) {
      const shift = player.z - (zones.finishZ + metres);
      startZ -= shift;
      player.z -= shift;
      const spawned = track.coinsSpawned;
      track.reset(player.z, { powers: false });
      track.coinsSpawned = spawned;
      world.reset(player.z);
    },
  };
}

showMenu();
requestAnimationFrame(frame);
