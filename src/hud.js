import { OXYGEN_LOW } from './config.js';

const $ = (id) => document.getElementById(id);

const POWER_STYLE = {
  magnet: { label: 'MAGNET', color: '#ff4d6d' },
  shield: { label: 'SHIELD', color: '#35e8ff' },
  boost: { label: 'BOOST', color: '#ffd23d' },
};

// Everything drawn over the 3D view during a run. Dispatch lines shown here are
// also spoken by `voice` when a recording exists. Menus live in screens.js.
export class Hud {
  constructor(voice) {
    this.voice = voice;
    this.hud = $('hud');
    this.score = $('score');
    this.coinCount = $('coin-count');
    this.flip = $('flip');
    this.flipFill = $('flip-fill');
    this.dispatch = $('dispatch');
    this.dispatchText = $('dispatch-text');
    this.security = $('security');
    this.flashEl = $('flash');
    this.oxygen = $('oxygen');
    this.oxygenFill = $('oxygen-fill');
    this.bannerEl = $('banner');
    this.hintEl = $('hint');

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
    this.hintEl.classList.add('hidden');
  }

  setZone(zone) {
    this.security.textContent = zone === 'water' ? '⚠ FISH CLOSE' : '⚠ SECURITY CLOSE';
  }

  // oxygen: 0..1 underwater, null in space (bar hidden).
  update(score, coins, flipCharge, powers, securityClose, oxygen) {
    this.oxygen.classList.toggle('hidden', oxygen === null);
    if (oxygen !== null) {
      this.oxygenFill.style.width = `${oxygen * 100}%`;
      this.oxygen.classList.toggle('low', oxygen < OXYGEN_LOW);
    }
    this.score.textContent = score;
    for (const [type, { el, bar }] of Object.entries(this.powerBars)) {
      el.classList.toggle('hidden', !powers.has(type));
      bar.style.width = `${powers.remaining(type) * 100}%`;
    }
    this.security.classList.toggle('hidden', !securityClose);
    this.coinCount.textContent = coins;
    this.flipFill.style.width = `${flipCharge * 100}%`;
    this.flip.classList.toggle('ready', flipCharge >= 1);
  }

  // A coloured pulse round the screen edge: red for a zap, cyan for a shield break.
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

  // A short how-to tip above the flip meter (first run only).
  hint(text) {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hintEl.classList.add('hidden'), 3500);
  }

  // Show a Dispatch line, optionally after `delay` seconds (e.g. once a banner has faded).
  say(text, delay = 0) {
    clearTimeout(this.sayTimer);
    if (delay > 0) {
      this.sayTimer = setTimeout(() => this.say(text), delay * 1000);
      return;
    }
    this.dispatchText.textContent = text;
    this.dispatch.classList.remove('hidden');
    this.voice.play(text);
    clearTimeout(this.dispatchTimer);
    this.dispatchTimer = setTimeout(() => this.hideDispatch(), Math.max(4000, text.length * 70));
  }

  hideDispatch() {
    clearTimeout(this.sayTimer);
    clearTimeout(this.dispatchTimer);
    this.dispatch.classList.add('hidden');
  }
}
