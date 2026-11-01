import { BATTERY_LOW } from './config.js';
import { CHARACTERS } from './story.js';

const $ = (id) => document.getElementById(id);

const POWER_STYLE = {
  magnet: { label: 'MAGNET', color: '#d6246e' },
  shield: { label: 'SHIELD', color: '#0e6b68' },
  boost: { label: 'BOOST', color: '#f59e1b' },
};

// Everything drawn over the 3D view during a run. Radio lines shown here are
// also spoken by `voice` when a recording exists. Menus live in screens.js.
export class Hud {
  constructor(voice) {
    this.voice = voice;
    this.hud = $('hud');
    this.score = $('score');
    this.coinCount = $('coin-count');
    this.flip = $('flip');
    this.flipFill = $('flip-fill');
    this.radio = $('dispatch');
    this.radioFace = $('dispatch-face');
    this.radioFace.addEventListener('error', () => { this.radioFace.src = '/art/emblem.webp'; }); // portrait not painted yet
    this.radioName = $('dispatch-name');
    this.radioText = $('dispatch-text');
    this.security = $('security');
    this.flashEl = $('flash');
    this.battery = $('battery');
    this.batteryFill = $('battery-fill');
    this.bannerEl = $('banner');
    this.route = $('route');
    this.routeTrack = $('route-track');
    this.routeMarker = $('route-marker');
    this.stamp = $('stamp');

    this.powerBars = {};
    for (const [type, { label, color }] of Object.entries(POWER_STYLE)) {
      const el = document.createElement('div');
      el.className = 'power hidden';
      el.style.setProperty('--c', color);
      el.innerHTML = `<i></i><img src="/art/icon-${type}.webp" alt=""><span>${label}</span>`;
      $('powers').append(el);
      this.powerBars[type] = { el, bar: el.querySelector('i') };
    }
  }

  show() { this.hud.classList.remove('hidden'); }

  hide() {
    this.hud.classList.add('hidden');
    this.hideDispatch();
  }

  // Story deliveries show the route (zone stripes) with the parcel moving along it.
  setRoute(route) {
    this.route.classList.toggle('hidden', !route);
    if (!route) return;
    const total = route.reduce((sum, [, metres]) => sum + metres, 0);
    this.routeTrack.innerHTML = route
      .map(([zone, metres]) => `<span class="${zone}" style="width:${(metres / total) * 100}%"></span>`)
      .join('');
  }

  // progress: 0..1 along the route (story), or null in endless.
  // battery: the phone torch, 0..1 in a tunnel, null on the road (meter hidden).
  update({ score, coins, flipCharge, powers, chaserClose, battery, progress }) {
    this.battery.classList.toggle('hidden', battery === null);
    if (battery !== null) {
      this.batteryFill.style.width = `${battery * 100}%`;
      this.battery.classList.toggle('low', battery < BATTERY_LOW);
    }
    this.flip.classList.toggle('hidden', battery === null); // flips only work in tunnels
    if (progress !== null) this.routeMarker.style.left = `${Math.min(1, progress) * 100}%`;
    this.score.textContent = score;
    for (const [type, { el, bar }] of Object.entries(this.powerBars)) {
      el.classList.toggle('hidden', !powers.has(type));
      bar.style.width = `${powers.remaining(type) * 100}%`;
    }
    this.security.classList.toggle('hidden', !chaserClose);
    this.coinCount.textContent = coins;
    this.flipFill.style.width = `${flipCharge * 100}%`;
    this.flip.classList.toggle('ready', flipCharge >= 1);
  }

  // A coloured pulse round the screen edge: rani for a zap, teal for a shield break.
  flash(color) {
    this.flashEl.style.setProperty('--flash', color);
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth; // restart the animation
    this.flashEl.classList.add('on');
  }

  // Big centred title, e.g. when entering a new zone.
  banner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('on');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('on');
  }

  showStamp(visible) {
    this.stamp.classList.toggle('hidden', !visible);
  }

  // Show a radio line from `who` (default Dispatch), optionally after `delay`
  // seconds. Low-priority chatter is shown but not voiced over a line already playing.
  say(text, { delay = 0, who = 'dispatch', priority = 'high' } = {}) {
    clearTimeout(this.sayTimer);
    if (delay > 0) {
      this.sayTimer = setTimeout(() => this.say(text, { who, priority }), delay * 1000);
      return;
    }
    const speaker = CHARACTERS[who];
    this.radioFace.src = speaker.portrait;
    this.radioName.textContent = speaker.name;
    this.radioText.textContent = text;
    this.radio.classList.remove('hidden');
    this.voice.play(text, { priority });
    clearTimeout(this.radioTimer);
    this.radioTimer = setTimeout(() => this.hideDispatch(), Math.max(4000, text.length * 70));
  }

  hideDispatch() {
    clearTimeout(this.sayTimer);
    clearTimeout(this.radioTimer);
    this.radio.classList.add('hidden');
  }
}
