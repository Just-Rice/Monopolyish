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
  function startLocalGame() {
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
        difficulty: pt.isAI ? (pt.difficulty || 'medium') : null
      });
    }

    const freeParkingEnabled = document.getElementById('free-parking-toggle').checked;

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-screen').classList.add('active');

    game = new Game(names, tokens, { freeParkingPot: freeParkingEnabled, aiConfigs });
    game.init();

    // Init dice faces
    renderDiceFace(document.getElementById('dice1'), 1);
    renderDiceFace(document.getElementById('dice2'), 6);

    // Update parking pot display (hide if disabled)
    const potSection = document.getElementById('parking-pot-section');
    if (potSection && !freeParkingEnabled) {
      potSection.style.display = 'none';
    }
    updateParkingPot();
    window._game = game;
  }

  document.getElementById('btn-start-game').addEventListener('click', startLocalGame);

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
