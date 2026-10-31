const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump',
  ArrowDown: 'slide', KeyS: 'slide',
  Space: 'flip',
  Enter: 'confirm',
  Escape: 'pause', KeyP: 'pause',
  KeyM: 'mute',
};

const SWIPE_DISTANCE = 30; // px
const TAP_DISTANCE = 15;
const DOUBLE_TAP_MS = 300;
const UI = 'button, input, select, label, .card'; // touches here belong to the page, not the game

// Turns keyboard and touch input into game actions —
// left, right, jump, slide, flip, confirm, pause, mute, tap — and reports
// whether each came from a 'key' or a 'touch'.
export class Input {
  constructor(onAction) {
    window.addEventListener('keydown', (e) => {
      const action = KEYS[e.code];
      if (!action || e.repeat) return;
      if (e.target.closest?.('input, select') && action !== 'pause') return; // let sliders use arrow keys
      e.preventDefault();
      onAction(action, 'key');
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault()); // no long-press menu on phones

    let start = null;
    let lastTap = 0;

    window.addEventListener('touchstart', (e) => {
      start = null;
      if (e.target.closest?.(UI)) return;
      const t = e.changedTouches[0];
      start = { x: t.clientX, y: t.clientY, swiped: false };
    }, { passive: true });

    // Fire the swipe as soon as the finger has moved far enough, not on release.
    window.addEventListener('touchmove', (e) => {
      if (!start) return; // a UI touch: let it scroll / drag normally
      e.preventDefault();
      if (start.swiped) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.hypot(dx, dy) < SWIPE_DISTANCE) return;
      start.swiped = true;
      if (Math.abs(dx) > Math.abs(dy)) onAction(dx > 0 ? 'right' : 'left', 'touch');
      else onAction(dy < 0 ? 'jump' : 'slide', 'touch');
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (!start || start.swiped) { start = null; return; }
      const t = e.changedTouches[0];
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) < TAP_DISTANCE) {
        const now = performance.now();
        if (now - lastTap < DOUBLE_TAP_MS) { onAction('flip', 'touch'); lastTap = 0; }
        else { onAction('tap', 'touch'); lastTap = now; }
      }
      start = null;
    });
  }
}
