/* Monopolyish — keyboard shortcuts, the sound toggle and the help card.
 *
 * The game was entirely mouse-driven: no key did anything, including Escape.
 * Everything here drives the same buttons the pointer does, so there is one
 * set of rules about what is allowed and it lives in the game, not here.
 */
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  /* Typing in a text box is not a shortcut. */
  function typing(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           target.isContentEditable === true;
  }

  function press(id) {
    const button = el(id);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }

  function modalOpen() {
    const overlay = el('modal-overlay');
    return !!(overlay && overlay.classList.contains('active'));
  }

  const SHORTCUTS = [
    ['R', 'Roll the dice'],
    ['E', 'End your turn'],
    ['B', 'Manage property — build, sell, mortgage'],
    ['T', 'Open a trade'],
    ['M', 'Mute or unmute'],
    ['L', 'Jump to the game log'],
    ['?', 'This list'],
    ['Esc', 'Close whatever is open']
  ];

  function showShortcuts() {
    const game = window._game || (typeof MP !== 'undefined' && MP.mirror);
    if (!game || !game.ui) return;
    const rows = SHORTCUTS
      .map(([key, what]) => `<div class="ref-item"><span><kbd>${key}</kbd></span><span>${what}</span></div>`)
      .join('');
    game.ui.showModal(`
      <div class="shortcuts-modal">
        <h2>⌨️ Keyboard</h2>
        <div class="quick-ref">${rows}</div>
        <div class="deed-actions">
          <button class="btn btn-secondary" id="shortcuts-close">Close</button>
        </div>
      </div>`);
    el('shortcuts-close')?.addEventListener('click', () => game.ui.closeModal());
  }

  function paintSoundButton() {
    const button = el('btn-sound');
    if (!button) return;
    button.textContent = SFX.muted ? '🔇' : '🔊';
    button.setAttribute('aria-pressed', SFX.muted ? 'true' : 'false');
    button.title = SFX.muted ? 'Sound off' : 'Sound on';
  }

  document.addEventListener('DOMContentLoaded', function () {
    paintSoundButton();
    el('btn-sound')?.addEventListener('click', function () {
      SFX.toggle();
      paintSoundButton();
      if (!SFX.muted) SFX.play('build');
    });
    el('btn-help')?.addEventListener('click', showShortcuts);
  });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e.target)) {
      // Escape still gets you out of the chat box.
      if (e.key === 'Escape' && e.target.blur) e.target.blur();
      return;
    }

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (key === 'Escape') {
      /* Only modals that are safe to walk away from. A question the game is
         waiting on — buy or auction, a bid, a jail choice, a card, a debt —
         says so itself, because guessing from what the modal looks like got
         the buy prompt wrong: dismissing it left the turn with nothing to
         resolve it, and the game could not be played on. */
      const game = window._game || (typeof MP !== 'undefined' && MP.mirror);
      const dismissible = game && game.ui && !game.ui.blocking && !game.ui.sticky;
      if (modalOpen() && dismissible) {
        e.preventDefault();
        game.ui.closeModal();
      }
      return;
    }

    if (modalOpen()) return;    // the modal owns the keyboard while it is up

    switch (key) {
      case 'r': if (press('btn-roll')) e.preventDefault(); break;
      case 'e': if (press('btn-end-turn')) e.preventDefault(); break;
      case 'b': if (press('btn-build')) e.preventDefault(); break;
      case 't': if (press('btn-trade')) e.preventDefault(); break;
      case 'm':
        SFX.toggle();
        paintSoundButton();
        e.preventDefault();
        break;
      case 'l': {
        const log = el('game-log');
        if (log && log.focus) { log.setAttribute('tabindex', '-1'); log.focus(); }
        break;
      }
      case '?':
      case '/':
        showShortcuts();
        e.preventDefault();
        break;
      default:
        break;
    }
  });
})();
