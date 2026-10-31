import { settings } from './settings.js';

const TOUCH = window.matchMedia('(pointer: coarse)').matches;

const HOW_TO = `
  <table>
    <tr><td>${TOUCH ? 'swipe ← →' : '← → / A D'}</td><td>change lane</td></tr>
    <tr><td>${TOUCH ? 'swipe up' : '↑ / W'}</td><td>jump</td></tr>
    <tr><td>${TOUCH ? 'swipe down' : '↓ / S'}</td><td>slide (in the air: slam down)</td></tr>
    <tr><td>${TOUCH ? 'double tap' : 'Space'}</td><td>gravity flip to the far wall</td></tr>
    ${TOUCH ? '' : '<tr><td>P / Esc</td><td>pause</td></tr><tr><td>M</td><td>mute</td></tr>'}
  </table>
  <ul class="rules">
    <li><b>Crates and coral</b> crash you.</li>
    <li><b>Lasers, urchins and jellyfish</b> zap you and bring the chaser close. Get zapped again while it's
      close and you're caught.</li>
    <li><b>Underwater</b>, grab bubbles or run out of air.</li>
    <li><b>Power-ups:</b> magnet pulls in coins, shield takes one hit, boost smashes through everything.</li>
  </ul>`;

const percent = (name) => Math.round(settings.get(name) * 100);

// The full-screen cards: main menu, how to play, settings, pause, game over.
// `actions` are the game's callbacks: play, resume, restart, menu.
export class Screens {
  constructor(sound, actions) {
    this.overlay = document.getElementById('overlay');
    this.sound = sound;
    this.actions = actions;
    this.primary = null; // what Space / Enter does on the current screen
    this.back = null; // what Esc does
  }

  // Render a card; buttons with data-action="name" call handlers[name].
  render(html, handlers, { primary = null, back = null } = {}) {
    this.overlay.innerHTML = `<div class="card">${html}</div>`;
    this.primary = primary && handlers[primary];
    this.back = back && handlers[back];
    for (const button of this.overlay.querySelectorAll('[data-action]')) {
      button.addEventListener('click', () => {
        this.sound.unlock();
        this.sound.play('click');
        handlers[button.dataset.action]();
      });
    }
  }

  hide() {
    this.overlay.innerHTML = '';
    this.primary = null;
    this.back = null;
    document.body.classList.remove('menu');
  }

  showMenu(best) {
    document.body.classList.add('menu');
    const reopen = () => this.showMenu(best);
    this.render(`
      <img class="emblem" src="/art/emblem.webp" alt="">
      <h1>COURIER RUNNER</h1>
      <p class="sub">PROTOTYPE${best ? ` · BEST ${best}` : ''}</p>
      <div class="buttons">
        <button class="primary" data-action="play">PLAY</button>
        <button data-action="howto">HOW TO PLAY</button>
        <button data-action="settings">SETTINGS</button>
      </div>
      <p class="hint">${TOUCH ? '' : 'Space / Enter to play'}</p>`, {
      play: this.actions.play,
      howto: () => this.showHowTo(reopen),
      settings: () => this.showSettings(reopen),
    }, { primary: 'play' });
  }

  showHowTo(back) {
    this.render(`
      <h2>HOW TO PLAY</h2>
      ${HOW_TO}
      <div class="buttons"><button class="primary" data-action="back">BACK</button></div>`,
    { back }, { primary: 'back', back: 'back' });
  }

  showSettings(back) {
    const slider = (name, label) => `
      <label class="setting"><span>${label}</span>
        <input type="range" min="0" max="100" value="${percent(name)}" data-setting="${name}"></label>`;
    const option = (value, label) =>
      `<option value="${value}" ${settings.get('quality') === value ? 'selected' : ''}>${label}</option>`;
    this.render(`
      <h2>SETTINGS</h2>
      ${slider('music', 'Music')}
      ${slider('sfx', 'Effects')}
      ${slider('voice', 'Dispatch voice')}
      ${navigator.vibrate ? `<label class="setting"><span>Vibration</span>
        <input type="checkbox" data-setting="haptics" ${settings.get('haptics') ? 'checked' : ''}></label>` : ''}
      <label class="setting"><span>Graphics</span>
        <select data-setting="quality">
          ${option('auto', 'Auto')}${option('high', 'High')}${option('low', 'Low (faster)')}
        </select></label>
      <div class="buttons"><button class="primary" data-action="back">BACK</button></div>`,
    { back }, { primary: 'back', back: 'back' });

    for (const input of this.overlay.querySelectorAll('[data-setting]')) {
      const name = input.dataset.setting;
      input.addEventListener('input', () => {
        if (input.type === 'range') settings.set(name, input.value / 100);
        else if (input.type === 'checkbox') settings.set(name, input.checked);
        else settings.set(name, input.value);
      });
      input.addEventListener('change', () => {
        this.sound.unlock();
        if (name === 'sfx') this.sound.play('coin');
        if (name === 'haptics' && input.checked) this.sound.buzz(40);
      });
    }
  }

  showPause() {
    const reopen = () => this.showPause();
    this.render(`
      <h2>PAUSED</h2>
      <div class="buttons">
        <button class="primary" data-action="resume">RESUME</button>
        <button data-action="restart">RESTART</button>
        <button data-action="settings">SETTINGS</button>
        <button data-action="menu">MAIN MENU</button>
      </div>`, {
      resume: this.actions.resume,
      restart: this.actions.restart,
      settings: () => this.showSettings(reopen),
      menu: this.actions.menu,
    }, { primary: 'resume', back: 'resume' });
  }

  showGameOver({ score, distance, coins, best, newBest, quip }) {
    this.render(`
      <p class="sub">${newBest ? 'NEW BEST!' : 'DELIVERY FAILED'}</p>
      <div class="big">${score}</div>
      <p class="sub">${distance} m · <img class="inline-icon" src="/art/icon-coin.webp" alt="coins"> ${coins} · best ${best}</p>
      <div class="quip"><img class="avatar" src="/art/dispatch.webp" alt=""><span>${quip}</span></div>
      <div class="buttons">
        <button class="primary" data-action="retry">RETRY</button>
        <button data-action="menu">MAIN MENU</button>
      </div>`, {
      retry: this.actions.restart,
      menu: this.actions.menu,
    }, { primary: 'retry', back: 'menu' });
  }
}
