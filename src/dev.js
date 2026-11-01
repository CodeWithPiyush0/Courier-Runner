// Dev mode: open the game with ?dev=1 (always on under `npm run dev`) to test
// the whole thing without dying or replaying. A small panel at the top lets
// you turn invincibility on/off, jump to the next zone or the drop-off, start
// any delivery (with its intro) or the ending, skip a cutscene and speed time
// up. It never changes saved progress.

export const DEV = import.meta.env.DEV || new URLSearchParams(window.location.search).get('dev') === '1';

export const dev = { invincible: DEV, speed: 1 };

// api: { levels, startLevel(id, opts), startEndless(), skipToZone(), skipToFinish(), skipCutscene(), state() }
export function devPanel(api) {
  const style = document.createElement('style');
  style.textContent = `
    #dev { position: fixed; top: calc(6px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
      z-index: 50; font: 700 12px/1.2 system-ui, sans-serif; color: #fff; pointer-events: auto; text-align: center; }
    #dev > button { padding: 4px 10px; border: 2px solid #ffc21a; border-radius: 999px; background: #121633; color: #ffc21a; font: inherit; cursor: pointer; }
    #dev .panel { display: none; margin-top: 6px; padding: 8px; max-width: min(92vw, 520px); border-radius: 12px;
      background: rgba(18, 22, 51, 0.92); border: 2px solid #ffc21a; flex-wrap: wrap; gap: 6px; justify-content: center; }
    #dev.open .panel { display: flex; }
    #dev .panel button { padding: 6px 9px; border: 0; border-radius: 8px; background: #2a3070; color: #fff; font: inherit; cursor: pointer; }
    #dev .panel button.on { background: #0e6b68; }
    #dev .state { width: 100%; opacity: 0.75; }`;
  document.head.append(style);

  const root = document.createElement('div');
  root.id = 'dev';
  root.innerHTML = '<button type="button">DEV ▾</button><div class="panel"></div>';
  document.body.append(root);
  const panel = root.querySelector('.panel');
  root.firstElementChild.addEventListener('click', (e) => {
    root.classList.toggle('open');
    e.currentTarget.blur();
  });

  const button = (label, action, isOn) => {
    const b = document.createElement('button');
    b.type = 'button';
    const refresh = () => {
      b.textContent = typeof label === 'function' ? label() : label;
      if (isOn) b.classList.toggle('on', isOn());
    };
    b.addEventListener('click', () => {
      action();
      refresh();
      b.blur(); // keep Space / arrows for the game
    });
    refresh();
    panel.append(b);
  };

  button(() => `Invincible: ${dev.invincible ? 'ON' : 'off'}`, () => { dev.invincible = !dev.invincible; }, () => dev.invincible);
  button(() => `Speed ×${dev.speed}`, () => { dev.speed = { 1: 2, 2: 4, 4: 1 }[dev.speed]; }, () => dev.speed > 1);
  button('Next zone', api.skipToZone);
  button('Finish delivery', api.skipToFinish);
  button('Skip cutscene', api.skipCutscene);
  for (let id = 1; id <= api.levels; id++) button(`Delivery ${id}`, () => api.startLevel(id));
  button('Ending', () => api.startLevel(api.levels, { intro: false, thenFinish: true }));
  button('Endless', api.startEndless);

  const state = document.createElement('div');
  state.className = 'state';
  panel.append(state);
  setInterval(() => { state.textContent = api.state(); }, 250);
}
