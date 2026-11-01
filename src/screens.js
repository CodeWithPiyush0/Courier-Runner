import { settings } from './settings.js';
import { LEVELS } from './story.js';
import { progress } from './progress.js';

const TOUCH = window.matchMedia('(pointer: coarse)').matches;

const HOW_TO = `
  <table>
    <tr><td>${TOUCH ? 'Swipe ← →' : '← → / A D'}</td><td>change lane</td></tr>
    <tr><td>${TOUCH ? 'Swipe up' : '↑ / W'}</td><td>jump</td></tr>
    <tr><td>${TOUCH ? 'Swipe down' : '↓ / S'}</td><td>slide (in the air: slam down)</td></tr>
    <tr><td>${TOUCH ? 'Double tap' : 'Space'}</td><td>in a tunnel: flip to the ceiling</td></tr>
    ${TOUCH ? '' : '<tr><td>P / Esc</td><td>pause</td></tr><tr><td>M</td><td>mute</td></tr>'}
  </table>
  <ul class="rules">
    <li><b>Deliver the parcel</b>: reach the delivery point at the end of each route.</li>
    <li><b>Autos, cows and barricades</b> crash you. Clip a <b>pothole, speed breaker or barrier</b> and
      traffic Mamu closes in; do it twice quickly and he catches you.</li>
    <li><b>Shortcuts</b>: when the road jams, ride the nala. In there you can ride the walls and flip to the
      ceiling, but keep your <b>phone torch</b> charged with batteries.</li>
    <li><b>Power-ups</b>: UPI magnet pulls in tips, helmet takes one hit, cutting chai smashes through everything.</li>
    <li><b>Stars</b>: deliver, collect most of the tips, and don't break any rules.</li>
  </ul>`;

const percent = (name) => Math.round(settings.get(name) * 100);
const starRow = (n, total = 3) =>
  `<span class="stars">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'on' : 'off'}">★</span>`).join('')}</span>`;

// The full-screen cards. `actions` are the game's callbacks:
// play(levelId), endless(), resume() (a paused run, or a saved checkpoint), retry(), menu().
export class Screens {
  constructor(sound, actions) {
    this.overlay = document.getElementById('overlay');
    this.sound = sound;
    this.actions = actions;
    this.primary = null; // what Space / Enter does on the current screen
    this.back = null; // what Esc does
  }

  // Render a card; elements with data-action="name" call handlers[name].
  render(html, handlers, { primary = null, back = null, title = false } = {}) {
    this.overlay.className = title ? 'title' : '';
    this.overlay.innerHTML = `<div class="card">${html}</div>`;
    this.primary = primary && handlers[primary];
    this.back = back && handlers[back];
    for (const el of this.overlay.querySelectorAll('[data-action]')) {
      el.addEventListener('click', () => {
        if (el.disabled || el.classList.contains('locked')) return;
        this.sound.unlock();
        this.sound.play('click');
        handlers[el.dataset.action](el.dataset.arg);
      });
    }
  }

  hide() {
    this.overlay.innerHTML = '';
    this.primary = null;
    this.back = null;
    document.body.classList.remove('menu');
  }

  showTitle() {
    document.body.classList.add('menu');
    const reopen = () => this.showTitle();
    const checkpoint = progress.checkpoint;
    const level = LEVELS[(checkpoint?.level ?? progress.current) - 1];
    // The main button: resume a delivery left half-way, continue the story, or start it.
    const main = checkpoint
      ? `<button class="primary" data-action="resume">Resume · ${level.title} · ${checkpoint.distance} m</button>
         <button data-action="play" data-arg="${level.id}">Restart this delivery</button>`
      : `<button class="primary" data-action="play" data-arg="${level.id}">
           ${progress.started ? 'Continue' : 'Start'} · ${level.title}</button>`;
    this.render(`
      <img class="emblem" src="/art/emblem.webp" alt="">
      <h1>Patna Rush</h1>
      <p class="tagline">Riya has one parcel to deliver: Nani's old radio, from Patna to Muzaffarpur, before her
        birthday ends. And a traffic police Mamu is on her tail.</p>
      <div class="buttons">
        ${main}
        <button data-action="route">Delivery route</button>
        <button data-action="endless" ${progress.endlessUnlocked ? '' : 'disabled'}>
          ${progress.endlessUnlocked ? 'Endless mode' : '🔒 Endless · finish the story'}</button>
        <div class="buttons row">
          <button class="ghost" data-action="howto">How to play</button>
          <button class="ghost" data-action="settings">Settings</button>
        </div>
        ${progress.started ? '<button class="ghost" data-action="newgame">Start over (new game)</button>' : ''}
      </div>`, {
      resume: this.actions.resume,
      play: (id) => this.actions.play(Number(id)),
      route: () => this.showRoute(reopen),
      endless: this.actions.endless,
      howto: () => this.showHowTo(reopen),
      settings: () => this.showSettings(reopen),
      newgame: () => this.showConfirm({
        title: 'Start over?',
        text: 'This erases your stars, unlocked deliveries and saved progress.',
        yes: 'Yes, start over',
        onYes: () => { progress.reset(); this.showTitle(); },
        onNo: reopen,
      }),
    }, { primary: checkpoint ? 'resume' : 'play', title: true });
  }

  showConfirm({ title, text, yes, onYes, onNo }) {
    this.render(`
      <h2>${title}</h2>
      <p class="tagline">${text}</p>
      <div class="buttons">
        <button class="primary" data-action="no">Keep my progress</button>
        <button data-action="yes">${yes}</button>
      </div>`, { yes: onYes, no: onNo }, { primary: 'no', back: 'no' });
  }

  showRoute(back) {
    document.body.classList.add('menu');
    const stops = LEVELS.map((level) => {
      const locked = level.id > progress.unlocked;
      return `
        <li class="stop ${locked ? 'locked' : ''}" data-action="play" data-arg="${level.id}">
          <span class="num">${locked ? '·' : level.id}</span>
          <span><b>${level.title}</b><small>${level.place}</small></span>
          ${locked ? '<small>🔒</small>' : starRow(progress.stars(level.id))}
        </li>`;
    }).join('');
    const endless = `
      <li class="stop endless ${progress.endlessUnlocked ? '' : 'locked'}" data-action="endless">
        <span class="num">∞</span>
        <span><b>Endless</b><small>${progress.endlessUnlocked ? 'How far can Riya go?' : 'Finish the story to unlock'}</small></span>
      </li>`;
    this.render(`
      <h2>Delivery Route</h2>
      <p class="sub">Patna → Muzaffarpur</p>
      <ul class="route-list">${stops}${endless}</ul>
      <div class="buttons"><button class="ghost" data-action="back">Back</button></div>`, {
      play: (id) => this.actions.play(Number(id)),
      endless: this.actions.endless,
      back,
    }, { back: 'back' });
  }

  showHowTo(back) {
    this.render(`
      <h2>Swipe OK Please</h2>
      ${HOW_TO}
      <div class="buttons"><button class="primary" data-action="back">Got it</button></div>`,
    { back }, { primary: 'back', back: 'back' });
  }

  showSettings(back) {
    const slider = (name, label) => `
      <label class="setting"><span>${label}</span>
        <input type="range" min="0" max="100" value="${percent(name)}" data-setting="${name}"></label>`;
    const option = (value, label) =>
      `<option value="${value}" ${settings.get('quality') === value ? 'selected' : ''}>${label}</option>`;
    this.render(`
      <h2>Settings</h2>
      ${slider('music', 'Music')}
      ${slider('sfx', 'Effects')}
      ${slider('voice', 'Voices')}
      ${navigator.vibrate ? `<label class="setting"><span>Vibration</span>
        <input type="checkbox" data-setting="haptics" ${settings.get('haptics') ? 'checked' : ''}></label>` : ''}
      <label class="setting"><span>Graphics</span>
        <select data-setting="quality">
          ${option('auto', 'Auto')}${option('high', 'High')}${option('low', 'Low (faster)')}
        </select></label>
      <div class="buttons"><button class="primary" data-action="back">Done</button></div>`,
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

  // While a delivery's cutscene pictures and voices load.
  showLoading(level) {
    this.render(`
      <p class="sub">Delivery ${level.id}</p>
      <h2>${level.title}</h2>
      <div class="loader"><i></i><i></i><i></i></div>
      <p class="hint">Packing the parcel…</p>`, {});
  }

  showPause() {
    const reopen = () => this.showPause();
    this.render(`
      <h2>Chai Break</h2>
      <div class="buttons">
        <button class="primary" data-action="resume">Resume</button>
        <button data-action="retry">Restart</button>
        <button data-action="settings">Settings</button>
        <button class="ghost" data-action="menu">Main menu</button>
      </div>`, {
      resume: this.actions.resume,
      retry: this.actions.retry,
      settings: () => this.showSettings(reopen),
      menu: this.actions.menu,
    }, { primary: 'resume', back: 'resume' });
  }

  // After a delivery: stars and why.
  showDelivered({ level, stars, gems, gemTotal, undamaged, hasNext }) {
    const line = (ok, text) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${text}</li>`;
    this.render(`
      <p class="sub">Delivery ${level.id} · ${level.place}</p>
      <h2>${level.title}</h2>
      <div class="result-stars">${starRow(stars)}</div>
      <ul class="result-lines">
        ${line(true, 'Parcel delivered')}
        ${line(gems >= gemTotal * 0.6, `Tips collected: ₹${gems * 10} of ₹${gemTotal * 10}`)}
        ${line(undamaged, undamaged ? 'No rules broken' : 'Mamu saw you break a rule')}
      </ul>
      <div class="buttons">
        ${hasNext ? '<button class="primary" data-action="next">Next delivery</button>' : ''}
        <div class="buttons row">
          <button data-action="retry">Replay</button>
          <button data-action="route">Route</button>
        </div>
      </div>`, {
      next: () => this.actions.play(level.id + 1),
      retry: this.actions.retry,
      route: () => this.showRoute(() => this.actions.menu()),
    }, { primary: hasNext ? 'next' : 'retry', back: 'route' });
  }

  showFailed({ level, distance, quip }) {
    this.render(`
      <p class="sub">Delivery ${level.id} · ${level.title}</p>
      <h2>Delivery Failed</h2>
      <p class="sub">${distance} m of the route</p>
      <div class="quip"><img class="avatar" src="/art/dispatch.webp" alt=""><span>${quip}</span></div>
      <div class="buttons">
        <button class="primary" data-action="retry">Try again</button>
        <button class="ghost" data-action="route">Route</button>
      </div>`, {
      retry: this.actions.retry,
      route: () => this.showRoute(() => this.actions.menu()),
    }, { primary: 'retry', back: 'route' });
  }

  showEndlessOver({ score, distance, coins, best, newBest, quip }) {
    this.render(`
      <p class="sub">${newBest ? 'New best!' : 'Endless run'}</p>
      <div class="big">${score}</div>
      <p class="sub">${distance} m · <img class="inline-icon" src="/art/icon-coin.webp" alt="gems"> ${coins} · best ${best}</p>
      <div class="quip"><img class="avatar" src="/art/dispatch.webp" alt=""><span>${quip}</span></div>
      <div class="buttons">
        <button class="primary" data-action="retry">Run again</button>
        <button class="ghost" data-action="menu">Main menu</button>
      </div>`, {
      retry: this.actions.retry,
      menu: this.actions.menu,
    }, { primary: 'retry', back: 'menu' });
  }

  showTheEnd() {
    this.render(`
      <img class="emblem" src="/art/portrait-nani.webp" alt="" style="border-radius:50%">
      <h1>The End</h1>
      <p class="tagline">Nani's radio is home and playing, Mamu cancelled the challan, and everyone is eating
        Shahi litchi. Riya got her five stars.</p>
      <p class="sub">Endless mode unlocked</p>
      <div class="buttons">
        <button class="primary" data-action="endless">Play Endless</button>
        <button class="ghost" data-action="menu">Main menu</button>
      </div>`, {
      endless: this.actions.endless,
      menu: this.actions.menu,
    }, { primary: 'endless', back: 'menu' });
  }
}
