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
    });

    // Move player tokens
    this.updateTokens();
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
      panel.innerHTML = `
        <div class="panel-header">
          <span class="player-token-sm" style="background:${player.color}">${player.token.emoji}</span>
          <span class="player-name">${player.isAI ? '🤖 ' : ''}${player.name}</span>
          ${player.isAI ? `<span class="ai-badge">CPU·${diffLabel}</span>` : ''}
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
      posEl.textContent = space ? space.name : '';
    }
  }

  updateActionButtons() {
    const game = this.game;
    const player = game.players[game.currentPlayer];
    const isAI = player?.isAI;

    const rollBtn = document.getElementById('btn-roll');
    const endBtn = document.getElementById('btn-end-turn');
    const buildBtn = document.getElementById('btn-build');
    const tradeBtn = document.getElementById('btn-trade');

    if (isAI) {
      // Disable all buttons during AI turn
      if (rollBtn) rollBtn.disabled = true;
      if (endBtn) endBtn.disabled = true;
      if (buildBtn) buildBtn.disabled = true;
      if (tradeBtn) tradeBtn.disabled = true;
    } else {
      if (rollBtn) rollBtn.disabled = !game.canRoll();
      if (endBtn) endBtn.disabled = !game.canEndTurn();
      if (buildBtn) buildBtn.disabled = game.phase !== 'action' && game.phase !== 'rolled';
      if (tradeBtn) tradeBtn.disabled = game.phase !== 'action' && game.phase !== 'rolled';
    }
  }

  // ── Modals ───────────────────────────────────────────────
  showModal(html, options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = html;
    overlay.classList.add('active');

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
  }

  showPropertyModal(spaceId) {
    const space = BOARD_SPACES[spaceId];
    const prop = this.game.state.properties[spaceId];
    if (!space || !prop) return;

    const owner = prop.owner !== null ? this.game.players[prop.owner] : null;
    const grp = space.group ? COLOR_GROUPS[space.group] : null;
    const isCurrentOwner = prop.owner === this.game.currentPlayer;
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

  showAuctionModal(spaceId) {
    const space = BOARD_SPACES[spaceId];
    const game = this.game;
    const activePlayers = game.players.filter(p => !p.bankrupt);
    let currentBidder = 0;
    let highestBid = 0;
    let highestBidder = -1;
    let passed = new Set();

    const render = () => {
      const bidder = activePlayers[currentBidder % activePlayers.length];

      // AI auto-bids
      if (bidder.isAI) {
        const ai = game.getAI(bidder.id);
        if (ai && !passed.has(bidder.id)) {
          setTimeout(() => {
            const bid = ai.decideAuctionBid(spaceId, highestBid, game);
            if (bid > highestBid && bid <= bidder.money) {
              highestBid = bid;
              highestBidder = bidder.id;
              this.showToast(`🤖 ${bidder.name} bids $${bid}!`, 'info');
              game.ui.addGameLog(`🤖 ${bidder.name} bids $${bid} in auction`);
            } else {
              passed.add(bidder.id);
              this.showToast(`🤖 ${bidder.name} passes.`, 'info');
            }
            advance();
          }, 500);
        } else {
          advance();
        }
        return;
      }

      const html = `
        <div class="auction-modal">
          <h2>🔨 Auction: ${space.name}</h2>
          <div class="auction-info">
            <div class="current-bid">Current Bid: <strong>$${highestBid}</strong></div>
            ${highestBidder >= 0 ? `<div class="highest-bidder">Highest: <strong>${game.players[highestBidder].name}</strong></div>` : ''}
          </div>
          <div class="bidder-turn">
            <span class="player-token-sm" style="background:${bidder.color}">${bidder.token.emoji}</span>
            <strong>${bidder.name}'s</strong> turn to bid (Balance: $${bidder.money.toLocaleString()})
          </div>
          ${passed.has(bidder.id) ? '<p class="passed-label">Already Passed</p>' : `
            <div class="bid-controls">
              <input type="number" id="bid-amount" min="${highestBid + 1}" max="${bidder.money}" value="${highestBid + 10}" step="10" class="bid-input">
              <button class="btn btn-success" id="bid-submit">Place Bid</button>
              <button class="btn btn-danger" id="bid-pass">Pass</button>
            </div>
          `}
        </div>`;

      document.getElementById('modal-content').innerHTML = html;

      if (!passed.has(bidder.id)) {
        document.getElementById('bid-submit')?.addEventListener('click', () => {
          const amt = parseInt(document.getElementById('bid-amount').value);
          if (amt > highestBid && amt <= bidder.money) {
            highestBid = amt;
            highestBidder = bidder.id;
            advance();
          }
        });
        document.getElementById('bid-pass')?.addEventListener('click', () => {
          passed.add(bidder.id);
          advance();
        });
      } else {
        advance();
      }
    };

    const advance = () => {
      currentBidder++;
      const remaining = activePlayers.filter(p => !passed.has(p.id));
      if (remaining.length === 0 || (remaining.length === 1 && highestBidder >= 0)) {
        // Auction over
        if (highestBidder >= 0 && highestBid > 0) {
          game.purchaseProperty(highestBidder, spaceId, highestBid);
          this.closeModal();
          this.showToast(`${game.players[highestBidder].name} won auction for ${space.name} at $${highestBid}!`, 'success');
        } else {
          this.closeModal();
          this.showToast(`${space.name} was not sold.`, 'info');
        }
        game.endLandAction();
        return;
      }
      // Skip passed players
      while (passed.has(activePlayers[currentBidder % activePlayers.length].id)) {
        currentBidder++;
      }
      setTimeout(render, 100);
    };

    document.getElementById('modal-overlay').classList.add('active');
    render();
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
          <h2>⚠️ Raise Funds!</h2>
          <div class="debt-info">
            <div class="debt-amount">You owe <strong>$${amountOwed.toLocaleString()}</strong> to ${creditorName}</div>
            <div class="debt-reason">${reason}</div>
            <div class="debt-balance">Your cash: <strong>$${player.money.toLocaleString()}</strong></div>
            ${!canPay ? `<div class="debt-deficit">Still need: <strong class="deficit-amount">$${deficit.toLocaleString()}</strong></div>` : ''}
          </div>
          <div class="raise-funds-actions">
            ${sellable.length ? `<h3>Sell Buildings</h3><div class="build-list">${sellable.map(id => {
              const sp = BOARD_SPACES[id];
              const pr = game.state.properties[id];
              const val = Math.floor((sp.housePrice || 0) / 2);
              return `<button class="btn btn-warning build-action-btn" data-action="sell" data-id="${id}">
                ${sp.name} (${pr.houses === 5 ? '🏨' : '🏠x' + pr.houses}) → +$${val}
              </button>`;
            }).join('')}</div>` : ''}
            ${mortgageable.length ? `<h3>Mortgage Properties</h3><div class="build-list">${mortgageable.map(id => {
              const sp = BOARD_SPACES[id];
              return `<button class="btn btn-danger build-action-btn" data-action="mortgage" data-id="${id}">
                ${sp.name} → +$${sp.mortgage}
              </button>`;
            }).join('')}</div>` : ''}
            ${!sellable.length && !mortgageable.length ? '<p class="no-options">No more assets to liquidate.</p>' : ''}
          </div>
          <div class="deed-actions">
            ${canPay ? `<button class="btn btn-success" id="debt-pay">✅ Pay $${amountOwed}</button>` : ''}
            <button class="btn btn-danger" id="debt-bankrupt">💀 Declare Bankruptcy</button>
          </div>
        </div>`;

      document.getElementById('modal-content').innerHTML = html;

      // Action handlers
      document.querySelectorAll('.build-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const id = parseInt(btn.dataset.id);
          if (action === 'sell') game.sellHouse(id);
          else if (action === 'mortgage') game.mortgageProperty(id);
          // Re-render to update amounts
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

  showTradeModal() {
    const game = this.game;
    const currentPlayer = game.players[game.currentPlayer];
    const otherPlayers = game.players.filter((p, i) => i !== game.currentPlayer && !p.bankrupt);

    if (otherPlayers.length === 0) {
      this.showToast('No other players to trade with!', 'warning');
      return;
    }

    let selectedPartner = otherPlayers[0].id;
    let offerProps = new Set();
    let receiveProps = new Set();
    let offerMoney = 0;
    let receiveMoney = 0;
    let offerJailCards = 0;
    let receiveJailCards = 0;

    const render = () => {
      const partner = game.players[selectedPartner];
      // Include ALL properties (mortgaged and unmortgaged), but exclude ones with buildings
      const myProps = currentPlayer.properties.filter(id => {
        const prop = game.state.properties[id];
        return (prop.houses || 0) === 0; // Can't trade properties with buildings
      });
      const partnerProps = partner.properties.filter(id => {
        const prop = game.state.properties[id];
        return (prop.houses || 0) === 0;
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

      const html = `
        <div class="trade-modal">
          <h2>🤝 Trade</h2>
          <div class="trade-partner-select">
            Trade with:
            ${otherPlayers.map(p => `
              <button class="btn ${p.id === selectedPartner ? 'btn-primary' : 'btn-secondary'} partner-btn" data-id="${p.id}">
                ${p.token.emoji} ${p.name}
              </button>`).join('')}
          </div>
          <div class="trade-columns">
            <div class="trade-col">
              <h3>${currentPlayer.name} Offers</h3>
              <div class="trade-props">${makePropList(myProps, 'offer-prop', offerProps)}</div>
              ${currentPlayer.jailCards.length > 0 ? `
                <div class="trade-jail-card">
                  <label class="prop-check">
                    <input type="checkbox" id="offer-jail-card" ${offerJailCards > 0 ? 'checked' : ''}>
                    <span class="prop-badge" style="background:#4a4">🃏 Jail Card (${currentPlayer.jailCards.length} owned)</span>
                  </label>
                </div>` : ''}
              <div class="trade-money">
                <label>Cash Offer: $<input type="number" id="offer-money" value="${offerMoney}" min="0" max="${currentPlayer.money}" step="10" class="money-input"></label>
              </div>
            </div>
            <div class="trade-col">
              <h3>${partner.name} Offers</h3>
              <div class="trade-props">${makePropList(partnerProps, 'receive-prop', receiveProps)}</div>
              ${partner.jailCards.length > 0 ? `
                <div class="trade-jail-card">
                  <label class="prop-check">
                    <input type="checkbox" id="receive-jail-card" ${receiveJailCards > 0 ? 'checked' : ''}>
                    <span class="prop-badge" style="background:#4a4">🃏 Jail Card (${partner.jailCards.length} owned)</span>
                  </label>
                </div>` : ''}
              <div class="trade-money">
                <label>Cash Request: $<input type="number" id="receive-money" value="${receiveMoney}" min="0" max="${partner.money}" step="10" class="money-input"></label>
              </div>
            </div>
          </div>
          <div class="deed-actions">
            <button class="btn btn-success" id="trade-confirm">Propose Trade</button>
            <button class="btn btn-secondary" id="trade-cancel">Cancel</button>
          </div>
        </div>`;

      document.getElementById('modal-content').innerHTML = html;

      // Partner select
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

      // Confirm trade
      document.getElementById('trade-confirm').addEventListener('click', () => {
        const newOfferProps = new Set([...document.querySelectorAll('.offer-prop:checked')].map(cb => parseInt(cb.value)));
        const newReceiveProps = new Set([...document.querySelectorAll('.receive-prop:checked')].map(cb => parseInt(cb.value)));
        const newOfferMoney = parseInt(document.getElementById('offer-money').value) || 0;
        const newReceiveMoney = parseInt(document.getElementById('receive-money').value) || 0;
        const newOfferJailCards = document.getElementById('offer-jail-card')?.checked ? 1 : 0;
        const newReceiveJailCards = document.getElementById('receive-jail-card')?.checked ? 1 : 0;

        if (newOfferMoney > currentPlayer.money) {
          this.showToast("You don't have enough money!", 'error'); return;
        }
        if (newReceiveMoney > game.players[selectedPartner].money) {
          this.showToast(`${partner.name} doesn't have enough money!`, 'error'); return;
        }

        this.showTradeConfirmModal(
          currentPlayer, game.players[selectedPartner],
          [...newOfferProps], [...newReceiveProps],
          newOfferMoney, newReceiveMoney,
          newOfferJailCards, newReceiveJailCards
        );
      });
      document.getElementById('trade-cancel').addEventListener('click', () => this.closeModal());
    };

    document.getElementById('modal-overlay').classList.add('active');
    render();
  }

  showTradeConfirmModal(from, to, offerPropIds, receivePropIds, offerMoney, receiveMoney, offerJailCards = 0, receiveJailCards = 0) {
    const fmt = (ids) => ids.map(id => BOARD_SPACES[id]?.name || id).join(', ') || 'Nothing';
    const html = `
      <div class="trade-confirm-modal">
        <h2>Confirm Trade</h2>
        <div class="trade-summary">
          <div class="trade-side">
            <h3>${from.name} gives:</h3>
            <ul>
              ${offerPropIds.map(id => `<li>${BOARD_SPACES[id]?.name}${this.game.state.properties[id]?.mortgaged ? ' 🔴' : ''}</li>`).join('')}
              ${offerMoney > 0 ? `<li>$${offerMoney}</li>` : ''}
              ${offerJailCards > 0 ? '<li>🃏 Get Out of Jail Free Card</li>' : ''}
              ${offerPropIds.length === 0 && offerMoney === 0 && offerJailCards === 0 ? '<li>Nothing</li>' : ''}
            </ul>
          </div>
          <div class="trade-arrow">↔️</div>
          <div class="trade-side">
            <h3>${to.name} gives:</h3>
            <ul>
              ${receivePropIds.map(id => `<li>${BOARD_SPACES[id]?.name}${this.game.state.properties[id]?.mortgaged ? ' 🔴' : ''}</li>`).join('')}
              ${receiveMoney > 0 ? `<li>$${receiveMoney}</li>` : ''}
              ${receiveJailCards > 0 ? '<li>🃏 Get Out of Jail Free Card</li>' : ''}
              ${receivePropIds.length === 0 && receiveMoney === 0 && receiveJailCards === 0 ? '<li>Nothing</li>' : ''}
            </ul>
          </div>
        </div>
        <div class="deed-actions">
          <button class="btn btn-success" id="trade-yes">${to.name}: Accept</button>
          <button class="btn btn-danger" id="trade-no">${to.name}: Decline</button>
        </div>
      </div>`;
    document.getElementById('modal-content').innerHTML = html;

    document.getElementById('trade-yes').addEventListener('click', () => {
      this.game.executeTrade(from.id, to.id, offerPropIds, receivePropIds, offerMoney, receiveMoney, offerJailCards, receiveJailCards);
      this.closeModal();
    });
    document.getElementById('trade-no').addEventListener('click', () => {
      this.closeModal();
      this.showToast(`${to.name} declined the trade.`, 'warning');
    });
  }

  showGameOverModal(winner) {
    const html = `
      <div class="gameover-modal">
        <div class="trophy">🏆</div>
        <h1>${winner.name} Wins!</h1>
        <p style="color:${winner.color}; font-size:3rem">${winner.token.emoji}</p>
        <p>Congratulations, Monopoly Champion!</p>
        <button class="btn btn-primary" onclick="location.reload()">Play Again</button>
      </div>`;
    this.showModal(html);
  }

  addGameLog(message) {
    const log = document.getElementById('game-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span> ${message}`;
    log.insertBefore(entry, log.firstChild);
    if (log.children.length > 100) log.lastChild.remove();
  }
}
