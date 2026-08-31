/* Monopolyish — the setup screen, and the live Free Parking ticker. */

  let playerCount = 3;
  let game = null;
  let selectedTokens = [0, 1, 2, 3];
  let playerTypes = [{isAI:false}, {isAI:false}, {isAI:false}, {isAI:false}];
  // Custom color overrides (null = use token default)
  let playerColors = [null, null, null, null];

  const AI_NAMES = ['Skynet', 'HAL 9000', 'Cortana'];
  const COLOR_PALETTE = [
    '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
    '#3498db','#9b59b6','#e84393','#fd79a8','#00cec9',
    '#6c5ce7','#fdcb6e','#55efc4','#fab1a0','#a29bfe',
  ];

  // ── Setup Screen ──────────────────────────────────────────
  function renderPlayerInputs(count) {
    selectedTokens = Array.from({ length: count }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      if (!playerTypes[i]) playerTypes[i] = { isAI: false, difficulty: null };
    }
    const container = document.getElementById('player-inputs');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const pt = playerTypes[i];
      const row = document.createElement('div');
      row.className = `player-input-row ${pt.isAI ? 'ai-row' : ''}`;
      const defaultName = pt.isAI ? `${AI_NAMES[i-1] || 'CPU ' + i}` : `Player ${i + 1}`;
      const dotColor = playerColors[i] || ALL_TOKENS[selectedTokens[i]].color;
      row.innerHTML = `
        <div class="token-picker-wrapper">
          <button class="token-selected" id="token-btn-${i}" title="Click to change token">
            ${ALL_TOKENS[selectedTokens[i]].emoji}
          </button>
          <div class="token-picker-grid" id="token-picker-${i}">
            ${ALL_TOKENS.map((t, ti) => `
              <button class="token-option ${ti === selectedTokens[i] ? 'chosen' : ''}"
                      data-player="${i}" data-token="${ti}" title="${t.name}">
                ${t.emoji}
              </button>
            `).join('')}
          </div>
        </div>
        <input type="text" id="player-name-${i}"
          placeholder="${pt.isAI ? 'CPU name' : `Player ${i + 1} name`}"
          value="${defaultName}" maxlength="18" autocomplete="off">
        <div class="player-type-controls">
          <button class="type-toggle ${!pt.isAI ? 'active' : ''}" data-player="${i}" data-type="human">👤</button>
          <button class="type-toggle ${pt.isAI ? 'active' : ''}" data-player="${i}" data-type="ai">🤖</button>
        </div>
        <div class="color-picker-wrapper">
          <span class="token-color-dot" id="color-dot-${i}"
                style="background:${dotColor}" title="Click to change color"></span>
          <div class="color-picker-popup" id="color-popup-${i}">
            <div class="color-grid">
              ${COLOR_PALETTE.map(c => `
                <button class="color-swatch ${c === dotColor ? 'chosen' : ''}"
                        data-player="${i}" data-color="${c}"
                        style="background:${c}" title="${c}"></button>
              `).join('')}
            </div>
          </div>
        </div>
        ${pt.isAI ? `
          <div class="difficulty-selector" id="diff-sel-${i}">
            <button class="diff-btn ${pt.difficulty === 'easy' ? 'active' : ''}" data-player="${i}" data-diff="easy">Easy</button>
            <button class="diff-btn ${pt.difficulty === 'medium' || !pt.difficulty ? 'active' : ''}" data-player="${i}" data-diff="medium">Med</button>
            <button class="diff-btn ${pt.difficulty === 'hard' ? 'active' : ''}" data-player="${i}" data-diff="hard">Hard</button>
          </div>
          <select class="persona-select" data-player="${i}" aria-label="Computer personality">
            <option value="">Surprise me</option>
            ${aiPersonalityKeys().map(key => `
              <option value="${key}" ${pt.personality === key ? 'selected' : ''}
                      title="${AI_PERSONALITIES[key].blurb}">${AI_PERSONALITIES[key].label}</option>
            `).join('')}
          </select>
        ` : ''}`;
      container.appendChild(row);
    }

    // Type toggle events
    document.querySelectorAll('.type-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.player);
        const type = btn.dataset.type;
        playerTypes[idx] = {
          isAI: type === 'ai',
          difficulty: type === 'ai' ? (playerTypes[idx].difficulty || 'medium') : null
        };
        renderPlayerInputs(playerCount);
        attachTokenPickerEvents();
      });
    });

    // Personality picker
    document.querySelectorAll('.persona-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        e.stopPropagation();
        const idx = parseInt(sel.dataset.player);
        playerTypes[idx].personality = sel.value || null;
      });
      sel.addEventListener('click', (e) => e.stopPropagation());
    });

    // Difficulty button events
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.player);
        playerTypes[idx].difficulty = btn.dataset.diff;
        document.querySelectorAll(`#diff-sel-${idx} .diff-btn`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Color dot click → open color picker
    document.querySelectorAll('.token-color-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(dot.id.replace('color-dot-', ''));
        // Close all other popups
        document.querySelectorAll('.color-picker-popup').forEach(p => p.classList.remove('open'));
        document.getElementById(`color-popup-${idx}`).classList.toggle('open');
      });
    });

    // Color swatch click → set custom color
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(sw.dataset.player);
        const color = sw.dataset.color;
        playerColors[idx] = color;
        document.getElementById(`color-dot-${idx}`).style.background = color;
        // Update chosen state
        document.querySelectorAll(`#color-popup-${idx} .color-swatch`).forEach(s => s.classList.remove('chosen'));
        sw.classList.add('chosen');
        document.getElementById(`color-popup-${idx}`).classList.remove('open');
      });
    });

    attachTokenPickerEvents();
    updateAllAIWarning();
  }

  // Close color pickers on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.color-picker-popup').forEach(p => p.classList.remove('open'));
  });

  function updateAllAIWarning() {
    const allAI = Array.from({ length: playerCount }, (_, i) => playerTypes[i]?.isAI).every(Boolean);
    const warning = document.getElementById('all-ai-warning');
    if (allAI) {
      warning.classList.add('visible');
    } else {
      warning.classList.remove('visible');
    }
  }

  function attachTokenPickerEvents() {
    // Toggle picker open/close
    document.querySelectorAll('.token-selected').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.id.replace('token-btn-', ''));
        const picker = document.getElementById(`token-picker-${idx}`);
        // Close all other pickers
        document.querySelectorAll('.token-picker-grid').forEach(p => {
          if (p !== picker) p.classList.remove('open');
        });
        picker.classList.toggle('open');
      });
    });

    // Token selection
    document.querySelectorAll('.token-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerIdx = parseInt(opt.dataset.player);
        const tokenIdx = parseInt(opt.dataset.token);

        // Check if another player already has this token
        const otherUser = selectedTokens.findIndex((t, i) => t === tokenIdx && i !== playerIdx);
        if (otherUser >= 0) {
          // Swap tokens
          const oldToken = selectedTokens[playerIdx];
          selectedTokens[otherUser] = oldToken;
          document.getElementById(`token-btn-${otherUser}`).textContent = ALL_TOKENS[oldToken].emoji;
          if (!playerColors[otherUser]) document.getElementById(`color-dot-${otherUser}`).style.background = ALL_TOKENS[oldToken].color;
          // Update other picker's chosen state
          document.querySelectorAll(`#token-picker-${otherUser} .token-option`).forEach(o => {
            o.classList.toggle('chosen', parseInt(o.dataset.token) === oldToken);
          });
        }

        selectedTokens[playerIdx] = tokenIdx;
        document.getElementById(`token-btn-${playerIdx}`).textContent = ALL_TOKENS[tokenIdx].emoji;
        if (!playerColors[playerIdx]) document.getElementById(`color-dot-${playerIdx}`).style.background = ALL_TOKENS[tokenIdx].color;

        // Update chosen state
        document.querySelectorAll(`#token-picker-${playerIdx} .token-option`).forEach(o => {
          o.classList.toggle('chosen', parseInt(o.dataset.token) === tokenIdx);
        });

        // Close picker
        document.getElementById(`token-picker-${playerIdx}`).classList.remove('open');
      });
    });

    // Close pickers on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.token-picker-grid').forEach(p => p.classList.remove('open'));
    });
  }

  // Count buttons
  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playerCount = parseInt(btn.dataset.count);
      renderPlayerInputs(playerCount);
    });
  });

  renderPlayerInputs(playerCount);

  // Start game
  /* Building the game is its own function so the online lobby can start it
     directly. Synthesising a click on the button re-entered the online
     handler and re-hosted the room, which dropped everybody already in it. */
  /* Everything the house-rules panel is currently set to. One place, so the
     same options reach a local game, a hosted game and a saved one. */
  function readOptions() {
    const on = (id) => !!document.getElementById(id)?.checked;
    const num = (id, fallback) => {
      const value = parseInt(document.getElementById(id)?.value, 10);
      return Number.isFinite(value) ? value : fallback;
    };
    const shortGame = on('short-game-toggle');
    return {
      freeParkingPot: on('free-parking-toggle'),
      noAuctions: on('no-auctions-toggle'),
      exactGoBonus: on('exact-go-toggle'),
      noRentInJail: on('no-rent-jail-toggle'),
      shortGame,
      speedDie: on('speed-die-toggle'),
      startingCash: num('starting-cash', 1500),
      // The short game brings its own limit, unless one is already set.
      turnLimit: num('turn-limit', 0) || (shortGame ? 40 : 0),
      timeLimit: num('time-limit', 0),
      theme: document.getElementById('board-theme')?.value || 'classic'
    };
  }

  function buildGame(options, saved) {
    const names = [];
    const tokens = [];
    const aiConfigs = [];
    for (let i = 0; i < playerCount; i++) {
      const val = document.getElementById(`player-name-${i}`)?.value.trim();
      const pt = playerTypes[i] || { isAI: false };
      const defaultName = pt.isAI ? `CPU ${i}` : `Player ${i + 1}`;
      names.push(val || defaultName);
      // Clone token and apply custom color if set
      const baseToken = ALL_TOKENS[selectedTokens[i]];
      const token = { ...baseToken };
      if (playerColors[i]) token.color = playerColors[i];
      tokens.push(token);
      aiConfigs.push({
        isAI: pt.isAI,
        difficulty: pt.isAI ? (pt.difficulty || 'medium') : null,
        personality: pt.isAI ? (pt.personality || null) : null
      });
    }

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-screen').classList.add('active');

    applyBoardTheme(options.theme);

    game = new Game(saved ? saved.players.map(p => p.name) : names,
                    saved ? saved.players.map(p => p.token) : tokens,
                    Object.assign({}, options, { aiConfigs }));
    if (saved) Save.apply(game, saved);

    game.init();

    // Init dice faces
    renderDiceFace(document.getElementById('dice1'), 1);
    renderDiceFace(document.getElementById('dice2'), 6);

    // Update parking pot display (hide if disabled)
    const potSection = document.getElementById('parking-pot-section');
    if (potSection && game.useFreeParkingPot === false) {
      potSection.style.display = 'none';
    }
    updateParkingPot();
    window._game = game;
    return game;
  }

  function startLocalGame() {
    return buildGame(readOptions(), null);
  }

  /* Picking up where a closed tab left off. The saved options come with it, so
     the panel's current settings are not applied on top. */
  function resumeSavedGame() {
    const saved = Save.read();
    if (!saved) return null;
    playerCount = saved.players.length;
    playerTypes = saved.players.map(p => ({
      isAI: p.isAI, difficulty: p.aiDifficulty, personality: p.aiPersonality
    }));
    playerColors = saved.players.map(p => p.color);
    selectedTokens = saved.players.map((p, i) => i);
    return buildGame(Object.assign({}, saved.options), saved);
  }

  document.getElementById('btn-start-game').addEventListener('click', () => startLocalGame());

  // ── Board themes, personalities and the saved game ────────
  document.addEventListener('DOMContentLoaded', () => {
    const themeSelect = document.getElementById('board-theme');
    if (themeSelect && typeof BOARD_THEMES !== 'undefined') {
      themeSelect.innerHTML = boardThemeKeys()
        .map(key => `<option value="${key}">${BOARD_THEMES[key].label}</option>`)
        .join('');
    }

    const banner = document.getElementById('resume-banner');
    const saved = typeof Save !== 'undefined' ? Save.read() : null;
    if (banner && saved) {
      const summary = Save.summary(saved);
      banner.hidden = false;
      const line = document.getElementById('resume-summary');
      if (line) line.textContent = `${summary.players} · ${summary.text}`;
      document.getElementById('btn-resume')?.addEventListener('click', () => resumeSavedGame());
      document.getElementById('btn-discard-save')?.addEventListener('click', () => {
        Save.clear();
        banner.hidden = true;
      });
    }
  });

  // ── Parking Pot live update ──────────────────────────────
  function updateParkingPot() {
    setInterval(() => {
      if (game) {
        const el = document.getElementById('parking-pot-display');
        if (el) el.textContent = `$${game.state.freeParkingPot.toLocaleString()}`;

        // Doubles indicator
        const dbl = document.getElementById('doubles-indicator');
        if (dbl) {
          if (game.lastRoll?.doubles) {
            dbl.textContent = '🎯 DOUBLES! Roll again!';
          } else {
            dbl.textContent = '';
          }
        }
      }
    }, 500);
  }
