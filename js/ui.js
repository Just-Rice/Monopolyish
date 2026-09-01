/* Monopolyish — Panels, toasts and modals. */

// === ui.js ===
// ============================================================
//  UI MODULE - Modals, Toasts, Dashboard Updates
// ============================================================

class UI {
  constructor(game) {
    this.game = game;
    this.toastQueue = [];
    this.toastTimer = null;
  }

  // ── Toast Notifications ──────────────────────────────────
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${this.toastIcon(type)}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  toastIcon(type) {
    return { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌', money: '💰', dice: '🎲' }[type] || 'ℹ️';
  }

  // ── Update all UI panels ─────────────────────────────────
  updateAll() {
    // The host is the only one that changes anything, so this is the single
    // place the rest of the table hears about it.
    if (typeof MP !== 'undefined' && MP.mode === 'host') {
      setTimeout(() => MP.publish(this.game), 0);
    }
    this.updatePlayerPanels();
    this.updateCurrentPlayerPanel();
    this.updateActionButtons();
    this.updateBoard();
  }

  updateBoard() {
    // Update property ownership indicators on the board
    const game = this.game;
    BOARD_SPACES.forEach(space => {
      const el = document.querySelector(`[data-space="${space.id}"]`);
      if (!el) return;
      const prop = game.state.properties[space.id];
      if (!prop) return;

      // Remove old ownership classes
      el.classList.remove('owned');
      const oldOwner = el.querySelector('.owner-dot');
      if (oldOwner) oldOwner.remove();

      if (prop.owner !== null) {
        el.classList.add('owned');
        const player = game.players[prop.owner];
        const dot = document.createElement('div');
        dot.className = 'owner-dot';
        dot.style.background = player.color;
        /* The token, not just the colour: two players can pick shades a
           colour-blind reader cannot tell apart, and they often do. */
        dot.textContent = player.token && player.token.emoji ? player.token.emoji : '';
        dot.title = `Owned by ${player.name}`;
        el.appendChild(dot);
      }

      // Houses / hotels
      const houseEl = el.querySelector('.houses');
      if (houseEl) {
        houseEl.innerHTML = '';
        const h = prop.houses || 0;
        if (h === 5) {
          const hotel = document.createElement('div');
          hotel.className = 'hotel';
          hotel.textContent = '🏨';
          houseEl.appendChild(hotel);
        } else {
          for (let i = 0; i < h; i++) {
            const house = document.createElement('div');
            house.className = 'house';
            houseEl.appendChild(house);
          }
        }
      }

      // Mortgage overlay
      if (prop.mortgaged) {
        el.classList.add('mortgaged');
      } else {
        el.classList.remove('mortgaged');
      }

      el.setAttribute('aria-label', this.describeSpace(space.id));
    });

    // Move player tokens
    this.updateTokens();
  }

  /* What a screen reader is told about a square: its name, who holds it, what
     is built on it and who is standing there. */
  describeSpace(spaceId) {
    const game = this.game;
    const space = BOARD_SPACES[spaceId];
    if (!space) return '';
    const parts = [space.name];

    const prop = game.state.properties[spaceId];
    if (prop) {
      if (space.price) parts.push(`$${space.price}`);
      if (prop.owner === null) {
        parts.push('unowned');
      } else {
        parts.push(`owned by ${game.players[prop.owner].name}`);
        if (prop.mortgaged) parts.push('mortgaged');
        if (prop.houses === 5) parts.push('hotel');
        else if (prop.houses > 0) parts.push(`${prop.houses} house${prop.houses > 1 ? 's' : ''}`);
      }
    }

    const here = game.players.filter(p => !p.bankrupt && p.position === spaceId);
    if (here.length) parts.push(`${here.map(p => p.name).join(' and ')} here`);
    return parts.join(', ');
  }

  updateTokens() {
    const game = this.game;

    // Build map of current positions: { playerId: position }
    const currentPositions = {};
    game.players.forEach((player, i) => {
      if (!player.bankrupt) {
        currentPositions[i] = player.position;
      }
    });

    // Compare with previous positions to find who moved
    if (!this._prevPositions) this._prevPositions = {};
    const movedPlayers = new Set();
    for (const [id, pos] of Object.entries(currentPositions)) {
      if (this._prevPositions[id] !== pos) {
        movedPlayers.add(parseInt(id));
      }
    }
    // Also detect removed players (bankrupt)
    for (const id of Object.keys(this._prevPositions)) {
      if (!(id in currentPositions)) {
        movedPlayers.add(parseInt(id));
      }
    }
    this._prevPositions = { ...currentPositions };

    // Remove all tokens and rebuild (simplest correct approach)
    document.querySelectorAll('.player-token').forEach(t => t.remove());

    // Group players by position
    const byPosition = {};
    game.players.forEach((player, i) => {
      if (player.bankrupt) return;
      const pos = player.position;
      if (!byPosition[pos]) byPosition[pos] = [];
      byPosition[pos].push({ player, i });
    });

    Object.entries(byPosition).forEach(([pos, players]) => {
      const spaceEl = document.querySelector(`[data-space="${pos}"]`);
      if (!spaceEl) return;
      const tokenContainer = spaceEl.querySelector('.token-container') || spaceEl;

      players.forEach((entry, offset) => {
        const token = document.createElement('div');
        token.className = 'player-token';
        // Only add hop animation to tokens that actually moved
        if (movedPlayers.has(entry.i)) {
          token.classList.add('hop');
        }
        token.textContent = entry.player.token.emoji;
        token.style.background = entry.player.color;
        token.style.transform = `translate(${offset * 20}px, 0)`;
        token.title = entry.player.name;
        tokenContainer.appendChild(token);
      });
    });
  }

  updatePlayerPanels() {
    const container = document.getElementById('player-panels');
    if (!container) return;
    container.innerHTML = '';

    this.game.players.forEach((player, i) => {
      const isCurrent = i === this.game.currentPlayer;
      const panel = document.createElement('div');
      panel.className = `player-panel ${isCurrent ? 'active' : ''} ${player.bankrupt ? 'bankrupt' : ''} ${player.isAI ? 'ai-player' : ''}`;
      panel.id = `player-panel-${i}`;
      const diffLabel = player.isAI ? { easy: 'Easy', medium: 'Med', hard: 'Hard' }[player.aiDifficulty] || '' : '';
      const persona = player.isAI && typeof AI_PERSONALITIES !== 'undefined' &&
                      AI_PERSONALITIES[player.aiPersonality]
        ? AI_PERSONALITIES[player.aiPersonality] : null;
      panel.innerHTML = `
        <div class="panel-header">
          <span class="player-token-sm" style="background:${player.color}">${player.token.emoji}</span>
          <span class="player-name">${player.isAI ? '🤖 ' : ''}${player.name}</span>
          ${player.isAI ? `<span class="ai-badge" title="${persona ? persona.blurb : ''}">${persona ? persona.label : 'CPU'}·${diffLabel}</span>` : ''}
          ${isCurrent ? '<span class="current-badge">CURRENT</span>' : ''}
          ${player.bankrupt ? '<span class="bankrupt-badge">BANKRUPT</span>' : ''}
        </div>
        <div class="panel-money">$${player.money.toLocaleString()}</div>
        <div class="panel-props">
          ${player.properties.map(id => {
            const sp = BOARD_SPACES[id];
            const pr = this.game.state.properties[id];
            if (!sp) return '';
            const grp = sp.group ? COLOR_GROUPS[sp.group] : null;
            return `<span class="prop-badge ${pr?.mortgaged ? 'mortgaged' : ''}" 
              style="${grp ? `background:${grp.color}` : 'background:#555'}"
              title="${sp.name}${pr?.mortgaged ? ' (mortgaged)' : ''}">${sp.name.substring(0,3)}</span>`;
          }).join('')}
        </div>
        ${player.jailCards.length > 0 ? `<div class="jail-card-indicator">🃏 Get Out of Jail Free x${player.jailCards.length}</div>` : ''}
      `;
      container.appendChild(panel);
    });
  }

  updateCurrentPlayerPanel() {
    const game = this.game;
    const player = game.players[game.currentPlayer];
    if (!player) return;

    const nameEl = document.getElementById('cur-player-name');
    const moneyEl = document.getElementById('cur-player-money');
    const tokenEl = document.getElementById('cur-player-token');
    const posEl = document.getElementById('cur-player-pos');

    if (nameEl) nameEl.textContent = player.name;
    if (moneyEl) moneyEl.textContent = `$${player.money.toLocaleString()}`;
    if (tokenEl) {
      tokenEl.textContent = player.token.emoji;
      tokenEl.style.background = player.color;
    }
    if (posEl) {
      const space = BOARD_SPACES[player.position];
      const round = game.turnNumber ? ` · round ${game.turnNumber}` : '';
      posEl.textContent = (space ? space.name : '') + round;
    }
  }

  /* Whoever this browser is playing for and who is still in the game. Offline
     that is everybody at the table; online it is your own seat. */
  seatsHere() {
    return this.game.players.filter(p => !p.bankrupt &&
      (typeof MP === 'undefined' || MP.controls(p.id)) && !p.isAI);
  }

  /* Who a trade opened from this screen comes from: the player to move if that
     is one of ours, otherwise the first seat we hold. */
  defaultTrader() {
    const game = this.game;
    const current = game.players[game.currentPlayer];
    const mine = this.seatsHere();
    if (current && !current.bankrupt && !current.isAI &&
        (typeof MP === 'undefined' || MP.controls(current.id))) {
      return current.id;
    }
    return mine.length ? mine[0].id : null;
  }

  updateActionButtons() {
    const game = this.game;
    const player = game.players[game.currentPlayer];
    const isAI = player?.isAI;

    const rollBtn = document.getElementById('btn-roll');
    const endBtn = document.getElementById('btn-end-turn');
    const buildBtn = document.getElementById('btn-build');
    const tradeBtn = document.getElementById('btn-trade');
    const concedeBtn = document.getElementById('btn-concede');

    const myTurn = !isAI && (typeof MP === 'undefined' || MP.controls(game.currentPlayer));
    const turnActions = myTurn && (game.phase === 'action' || game.phase === 'rolled');

    if (rollBtn) rollBtn.disabled = isAI || !game.canRoll();
    if (endBtn) endBtn.disabled = isAI || !game.canEndTurn();
    if (buildBtn) buildBtn.disabled = !turnActions;

    /* Trading is deliberately not tied to the turn: at a real table the useful
       moment to make a deal is usually while somebody else is rolling. */
    const canTrade = typeof game.canTrade === 'function' ? game.canTrade() : turnActions;
    if (tradeBtn) tradeBtn.disabled = !canTrade || this.defaultTrader() === null;

    if (concedeBtn) {
      const mine = this.seatsHere();
      concedeBtn.disabled = !!game.over || mine.length === 0;
    }
  }

  // ── Modals ───────────────────────────────────────────────
  showModal(html, options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.add('active');

    /* Keyboard and screen-reader users need to know a dialog opened, and to
       land inside it rather than at the top of the page. */
    if (overlay.setAttribute) {
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
    }
    this._returnFocusTo = (typeof document !== 'undefined' && document.activeElement) || null;
    const first = content.querySelector && content.querySelector('button, input, select, textarea');
    if (first && first.focus) { try { first.focus(); } catch (e) {} }

    if (options.onClose) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          options.onClose();
        }
      }, { once: true });
    }
  }

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    this.sticky = null;
    const back = this._returnFocusTo;
    this._returnFocusTo = null;
    if (back && back.focus) { try { back.focus(); } catch (e) {} }
  }

  /* Some modals have to survive a fresh snapshot — raising funds is a
     back-and-forth against a board that keeps changing under it.
     What is remembered is which modal it was and what it was about, never a
     closure: on a guest the whole mirror is replaced by each snapshot, so a
     captured one would redraw the board as it was two moves ago. */
  setSticky(kind, args) {
    this.sticky = { kind, args: args || [] };
  }

  redrawSticky() {
    if (!this.sticky) return;
    const draw = { raiseFunds: 'showRaiseFundsModal' }[this.sticky.kind];
    if (!draw || typeof this[draw] !== 'function') return;
    try { this[draw].apply(this, this.sticky.args); }
    catch (e) { this.sticky = null; }
  }

  showPropertyModal(spaceId) {
    const space = BOARD_SPACES[spaceId];
    const prop = this.game.state.properties[spaceId];
    if (!space || !prop) return;

    const owner = prop.owner !== null ? this.game.players[prop.owner] : null;
    const grp = space.group ? COLOR_GROUPS[space.group] : null;
    /* Managing property is the current player's to do — and only if this is
       the screen playing them. A guest looking at somebody else's deed was
       shown Build and Mortgage buttons that the host would refuse. */
    const ours = typeof MP === 'undefined' || MP.controls(this.game.currentPlayer);
    const isCurrentOwner = ours && prop.owner === this.game.currentPlayer;
    const canBuild = isCurrentOwner && canBuildHouse(this.game.currentPlayer, spaceId, this.game.state);
    const canSell = isCurrentOwner && canSellHouse(this.game.currentPlayer, spaceId, this.game.state);
    const canMortgage = isCurrentOwner && !prop.mortgaged && (prop.houses || 0) === 0;
    const canUnmortgage = isCurrentOwner && prop.mortgaged && this.game.players[this.game.currentPlayer].money >= Math.floor(space.mortgage * 1.1);

    const houseDisplay = prop.houses === 5 ? '🏨 Hotel' : '🏠'.repeat(prop.houses || 0) || 'None';

    let rentTable = '';
    if (space.type === 'property' && space.rent) {
      rentTable = `
        <table class="rent-table">
          <tr><th>Situation</th><th>Rent</th></tr>
          <tr><td>Base Rent</td><td>$${space.rent[0]}</td></tr>
          <tr><td>Color Monopoly</td><td>$${space.rent[0] * 2}</td></tr>
          <tr><td>1 House</td><td>$${space.rent[1]}</td></tr>
          <tr><td>2 Houses</td><td>$${space.rent[2]}</td></tr>
          <tr><td>3 Houses</td><td>$${space.rent[3]}</td></tr>
          <tr><td>4 Houses</td><td>$${space.rent[4]}</td></tr>
          <tr><td>Hotel</td><td>$${space.rent[5]}</td></tr>
        </table>`;
    } else if (space.type === 'railroad') {
      rentTable = `
        <table class="rent-table">
          <tr><th>Railroads Owned</th><th>Rent</th></tr>
          <tr><td>1</td><td>$25</td></tr>
          <tr><td>2</td><td>$50</td></tr>
          <tr><td>3</td><td>$100</td></tr>
          <tr><td>4</td><td>$200</td></tr>
        </table>`;
    } else if (space.type === 'utility') {
      rentTable = `
        <table class="rent-table">
          <tr><th>Utilities Owned</th><th>Rent</th></tr>
          <tr><td>1</td><td>4× dice roll</td></tr>
          <tr><td>2</td><td>10× dice roll</td></tr>
        </table>`;
    }

    const html = `
      <div class="property-modal">
        <div class="property-deed" style="${grp ? `border-top: 8px solid ${grp.color}` : ''}">
          <div class="deed-header" style="${grp ? `background:${grp.color}` : 'background:#333'}">
            <h2>${space.name}</h2>
            ${space.type === 'property' ? `<p>TITLE DEED</p>` : `<p>${space.type.toUpperCase()}</p>`}
          </div>
          <div class="deed-body">
            ${space.price ? `<div class="deed-price">Price: <strong>$${space.price}</strong></div>` : ''}
            ${space.housePrice ? `<div class="deed-price">House/Hotel: <strong>$${space.housePrice}</strong></div>` : ''}
            <div class="deed-status">
              Owner: <strong>${owner ? owner.name : 'Bank'}</strong>
            </div>
            <div class="deed-status">
              Status: <strong>${prop.mortgaged ? '🔴 Mortgaged' : '🟢 Active'}</strong>
            </div>
            ${space.type === 'property' ? `<div class="deed-status">Buildings: <strong>${houseDisplay}</strong></div>` : ''}
            ${space.mortgage ? `<div class="deed-status">Mortgage Value: <strong>$${space.mortgage}</strong></div>` : ''}
            ${rentTable}
          </div>
        </div>
        <div class="deed-actions">
          ${canBuild ? `<button class="btn btn-success" id="deed-build">Build House ($${space.housePrice})</button>` : ''}
          ${canSell ? `<button class="btn btn-warning" id="deed-sell">Sell House ($${Math.floor((space.housePrice||0)/2)})</button>` : ''}
          ${canMortgage ? `<button class="btn btn-danger" id="deed-mortgage">Mortgage ($${space.mortgage})</button>` : ''}
          ${canUnmortgage ? `<button class="btn btn-primary" id="deed-unmortgage">Unmortgage ($${Math.floor(space.mortgage * 1.1)})</button>` : ''}
          <button class="btn btn-secondary" id="deed-close">Close</button>
        </div>
      </div>`;

    this.showModal(html);

    document.getElementById('deed-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('deed-build')?.addEventListener('click', () => {
      this.closeModal();
      this.game.buildHouse(spaceId);
    });
    document.getElementById('deed-sell')?.addEventListener('click', () => {
      this.closeModal();
      this.game.sellHouse(spaceId);
    });
    document.getElementById('deed-mortgage')?.addEventListener('click', () => {
      this.closeModal();
      this.game.mortgageProperty(spaceId);
    });
    document.getElementById('deed-unmortgage')?.addEventListener('click', () => {
      this.closeModal();
      this.game.unmortgageProperty(spaceId);
    });
  }

  showBuyModal(spaceId, onBuy, onAuction) {
    const space = BOARD_SPACES[spaceId];
    const player = this.game.players[this.game.currentPlayer];
    const grp = space.group ? COLOR_GROUPS[space.group] : null;
    const canAfford = player.money >= space.price;

    const html = `
      <div class="property-modal">
        <div class="property-deed" style="${grp ? `border-top: 8px solid ${grp.color}` : ''}">
          <div class="deed-header" style="${grp ? `background:${grp.color}` : 'background:#333'}">
            <h2>${space.name}</h2>
            <p>For Sale!</p>
          </div>
          <div class="deed-body">
            <div class="deed-price buy-price">$${space.price.toLocaleString()}</div>
            <div class="deed-status">Your balance: <strong>$${player.money.toLocaleString()}</strong></div>
            ${!canAfford ? '<div class="afford-warning">⚠️ Insufficient funds!</div>' : ''}
          </div>
        </div>
        <div class="deed-actions">
          ${canAfford ? `<button class="btn btn-success" id="modal-buy">Buy Property</button>` : ''}
          <button class="btn btn-warning" id="modal-auction">Auction</button>
        </div>
      </div>`;

    this.showModal(html);
    document.getElementById('modal-buy')?.addEventListener('click', () => { this.closeModal(); onBuy(); });
    document.getElementById('modal-auction')?.addEventListener('click', () => { this.closeModal(); onAuction(); });
  }

  /* An auction is a live loop rather than a single question, which is why it
   * used to run entirely on the host with everyone else watching a screen they
   * could not touch. It is now a loop of single questions: each bidder in turn
   * is asked what they want to do, wherever they happen to be sitting, and the
   * rest of the table is told what happened.
   */
  showAuctionModal(spaceId) {
    const game = this.game;
    const space = BOARD_SPACES[spaceId];
    const bidders = game.players.filter(p => !p.bankrupt);
    const state = { bid: 0, leader: -1, passed: new Set(), turn: 0 };

    if (!bidders.length) return game.endLandAction();

    const settle = () => {
      /* The sale can still fall through — the winner's money may have gone
         somewhere else between the bid and the hammer, and the deed may have
         been taken. Announcing a win the board did not record left everyone
         believing they owned something that was still the bank's. */
      if (state.leader >= 0 && state.bid > 0 &&
          game.purchaseProperty(state.leader, spaceId, state.bid)) {
        game.stats.perPlayer[state.leader].auctionsWon++;
        this.closeModal();
        const winner = game.players[state.leader];
        this.showToast(`${winner.name} won the auction for ${space.name} at $${state.bid}!`, 'success');
        this.announce(`🔨 ${winner.name} won ${space.name} for $${state.bid}`);
      } else {
        this.closeModal();
        this.showToast(`${space.name} was not sold.`, 'info');
        this.announce(`🔨 ${space.name} was not sold`);
      }
      game.endLandAction();
    };

    const advance = () => {
      const live = bidders.filter(p => !state.passed.has(p.id) && !p.bankrupt);
      if (!live.length) return settle();
      if (live.length === 1 && state.leader === live[0].id) return settle();

      // Next bidder still in, starting after the one who just answered.
      for (let step = 1; step <= bidders.length; step++) {
        const candidate = bidders[(state.turn + step) % bidders.length];
        if (!state.passed.has(candidate.id) && !candidate.bankrupt) {
          state.turn = bidders.indexOf(candidate);
          return setTimeout(() => ask(candidate), 120);
        }
      }
      settle();
    };

    const answer = (bidder) => (reply) => {
      const amount = reply && typeof reply === 'object' ? Number(reply.bid) : NaN;
      if (Number.isFinite(amount) && amount > state.bid && amount <= bidder.money) {
        state.bid = amount;
        state.leader = bidder.id;
        this.showToast(`${bidder.name} bids $${amount}!`, 'info');
        this.announce(`🔨 ${bidder.name} bids $${amount} for ${space.name}`);
      } else {
        state.passed.add(bidder.id);
        this.showToast(`${bidder.name} passes.`, 'info');
        this.announce(`🔨 ${bidder.name} passes on ${space.name}`);
      }
      advance();
    };

    const ask = (bidder) => {
      const reply = answer(bidder);
      const payload = {
        spaceId,
        bid: state.bid,
        leaderName: state.leader >= 0 ? game.players[state.leader].name : null,
        bidderId: bidder.id,
        bidderName: bidder.name,
        money: bidder.money
      };

      if (bidder.isAI) {
        const ai = game.getAI(bidder.id);
        const bid = ai ? ai.decideAuctionBid(spaceId, state.bid, game) : 0;
        // Long enough to read, short enough that a table of computers bidding
        // each other up is not something you sit through.
        return setTimeout(() => reply(bid > state.bid && bid <= bidder.money ? { bid } : 'pass'), 320);
      }

      MP.prompt(bidder.id, 'bid', payload, {
        local: () => this.showBidModal(payload, reply),
        onReply: reply
      });
    };

    document.getElementById('modal-overlay').classList.add('active');
    ask(bidders[0]);
  }

  /* One bidder's turn. Drawn from the payload alone, so the same modal works
     on the host and on a guest reading nothing but the question it was sent. */
  showBidModal(payload, reply) {
    const space = BOARD_SPACES[payload.spaceId];
    const grp = space.group ? COLOR_GROUPS[space.group] : null;
    const minBid = payload.bid + 10;

    const html = `
      <div class="auction-modal">
        <h2>🔨 Auction: ${space.name}</h2>
        <div class="auction-info">
          <div class="current-bid">Current bid: <strong>$${payload.bid}</strong></div>
          ${payload.leaderName ? `<div class="highest-bidder">Highest: <strong>${payload.leaderName}</strong></div>` : ''}
          ${space.price ? `<div class="auction-list-price">List price: $${space.price}</div>` : ''}
        </div>
        <div class="bidder-turn" style="${grp ? `border-left:6px solid ${grp.color}` : ''}">
          <strong>${payload.bidderName}'s</strong> turn to bid
          (balance: $${(payload.money || 0).toLocaleString()})
        </div>
        <div class="bid-controls">
          <input type="number" id="bid-amount" min="${minBid}" max="${payload.money}"
                 value="${Math.min(minBid, payload.money)}" step="10" class="bid-input"
                 aria-label="Your bid">
          <button class="btn btn-success" id="bid-submit">Place bid</button>
          <button class="btn btn-danger" id="bid-pass">Pass</button>
        </div>
      </div>`;

    this.showModal(html);

    document.getElementById('bid-submit')?.addEventListener('click', () => {
      const amount = parseInt(document.getElementById('bid-amount').value, 10);
      // A bid that cannot stand says why. Silently doing nothing makes a
      // working button look broken, which is worse than a refusal.
      if (!Number.isFinite(amount)) return this.showToast('Enter an amount to bid.', 'warning');
      if (amount <= payload.bid) {
        return this.showToast(`Bid more than $${payload.bid.toLocaleString()} to take the lead.`, 'warning');
      }
      if (amount > payload.money) {
        return this.showToast(`${payload.bidderName} only has $${(payload.money || 0).toLocaleString()}.`, 'warning');
      }
      this.closeModal();
      reply({ bid: amount });
    });
    document.getElementById('bid-pass')?.addEventListener('click', () => {
      this.closeModal();
      reply('pass');
    });
  }

  /* A line for everyone else's log and toast area. On the host it goes out
     over the wire; offline it is just a log entry. */
  announce(text) {
    this.addGameLog(text);
    if (typeof MP !== 'undefined' && MP.note) MP.note(text);
  }

  showJailModal(player, onPay, onCard, onRoll) {
    const hasCard = player.jailCards.length > 0;
    const html = `
      <div class="jail-modal">
        <div class="jail-icon">🔒</div>
        <h2>${player.name} is in Jail!</h2>
        <p>Turn ${player.jailTurns + 1} of 3. Choose an option:</p>
        <div class="deed-actions">
          ${player.money >= 50 ? `<button class="btn btn-warning" id="jail-pay">Pay $50 Fine</button>` : ''}
          ${hasCard ? `<button class="btn btn-success" id="jail-card">Use Get Out of Jail Free Card</button>` : ''}
          <button class="btn btn-primary" id="jail-roll">Roll for Doubles</button>
        </div>
      </div>`;
    this.showModal(html);
    document.getElementById('jail-pay')?.addEventListener('click', () => { this.closeModal(); onPay(); });
    document.getElementById('jail-card')?.addEventListener('click', () => { this.closeModal(); onCard(); });
    document.getElementById('jail-roll')?.addEventListener('click', () => { this.closeModal(); onRoll(); });
  }

  /* Raising funds against a debt. This one has to survive the board changing
   * underneath it — every sale and mortgage moves the numbers — so on a guest
   * it is registered as sticky and redrawn whenever a snapshot lands.
   */
  showRaiseFundsModal(playerId, amountOwed, creditorId, reason) {
    const game = this.game;
    const player = game.players[playerId];
    const creditorName = creditorId >= 0 ? game.players[creditorId].name : 'the Bank';

    const render = () => {
      const deficit = amountOwed - player.money;
      const canPay = player.money >= amountOwed;

      // Find properties that can be mortgaged or have buildings to sell
      const mortgageable = player.properties.filter(id => {
        const prop = game.state.properties[id];
        return !prop.mortgaged && (prop.houses || 0) === 0;
      });
      const sellable = player.properties.filter(id => {
        return canSellHouse(playerId, id, game.state);
      });

      const html = `
        <div class="raise-funds-modal">
          <h2>⚠️ Raise funds</h2>
          <div class="debt-info">
            <div class="debt-amount">${player.name} owes <strong>$${amountOwed.toLocaleString()}</strong> to ${creditorName}</div>
            <div class="debt-reason">${reason}</div>
            <div class="debt-balance">Cash: <strong>$${player.money.toLocaleString()}</strong></div>
            ${!canPay ? `<div class="debt-deficit">Still need: <strong class="deficit-amount">$${deficit.toLocaleString()}</strong></div>` : ''}
          </div>
          <div class="raise-funds-actions">
            ${sellable.length ? `<h3>Sell buildings</h3><div class="build-list">${sellable.map(id => {
              const sp = BOARD_SPACES[id];
              const pr = game.state.properties[id];
              const val = Math.floor((sp.housePrice || 0) / 2);
              return `<button class="btn btn-warning build-action-btn" data-action="sell" data-id="${id}">
                ${sp.name} (${pr.houses === 5 ? '🏨' : '🏠x' + pr.houses}) → +$${val}
              </button>`;
            }).join('')}</div>` : ''}
            ${mortgageable.length ? `<h3>Mortgage properties</h3><div class="build-list">${mortgageable.map(id => {
              const sp = BOARD_SPACES[id];
              return `<button class="btn btn-danger build-action-btn" data-action="mortgage" data-id="${id}">
                ${sp.name} → +$${sp.mortgage}
              </button>`;
            }).join('')}</div>` : ''}
            ${!sellable.length && !mortgageable.length ? '<p class="no-options">No more assets to liquidate.</p>' : ''}
          </div>
          <div class="deed-actions">
            ${canPay ? `<button class="btn btn-success" id="debt-pay">✅ Pay $${amountOwed.toLocaleString()}</button>` : ''}
            <button class="btn btn-danger" id="debt-bankrupt">💀 Declare bankruptcy</button>
          </div>
        </div>`;

      document.getElementById('modal-content').innerHTML = html;

      // Action handlers
      document.querySelectorAll('.build-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const id = parseInt(btn.dataset.id);
          if (action === 'sell') game.sellHouse(id, playerId);
          else if (action === 'mortgage') game.mortgageProperty(id, playerId);
          // Re-render to update amounts. On a guest nothing has changed yet —
          // the host answers with a snapshot, which redraws this.
          render();
        });
      });

      document.getElementById('debt-pay')?.addEventListener('click', () => {
        this.closeModal();
        game.resolveDebt();
      });

      document.getElementById('debt-bankrupt')?.addEventListener('click', () => {
        this.closeModal();
        game.forceSettleDebt();
      });
    };

    document.getElementById('modal-overlay').classList.add('active');
    this.setSticky('raiseFunds', [playerId, amountOwed, creditorId, reason]);
    render();
  }

  showCardModal(card, type, onClose) {
    const icon = type === 'chance' ? '❓' : '🏛️';
    const label = type === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST';
    const html = `
      <div class="card-modal">
        <div class="card-display ${type}">
          <div class="card-type-label">${label}</div>
          <div class="card-icon">${icon}</div>
          <div class="card-text">${card.text}</div>
        </div>
        <div class="deed-actions">
          <button class="btn btn-primary" id="card-ok">OK</button>
        </div>
      </div>`;
    this.showModal(html);
    document.getElementById('card-ok')?.addEventListener('click', () => {
      this.closeModal();
      onClose();
    });
  }

  /* The trade builder.
   *
   * Two things changed here. It is no longer tied to whose turn it is — the
   * proposer is picked, defaulting to the player to move when that is one of
   * ours — and the answer is no longer the proposer's to give: the offer goes
   * to the other player through the game, which asks the computer, the person
   * at this screen, or the person at another one. */
  showTradeModal() {
    const game = this.game;

    if (typeof game.canTrade === 'function' && !game.canTrade()) {
      this.showToast('Not a moment for a deal.', 'warning');
      return;
    }

    const mine = this.seatsHere();
    let proposerId = this.defaultTrader();
    if (proposerId === null) {
      this.showToast('There is nobody here to trade for.', 'warning');
      return;
    }

    let selectedPartner = null;
    let offerProps = new Set();
    let receiveProps = new Set();
    let offerJailCards = 0;
    let receiveJailCards = 0;

    const partnersFor = (id) => game.players.filter(p => p.id !== id && !p.bankrupt);

    const render = () => {
      const currentPlayer = game.players[proposerId];
      const partners = partnersFor(proposerId);
      if (!partners.length) {
        this.showToast('No other players to trade with!', 'warning');
        return this.closeModal();
      }
      if (selectedPartner === null || !partners.some(p => p.id === selectedPartner)) {
        selectedPartner = partners[0].id;
      }
      const partner = game.players[selectedPartner];

      const offerMoney = Math.max(0, parseInt(document.getElementById('offer-money')?.value, 10) || 0);
      const receiveMoney = Math.max(0, parseInt(document.getElementById('receive-money')?.value, 10) || 0);

      // Every deed either player holds, buildings excepted — a group with
      // houses on it cannot be broken up.
      const tradeable = (player) => player.properties.filter(id => {
        const space = BOARD_SPACES[id];
        const prop = game.state.properties[id];
        if ((prop.houses || 0) > 0) return false;
        if (space.type !== 'property') return true;
        return getGroupSpaces(space.group)
          .every(sp => (game.state.properties[sp.id].houses || 0) === 0);
      });

      const makePropList = (props, checkClass, selectedSet) => props.map(id => {
        const sp = BOARD_SPACES[id];
        const grp = sp.group ? COLOR_GROUPS[sp.group] : null;
        const isMortgaged = game.state.properties[id]?.mortgaged;
        return `<label class="prop-check ${isMortgaged ? 'mortgaged-prop' : ''}">
          <input type="checkbox" class="${checkClass}" value="${id}" ${selectedSet.has(id) ? 'checked' : ''}>
          <span class="prop-badge" style="${grp ? `background:${grp.color}` : ''}">${sp.name}${isMortgaged ? ' 🔴' : ''}</span>
        </label>`;
      }).join('') || '<p class="no-props">No properties</p>';

      const proposerPicker = mine.length > 1 ? `
        <div class="trade-proposer-select">
          Trading as:
          ${mine.map(p => `
            <button class="btn ${p.id === proposerId ? 'btn-primary' : 'btn-secondary'} proposer-btn" data-id="${p.id}">
              ${p.token.emoji} ${p.name}
            </button>`).join('')}
        </div>` : '';

      const html = `
        <div class="trade-modal">
          <h2>🤝 Trade</h2>
          ${proposerPicker}
          <div class="trade-partner-select">
            Trade with:
            ${partners.map(p => `
              <button class="btn ${p.id === selectedPartner ? 'btn-primary' : 'btn-secondary'} partner-btn" data-id="${p.id}">
                ${p.token.emoji} ${p.name}${p.isAI ? ' 🤖' : ''}
              </button>`).join('')}
          </div>
          <div class="trade-columns">
            <div class="trade-col">
              <h3>${currentPlayer.name} offers</h3>
              <div class="trade-props">${makePropList(tradeable(currentPlayer), 'offer-prop', offerProps)}</div>
              ${currentPlayer.jailCards.length > 0 ? `
                <div class="trade-jail-card">
                  <label class="prop-check">
                    <input type="checkbox" id="offer-jail-card" ${offerJailCards > 0 ? 'checked' : ''}>
                    <span class="prop-badge" style="background:#4a4">🃏 Jail Card (${currentPlayer.jailCards.length} owned)</span>
                  </label>
                </div>` : ''}
              <div class="trade-money">
                <label>Cash offer: $<input type="number" id="offer-money" value="${offerMoney}" min="0" max="${currentPlayer.money}" step="10" class="money-input"></label>
              </div>
            </div>
            <div class="trade-col">
              <h3>${partner.name} offers</h3>
              <div class="trade-props">${makePropList(tradeable(partner), 'receive-prop', receiveProps)}</div>
              ${partner.jailCards.length > 0 ? `
                <div class="trade-jail-card">
                  <label class="prop-check">
                    <input type="checkbox" id="receive-jail-card" ${receiveJailCards > 0 ? 'checked' : ''}>
                    <span class="prop-badge" style="background:#4a4">🃏 Jail Card (${partner.jailCards.length} owned)</span>
                  </label>
                </div>` : ''}
              <div class="trade-money">
                <label>Cash request: $<input type="number" id="receive-money" value="${receiveMoney}" min="0" max="${partner.money}" step="10" class="money-input"></label>
              </div>
            </div>
          </div>
          <div class="deed-actions">
            <button class="btn btn-success" id="trade-confirm">Send offer</button>
            <button class="btn btn-secondary" id="trade-cancel">Cancel</button>
          </div>
        </div>`;

      document.getElementById('modal-content').innerHTML = html;

      document.querySelectorAll('.proposer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          proposerId = parseInt(btn.dataset.id);
          selectedPartner = null;
          offerProps = new Set();
          receiveProps = new Set();
          offerJailCards = 0;
          receiveJailCards = 0;
          render();
        });
      });

      document.querySelectorAll('.partner-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedPartner = parseInt(btn.dataset.id);
          offerProps = new Set();
          receiveProps = new Set();
          offerJailCards = 0;
          receiveJailCards = 0;
          render();
        });
      });

      /* Selections used to be read only at the end, so switching sides threw
         them away silently. They are kept as they are ticked instead. */
      const remember = (cls, set) => {
        document.querySelectorAll(cls).forEach(cb => {
          cb.addEventListener('change', () => {
            const id = parseInt(cb.value);
            if (cb.checked) set.add(id); else set.delete(id);
          });
        });
      };
      remember('.offer-prop', offerProps);
      remember('.receive-prop', receiveProps);

      document.getElementById('offer-jail-card')?.addEventListener('change', (e) => {
        offerJailCards = e.target.checked ? 1 : 0;
      });
      document.getElementById('receive-jail-card')?.addEventListener('change', (e) => {
        receiveJailCards = e.target.checked ? 1 : 0;
      });

      document.getElementById('trade-confirm').addEventListener('click', () => {
        const deal = {
          fromId: proposerId,
          toId: selectedPartner,
          giveProps: [...offerProps],
          getProps: [...receiveProps],
          giveMoney: Math.max(0, parseInt(document.getElementById('offer-money').value, 10) || 0),
          getMoney: Math.max(0, parseInt(document.getElementById('receive-money').value, 10) || 0),
          giveJailCards: document.getElementById('offer-jail-card')?.checked ? 1 : 0,
          getJailCards: document.getElementById('receive-jail-card')?.checked ? 1 : 0
        };

        const check = game.validateDeal ? game.validateDeal(deal) : { ok: true };
        if (!check.ok) {
          this.showToast(check.reason, 'warning');
          return;
        }

        this.closeModal();
        this.showToast(`Offer sent to ${game.players[deal.toId].name}.`, 'info');
        game.requestTrade(deal);
      });
      document.getElementById('trade-cancel').addEventListener('click', () => this.closeModal());
    };

    document.getElementById('modal-overlay').classList.add('active');
    render();
  }

  /* What the other side of a deal sees. The person answering is the one being
     offered to, wherever they are sitting. */
  showTradeOfferModal(deal, onAccept, onDecline) {
    const game = this.game;
    const from = game.players[deal.fromId];
    const to = game.players[deal.toId];
    const name = (id) => BOARD_SPACES[id]?.name || id;
    const mortgaged = (id) => game.state.properties[id]?.mortgaged ? ' 🔴' : '';

    const side = (props, money, cards) => {
      const lines = props.map(id => `<li>${name(id)}${mortgaged(id)}</li>`);
      if (money > 0) lines.push(`<li>$${money.toLocaleString()}</li>`);
      if (cards > 0) lines.push('<li>🃏 Get Out of Jail Free card</li>');
      return lines.length ? lines.join('') : '<li>Nothing</li>';
    };

    const html = `
      <div class="trade-confirm-modal">
        <h2>🤝 ${from.name} offers ${to.name} a trade</h2>
        <div class="trade-summary">
          <div class="trade-side">
            <h3>${to.name} receives:</h3>
            <ul>${side(deal.giveProps || [], deal.giveMoney || 0, deal.giveJailCards || 0)}</ul>
          </div>
          <div class="trade-arrow">↔️</div>
          <div class="trade-side">
            <h3>${to.name} gives:</h3>
            <ul>${side(deal.getProps || [], deal.getMoney || 0, deal.getJailCards || 0)}</ul>
          </div>
        </div>
        <div class="deed-actions">
          <button class="btn btn-success" id="trade-yes">${to.name}: Accept</button>
          <button class="btn btn-danger" id="trade-no">${to.name}: Decline</button>
        </div>
      </div>`;

    this.showModal(html);
    document.getElementById('trade-yes').addEventListener('click', () => {
      this.closeModal();
      onAccept();
    });
    document.getElementById('trade-no').addEventListener('click', () => {
      this.closeModal();
      onDecline();
    });
  }

  /* The speed die's triple: any square on the board, so it is a list. */
  showChooseSpaceModal(playerId, onPick) {
    const game = this.game;
    const player = game.players[playerId];
    const options = BOARD_SPACES.map(space =>
      `<option value="${space.id}">${space.id}. ${space.name}</option>`).join('');

    const html = `
      <div class="choose-space-modal">
        <h2>🎲 Triple!</h2>
        <p>${player.name} may move to any space on the board.</p>
        <label class="choose-space-label">
          Move to:
          <select id="anywhere-space">${options}</select>
        </label>
        <div class="deed-actions">
          <button class="btn btn-success" id="anywhere-go">Move there</button>
        </div>
      </div>`;

    this.showModal(html);
    document.getElementById('anywhere-go').addEventListener('click', () => {
      const value = parseInt(document.getElementById('anywhere-space').value, 10);
      this.closeModal();
      onPick(value);
    });
  }

  /* The end of the game, with the game itself attached: who bled whom, what
     the dice did, and how the money actually ended up. A trophy and a reload
     button threw all of that away. */
  /* Conceding is irreversible, so it asks first — and says what it means: the
     assets go to the bank, not to whoever you are losing to. */
  showConcedeModal() {
    const game = this.game;
    const mine = this.seatsHere();
    if (!mine.length) return;

    const options = mine.map(p =>
      `<option value="${p.id}">${p.token.emoji} ${p.name}</option>`).join('');

    const html = `
      <div class="concede-modal">
        <h2>🏳️ Concede</h2>
        <p>Everything owned goes back to the bank, and the game carries on
           without them.</p>
        ${mine.length > 1 ? `<label class="choose-space-label">Who is giving up?
          <select id="concede-who">${options}</select></label>` : ''}
        <div class="deed-actions">
          <button class="btn btn-danger" id="concede-yes">Concede</button>
          <button class="btn btn-secondary" id="concede-no">Keep playing</button>
        </div>
      </div>`;

    this.showModal(html);
    document.getElementById('concede-no').addEventListener('click', () => this.closeModal());
    document.getElementById('concede-yes').addEventListener('click', () => {
      const pick = document.getElementById('concede-who');
      const id = pick ? parseInt(pick.value, 10) : mine[0].id;
      this.closeModal();
      game.concede(id);
    });
  }

  /* What is different about this particular game, listed where the standard
     rent numbers are. A house rule you cannot see is one you will argue about. */
  renderRulesInForce() {
    const box = document.getElementById('rules-in-force');
    if (!box) return;
    const o = this.game.options || {};
    const lines = [];

    if (o.freeParkingPot !== false) lines.push(['Free Parking pot', 'on']);
    if (o.noAuctions) lines.push(['Auctions', 'off']);
    if (o.exactGoBonus) lines.push(['Exact landing on GO', '$400']);
    if (o.noRentInJail) lines.push(['Rent while in jail', 'none']);
    if (o.shortGame) lines.push(['Short game', 'dealt 2 each']);
    if (o.speedDie) lines.push(['Speed die', 'in play']);
    if (o.startingCash && o.startingCash !== 1500) lines.push(['Starting cash', `$${o.startingCash}`]);
    if (o.turnLimit) lines.push(['Round limit', String(o.turnLimit)]);
    if (o.timeLimit) lines.push(['Time limit', `${o.timeLimit} min`]);
    if (o.theme && o.theme !== 'classic' && typeof BOARD_THEMES !== 'undefined') {
      lines.push(['Board', BOARD_THEMES[o.theme] ? BOARD_THEMES[o.theme].label : o.theme]);
    }
    if (!lines.length) lines.push(['Standard rules', '✓']);

    box.innerHTML = lines
      .map(([k, v]) => `<div class="ref-item"><span>${k}</span><span>${v}</span></div>`)
      .join('');
  }

  showGameOverModal(winner, info = {}) {
    const game = this.game;
    const standings = info.standings || (game.standings ? game.standings() : []);
    const stats = game.stats || { rolls: [], doubles: 0 };
    const money = (n) => `$${(n || 0).toLocaleString()}`;

    const rows = standings.map((entry, i) => {
      const p = entry.player;
      const st = entry.stats || {};
      return `
        <tr class="${p.bankrupt ? 'out' : ''} ${i === 0 && !p.bankrupt ? 'winner' : ''}">
          <td>${p.bankrupt ? '—' : i + 1}</td>
          <td><span class="score-token" style="background:${p.color}">${p.token.emoji}</span> ${p.name}${p.isAI ? ' 🤖' : ''}</td>
          <td>${p.bankrupt ? (p.conceded ? 'Conceded' : 'Bankrupt') : money(entry.netWorth)}</td>
          <td>${money(p.money)}</td>
          <td>${p.properties.length}</td>
          <td>${money(st.rentCollected)}</td>
          <td>${money(st.rentPaid)}</td>
          <td>${money(st.biggestRent)}</td>
          <td>${st.housesBuilt || 0}</td>
          <td>${st.timesInJail || 0}</td>
        </tr>`;
    }).join('');

    // A dice histogram is a cheap way to settle the "these dice hate me"
    // argument that every game of this ends in.
    const rolls = stats.rolls || [];
    const peak = Math.max(1, ...rolls.slice(2));
    const histogram = rolls.map((count, total) => {
      if (total < 2) return '';
      return `<div class="roll-bar" title="${count} × ${total}">
                <div class="roll-fill" style="height:${Math.round((count / peak) * 100)}%"></div>
                <span class="roll-label">${total}</span>
              </div>`;
    }).join('');

    const minutes = Math.max(1, Math.round((game.elapsedMs ? game.elapsedMs() : 0) / 60000));

    const html = `
      <div class="gameover-modal">
        <div class="trophy">🏆</div>
        <h1>${winner.name} wins!</h1>
        <p class="gameover-token" style="color:${winner.color}">${winner.token.emoji}</p>
        <p class="gameover-reason">${info.reason ? `Won on ${info.reason}` : ''} ·
           ${game.turnNumber || 0} rounds · ${minutes} min</p>

        <div class="scoreboard-wrap">
          <table class="scoreboard">
            <thead>
              <tr>
                <th>#</th><th>Player</th><th>Net worth</th><th>Cash</th>
                <th>Deeds</th><th>Rent in</th><th>Rent out</th><th>Biggest rent</th>
                <th>Built</th><th>Jail</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div class="dice-histogram">
          <div class="quick-ref-title">Dice rolled (${stats.doubles || 0} doubles)</div>
          <div class="roll-bars">${histogram}</div>
        </div>

        <div class="deed-actions">
          <button class="btn btn-primary" id="gameover-again">Play again</button>
        </div>
      </div>`;

    this.showModal(html);
    document.getElementById('gameover-again')?.addEventListener('click', () => {
      if (typeof Save !== 'undefined') Save.clear();
      location.reload();
    });
  }

  addGameLog(message) {
    /* The game keeps its own copy: it is what a guest is sent, and what a
       saved game comes back with. The panel used to be the only record, so
       both arrived empty. */
    if (this.game && Array.isArray(this.game.log)) {
      this.game.log.push(message);
      if (this.game.log.length > 300) this.game.log.shift();
    }
    this.renderLogEntry(message);
  }

  renderLogEntry(message) {
    const log = document.getElementById('game-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span> ${message}`;
    log.insertBefore(entry, log.firstChild);
    if (log.children.length > 100) log.lastChild.remove();
  }

  /* A guest rebuilds the whole panel from the snapshot's log rather than
     appending, because it only ever sees the last stretch of it. */
  replaceGameLog(lines) {
    const log = document.getElementById('game-log');
    if (!log) return;
    log.innerHTML = '';
    (lines || []).slice().reverse().forEach(line => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = line;
      log.appendChild(entry);
    });
  }
}
