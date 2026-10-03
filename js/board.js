/* Monopolyish — Drawing the board and its squares. */

// === board.js ===
// ============================================================
//  BOARD RENDERER — v3 (fixed text direction, centering, tiles)
// ============================================================

// On a phone the board is drawn at screen width, which leaves its labels too
// small to read. The zoom button scales it up inside a frame you can scroll.
(function setupBoardZoom() {
  const btn = document.getElementById('btn-board-zoom');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const on = document.getElementById('board-container').classList.toggle('zoomed');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '↙ Fit board' : '🔍 Zoom board';
  });
})();

function spaceIcon(space) {
  switch (space.type) {
    case 'go':
      return `<div class="space-icon go-icon"><span class="go-label">GO</span><span class="go-arrow">⬆</span><span class="go-sub">COLLECT $200</span></div>`;
    case 'jail':
      return `<div class="space-icon jail-icon-inner"><div class="jail-visiting">JUST<br>VISITING</div><div class="jail-cell">🔒<br><span>IN JAIL</span></div></div>`;
    case 'freeparking':
      return `<div class="space-icon fp-icon"><span class="fp-emoji">🅿️</span><span>FREE<br>PARKING</span></div>`;
    case 'gotojail':
      return `<div class="space-icon gtj-icon"><span class="gtj-emoji">👮</span><span>GO TO<br>JAIL</span></div>`;
    case 'chance':
      return `<div class="space-icon chance-card"><span class="card-sym">?</span><span class="card-label">CHANCE</span></div>`;
    case 'community':
      return `<div class="space-icon cc-card"><span class="card-sym">🏛️</span><span class="card-label">COMMUNITY<br>CHEST</span></div>`;
    case 'tax':
      return `<div class="space-icon tax-icon-inner"><span class="tax-emoji">💰</span><span class="tax-name">${space.name}</span><span class="tax-amt">$${space.amount}</span></div>`;
    case 'railroad':
      return `<div class="space-icon rr-icon-inner"><span class="rr-emoji">🚂</span><span class="rr-name">${space.name}</span><span class="rr-price">$${space.price}</span></div>`;
    case 'utility':
      return `<div class="space-icon util-icon-inner"><span class="util-emoji">${space.id === 12 ? '💡' : '🚿'}</span><span class="util-name">${space.name}</span><span class="util-price">$${space.price}</span></div>`;
    default:
      return '';
  }
}

function buildSpace(space, side) {
  const isCorner = space.corner;
  const grp = space.group ? COLOR_GROUPS[space.group] : null;

  let innerContent = '';
  if (space.type === 'property') {
    innerContent = `
      <div class="space-content">
        <div class="color-bar" style="background:${grp ? grp.color : '#555'}"></div>
        <div class="prop-body">
          <div class="space-name">${space.name}</div>
          <div class="houses"></div>
          <div class="space-price">$${space.price}</div>
        </div>
      </div>`;
  } else if (isCorner) {
    innerContent = `
      <div class="corner-content">
        ${spaceIcon(space)}
      </div>`;
  } else {
    innerContent = `
      <div class="space-content">
        ${spaceIcon(space)}
      </div>`;
  }

  return `<div class="board-space type-${space.type} ${isCorner ? 'corner' : ''} side-${side}"
               data-space="${space.id}"
               data-type="${space.type}"
               ${space.group ? `data-group="${space.group}"` : ''}
               title="${space.name}"
               tabindex="-1" aria-label="${space.name}${space.price ? ', $' + space.price : ''}">
      ${innerContent}
      <div class="token-container"></div>
    </div>`;
}

function renderBoard(container) {
  // Redrawing replaces the squares, so remember which one had keyboard focus.
  const hadFocus = container.contains(document.activeElement);
  container.innerHTML = '';

  // Compute grid positions for all 40 spaces
  // Bottom row: GO(0) at col 10, ..., Jail(10) at col 0 → row 10
  // Left col: spaces 11-19, rows 9→1 → col 0
  // Top row: FreeParking(20) at col 0, ..., GoToJail(30) at col 10 → row 0
  // Right col: spaces 31-39, rows 1→9 → col 10

  const placements = [];

  // Bottom row (row 10): space 0=GO at col 10, space 10=Jail at col 0
  for (let i = 0; i <= 10; i++) {
    placements.push({ space: BOARD_SPACES[i], row: 10, col: 10 - i, side: 'bottom' });
  }
  // Left col: spaces 11-19, row = 10-(i-10) = 20-i
  for (let i = 11; i <= 19; i++) {
    placements.push({ space: BOARD_SPACES[i], row: 20 - i, col: 0, side: 'left' });
  }
  // Top row (row 0): space 20=FP at col 0, space 30=GTJ at col 10
  for (let i = 20; i <= 30; i++) {
    placements.push({ space: BOARD_SPACES[i], row: 0, col: i - 20, side: 'top' });
  }
  // Right col: spaces 31-39, row = i-30
  for (let i = 31; i <= 39; i++) {
    placements.push({ space: BOARD_SPACES[i], row: i - 30, col: 10, side: 'right' });
  }

  // Create spaces with explicit grid placement
  placements.forEach(({ space, row, col, side }) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildSpace(space, side);
    const spaceEl = wrapper.firstElementChild;
    spaceEl.style.gridColumn = String(col + 1);
    spaceEl.style.gridRow = String(row + 1);

    if (['property', 'railroad', 'utility'].includes(space.type)) {
      spaceEl.style.cursor = 'pointer';
    }
    container.appendChild(spaceEl);
  });

  // Center area — one element spanning the entire 9×9 center
  const center = document.createElement('div');
  center.className = 'board-center-area';
  center.style.gridColumn = '2 / 11';
  center.style.gridRow = '2 / 11';
  center.innerHTML = `
    <div class="board-center">
      <div class="board-logo">🎩</div>
      <div class="board-title">MONOPOLY</div>
      <div class="board-subtitle">Classic Edition</div>
    </div>`;
  container.appendChild(center);

  setupBoardKeyboard(container, hadFocus);
}

// The board is one tab stop. Arrow keys walk the squares in board order
// (Right/Down = next square, Left/Up = previous), Home goes to GO, and
// Enter or Space opens the square like a click does.
function setupBoardKeyboard(container, refocus) {
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Board: use the arrow keys to move between squares, Enter to open one');

  const current = parseInt(container.dataset.focusSpace || '0', 10);
  const spaceEl = id => container.querySelector(`[data-space="${id}"]`);
  const start = spaceEl(current);
  if (start) {
    start.tabIndex = 0;
    if (refocus) start.focus({ preventScroll: true });
  }

  if (container.dataset.keyboardReady) return;
  container.dataset.keyboardReady = '1';
  container.addEventListener('keydown', (e) => {
    const from = e.target.closest('[data-space]');
    if (!from || !container.contains(from)) return;
    const id = parseInt(from.dataset.space, 10);
    let next = null;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': next = (id + 1) % 40; break;
      case 'ArrowLeft':  case 'ArrowUp':   next = (id + 39) % 40; break;
      case 'Home': next = 0; break;
      case 'End':  next = 39; break;
      case 'Enter': case ' ':
        e.preventDefault();
        from.click();
        return;
      default: return;
    }
    e.preventDefault();
    spaceEl(next)?.focus();
  });
  // Whichever square gets focus, by key or by click, becomes the tab stop.
  container.addEventListener('focusin', (e) => {
    const to = e.target.closest('[data-space]');
    if (!to) return;
    container.querySelectorAll('[data-space][tabindex="0"]').forEach(el => { el.tabIndex = -1; });
    to.tabIndex = 0;
    container.dataset.focusSpace = to.dataset.space;
  });
}
