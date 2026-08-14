/* Monopolyish — The Game class: turn flow and everything it coordinates. */

// === game.js ===
// ============================================================
//  MAIN GAME CONTROLLER
// ============================================================

class Game {
  constructor(playerNames, tokens, options = {}) {
    this.players = createPlayers(playerNames, tokens, options.aiConfigs);
    this.state = {
      properties: initProperties(),
      freeParkingPot: 0,
      housesAvailable: 32,
      hotelsAvailable: 12,
    };
    this.decks = createDecks();
    this.currentPlayer = 0;
    this.phase = 'roll'; // roll | action | rolled | landed | waiting | debt
    this.lastDiceRoll = 0;
    this.lastRoll = null;
    this.doublesCount = 0;
    this.ui = new UI(this);
    this.log = [];
    this._pendingLandAction = false;
    this._doubleRentModifier = false;
    this._utilityTenX = false;
    this._pendingDebt = null; // { playerId, amount, creditorId, reason }
    this.useFreeParkingPot = options.freeParkingPot !== false; // default ON
    this._aiRunning = false; // prevents re-entrant AI turns

    // Create AI instances for computer players
    this.aiPlayers = {};
    this.players.forEach(p => {
      if (p.isAI) {
        this.aiPlayers[p.id] = new AIPlayer(p.id, p.aiDifficulty || 'medium');
      }
    });
  }

  // ── Setup ────────────────────────────────────────────────
  init() {
    const boardContainer = document.getElementById('board-grid');
    renderBoard(boardContainer);

    // Board space click handlers
    document.getElementById('board-grid').addEventListener('click', (e) => {
      const spaceEl = e.target.closest('[data-space]');
      if (!spaceEl) return;
      const spaceId = parseInt(spaceEl.dataset.space);
      const type = spaceEl.dataset.type;
      if (['property','railroad','utility'].includes(type)) {
        this.ui.showPropertyModal(spaceId);
      }
    });

    // Button handlers
    document.getElementById('btn-roll').addEventListener('click', () => {
      if (MP.mode === 'guest') return MP.send({ kind: 'roll' });
      this.handleRoll();
    });
    document.getElementById('btn-end-turn').addEventListener('click', () => {
      if (MP.mode === 'guest') return MP.send({ kind: 'endTurn' });
      this.endTurn();
    });
    document.getElementById('btn-build').addEventListener('click', () => this.showBuildMenu());
    document.getElementById('btn-trade').addEventListener('click', () => this.ui.showTradeModal());

    this.ui.updateAll();
    this.ui.showToast(`${this.players[this.currentPlayer].name}'s turn! Roll the dice.`, 'dice');
    this.ui.addGameLog(`🎮 Game started with ${this.players.length} players!`);

    // If the first player is AI, start their turn
    if (this.isCurrentPlayerAI()) {
      setTimeout(() => this.runAITurn(), 1000);   // wrapper catches its own
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  canRoll() {
    return this.phase === 'roll' && !this.players[this.currentPlayer].bankrupt;
  }

  canEndTurn() {
    return this.phase === 'action' || this.phase === 'rolled';
  }

  getPlayerPosition(playerId) {
    return this.players[playerId].position;
  }

  isCurrentPlayerAI() {
    return this.players[this.currentPlayer]?.isAI === true;
  }

  getAI(playerId) {
    return this.aiPlayers[playerId] || null;
  }

  // ── AI Auto-play ────────────────────────────────────────
  /* The flag that stops two AI turns overlapping used to be cleared by hand at
     each of six exits. Anything that threw in between left it set for good, and
     the guard at the top then made every later AI turn a silent no-op — the
     computer simply stopped playing and nothing said why. It is now released in
     a finally, so no path can keep it.

     Rolling doubles used to re-enter by calling this method again, which is why
     the flag had to be dropped before the call. That is a loop instead: the
     flag is held for the whole run and the turn asks to go round again. */
  async runAITurn() {
    if (this._aiRunning) return;
    this._aiRunning = true;
    try {
      let again = true;
      // Three doubles sends you to jail, so this ends on its own; the count is
      // insurance against a state that says otherwise.
      for (let turns = 0; again && turns < 8; turns++) {
        again = await this._playAITurn();
      }
    } catch (err) {
      if (window.console) console.error('[monopolyish] the AI turn failed', err);
      this.ui.showToast('The computer hit a problem and skipped its turn.', 'error');
      try { if (this.canEndTurn()) this.endTurn(); } catch (e) {}
    } finally {
      this._aiRunning = false;
    }
  }

  /* One AI turn. Returns true if it earned another. */
  async _playAITurn() {
    const player = this.players[this.currentPlayer];
    const ai = this.getAI(this.currentPlayer);
    if (!ai || player.bankrupt) return false;

    this.ui.showToast(`🤖 ${player.name} is thinking...`, 'info');
    await this._wait(ai._delay());

    // Handle jail first
    if (player.inJail) {
      const jailChoice = ai.decideJail(this);
      if (jailChoice === 'card' && player.jailCards.length > 0) {
        const card = player.jailCards.pop();
        returnJailCard(this.decks, card.deckType);
        player.inJail = false;
        player.jailTurns = 0;
        this.phase = 'roll';
        this.ui.showToast(`🤖 ${player.name} used a Get Out of Jail Free card!`, 'success');
        this.ui.addGameLog(`🤖 ${player.name} used jail card`);
        this.ui.updateAll();
        await this._wait(600);
      } else if (jailChoice === 'pay' && player.money >= 50) {
        this.payMoney(this.currentPlayer, 50, 'Jail fine');
        player.inJail = false;
        player.jailTurns = 0;
        this.phase = 'roll';
        this.ui.showToast(`🤖 ${player.name} paid $50 jail fine!`, 'warning');
        this.ui.addGameLog(`🤖 ${player.name} paid jail fine`);
        this.ui.updateAll();
        await this._wait(600);
      } else {
        // Will try rolling for doubles - handled by handleRoll/handleJailRoll
        this.phase = 'roll';
        this.ui.updateAll();
      }
    }

    // Roll the dice
    if (this.phase === 'roll') {
      await this.handleRoll();
      // Wait for movement animation + landing
      await this._wait(800);
    }

    // Wait for any async landing effects (cards, etc.)
    await this._waitForPhase(['action', 'rolled', 'debt'], 5000);

    // Handle debt if AI needs to raise funds
    if (this.phase === 'debt' && this._pendingDebt) {
      await this._aiRaiseFunds();
    }

    // If bankrupt, stop
    if (player.bankrupt) return false;

    // Building phase: decide to build houses
    if (this.phase === 'action' || this.phase === 'rolled') {
      const buildActions = ai.decideBuilding(this);
      for (const spaceId of buildActions) {
        if (canBuildHouse(this.currentPlayer, spaceId, this.state)) {
          this.buildHouse(spaceId);
          await this._wait(400);
        }
      }
    }

    // End turn
    await this._wait(300);
    if (this.canEndTurn()) {
      this.endTurn();
      return false;
    }
    if (this.phase === 'roll' && this.lastRoll?.doubles && !player.inJail) {
      await this._wait(500);
      return true;                     // doubles: round again
    }
    return false;
  }

  async _aiRaiseFunds() {
    const ai = this.getAI(this._pendingDebt.playerId);
    if (!ai) return;

    const actions = ai.decideRaiseFunds(this._pendingDebt.amount, this);
    for (const act of actions) {
      if (act.action === 'sell') {
        this.sellHouse(act.spaceId);
      } else if (act.action === 'mortgage') {
        this.mortgageProperty(act.spaceId);
      }
      await this._wait(300);
    }
    // Try to resolve the debt
    this.ui.closeModal();
    this.resolveDebt();
    // If still can't pay, declare bankruptcy
    if (this._pendingDebt) {
      this.ui.closeModal();
      this.forceSettleDebt();
    }
  }

  _wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Wait until phase matches one of the targets, or timeout
  _waitForPhase(targets, timeout = 3000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (targets.includes(this.phase) || Date.now() - start > timeout) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  // ── Roll Dice ────────────────────────────────────────────
  async handleRoll() {
    if (!this.canRoll()) return;
    this.phase = 'rolling';
    this.ui.updateActionButtons();

    const d1El = document.getElementById('dice1');
    const d2El = document.getElementById('dice2');
    const result = rollDice();
    this.lastRoll = result;
    this.lastDiceRoll = result.total;

    await animateDice(d1El, d2El, result);

    const player = this.players[this.currentPlayer];
    const doublesMsg = result.doubles ? ' <strong>DOUBLES!</strong>' : '';
    this.ui.showToast(`${player.name} rolled ${result.d1} + ${result.d2} = ${result.total}${doublesMsg}`, 'dice');
    this.ui.addGameLog(`🎲 ${player.name} rolled ${result.d1}+${result.d2}=${result.total}${doublesMsg}`);

    if (result.doubles) {
      this.doublesCount++;
      if (this.doublesCount >= 3) {
        this.ui.showToast('Three doubles in a row! Go to Jail!', 'warning');
        this.sendToJail(this.currentPlayer);
        return;
      }
    } else {
      this.doublesCount = 0;
    }

    if (player.inJail) {
      await this.handleJailRoll(result);
      return;
    }

    await this.movePlayer(this.currentPlayer, result.total);
  }

  async handleJailRoll(result) {
    const player = this.players[this.currentPlayer];
    if (result.doubles) {
      player.inJail = false;
      player.jailTurns = 0;
      this.ui.showToast(`${player.name} rolled doubles and is free from Jail!`, 'success');
      this.ui.addGameLog(`🔓 ${player.name} escaped jail with doubles!`);
      await this.movePlayer(this.currentPlayer, result.total);
    } else {
      player.jailTurns++;
      if (player.jailTurns >= 3) {
        // Must pay on 3rd turn
        this.ui.showToast(`${player.name} must pay $50 fine to leave jail!`, 'warning');
        this.payMoney(this.currentPlayer, 50, 'Jail fine');
        player.inJail = false;
        player.jailTurns = 0;
        await this.movePlayer(this.currentPlayer, result.total);
      } else {
        this.ui.showToast(`${player.name} stays in Jail (turn ${player.jailTurns}/3).`, 'info');
        this.ui.addGameLog(`🔒 ${player.name} stays in jail (turn ${player.jailTurns})`);
        this.phase = 'action';
        this.ui.updateAll();
      }
    }
  }

  // ── Movement (animated step-by-step) ─────────────────────
  async movePlayer(playerId, steps, opts = {}) {
    const player = this.players[playerId];
    const startPos = player.position;
    let passedGo = false;

    // Animate step by step
    for (let i = 1; i <= steps; i++) {
      const prevPos = player.position;
      player.position = (startPos + i) % 40;

      // Detect crossing GO (position wraps from 39→0)
      if (player.position < prevPos) {
        passedGo = true;
      }

      this.ui.updateBoard();
      // Slight deceleration at end of movement
      const delay = 80 + Math.floor(40 * (i / steps));
      await new Promise(r => setTimeout(r, delay));
    }

    if (passedGo && !opts.noGo) {
      this.collectMoney(playerId, 200, 'Passed GO!');
      this.ui.showToast(`${player.name} passed GO! Collect $200`, 'money');
      this.ui.addGameLog(`💰 ${player.name} passed GO and collected $200`);
    }

    this.landOnSpace(playerId, player.position, opts);
  }

  async movePlayerTo(playerId, targetPos, collectGo = true, opts = {}) {
    const player = this.players[playerId];
    const startPos = player.position;

    // Calculate forward steps (always move forward around the board)
    let forwardSteps = (targetPos - startPos + 40) % 40;

    // Detect backwards movement (e.g. "Go Back 3 Spaces" card)
    // If forward distance > 37 spaces, it's really a short backward move
    let backward = false;
    let steps = forwardSteps;
    if (forwardSteps > 37) {
      backward = true;
      steps = (startPos - targetPos + 40) % 40;
    }

    if (steps === 0) {
      this._doubleRentModifier = opts.doubleRent || false;
      this._utilityTenX = opts.utilityTenX || false;
      this.landOnSpace(playerId, targetPos, opts);
      return;
    }

    let passedGo = false;

    for (let i = 1; i <= steps; i++) {
      const prevPos = player.position;
      if (backward) {
        player.position = (startPos - i + 40) % 40;
      } else {
        player.position = (startPos + i) % 40;
      }

      if (!backward && player.position < prevPos) {
        passedGo = true;
      }

      this.ui.updateBoard();
      const speed = Math.max(40, 100 - steps * 2);
      await new Promise(r => setTimeout(r, speed));
    }

    if (passedGo && collectGo && targetPos !== 10) {
      this.collectMoney(playerId, 200, 'Passed GO!');
      this.ui.showToast(`${player.name} passed GO! Collect $200`, 'money');
    }

    this._doubleRentModifier = opts.doubleRent || false;
    this._utilityTenX = opts.utilityTenX || false;
    this.landOnSpace(playerId, targetPos, opts);
  }

  // ── Land on Space ────────────────────────────────────────
  landOnSpace(playerId, spaceId, opts = {}) {
    const space = BOARD_SPACES[spaceId];
    const player = this.players[playerId];
    this.ui.addGameLog(`📍 ${player.name} landed on ${space.name}`);

    switch (space.type) {
      case 'go':
        // Already collected $200 on pass
        this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
        this.ui.updateAll();
        break;

      case 'property':
      case 'railroad':
      case 'utility':
        this.handlePropertyLanding(playerId, spaceId);
        return;

      case 'tax':
        this.ui.showToast(`${player.name} pays ${space.name}: $${space.amount}`, 'warning');
        this.ui.addGameLog(`💸 ${player.name} paid ${space.name}: $${space.amount}`);
        this.payToFreeParkingPot(playerId, space.amount);
        this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
        this.ui.updateAll();
        break;

      case 'chance':
        this.handleCardLanding(playerId, 'chance');
        return;

      case 'community':
        this.handleCardLanding(playerId, 'community');
        return;

      case 'gotojail':
        this.sendToJail(playerId);
        return;

      case 'jail':
        // Just visiting
        this.ui.showToast(`${player.name} is just visiting Jail.`, 'info');
        this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
        this.ui.updateAll();
        break;

      case 'freeparking':
        if (this.useFreeParkingPot) {
          const pot = this.state.freeParkingPot;
          if (pot > 0) {
            this.collectMoney(playerId, pot, 'Free Parking pot!');
            this.state.freeParkingPot = 0;
            this.ui.showToast(`${player.name} collected $${pot} from Free Parking!`, 'money');
            this.ui.addGameLog(`🅿️ ${player.name} collected $${pot} from Free Parking`);
          } else {
            this.ui.showToast(`${player.name} lands on Free Parking. Pot is empty.`, 'info');
          }
        } else {
          this.ui.showToast(`${player.name} rests on Free Parking.`, 'info');
        }
        this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
        this.ui.updateAll();
        break;

      default:
        this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
        this.ui.updateAll();
    }
  }

  handlePropertyLanding(playerId, spaceId) {
    const prop = this.state.properties[spaceId];
    const space = BOARD_SPACES[spaceId];
    const player = this.players[playerId];

    if (!prop) {
      this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
      this.ui.updateAll();
      return;
    }

    if (prop.owner === null) {
      // Unowned — AI auto-decides, human gets modal
      if (player.isAI) {
        const ai = this.getAI(playerId);
        const decision = ai.decideBuy(spaceId, this);
        if (decision === 'buy' && player.money >= space.price) {
          this.purchaseProperty(playerId, spaceId, space.price);
          this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
          this.ui.updateAll();
        } else {
          // AI sends to auction
          this.ui.showToast(`🤖 ${player.name} declines to buy ${space.name}.`, 'info');
          this.ui.addGameLog(`🤖 ${player.name} passed on ${space.name}`);
          MP.hostOnlyPrompt('auction bidding'); this.ui.showAuctionModal(spaceId);
        }
      } else {
        // Whoever landed here answers, wherever they happen to be sitting.
        const doBuy = () => {
          // If they cannot pay, the property goes to auction rather than the
          // turn stopping on a purchase that did not happen.
          if (!this.purchaseProperty(playerId, spaceId, space.price)) return doAuction();
          this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
          this.ui.updateAll();
        };
        const doAuction = () => { MP.hostOnlyPrompt('auction bidding'); this.ui.showAuctionModal(spaceId); };
        MP.prompt(player.id, 'buy', { spaceId }, {
          local: () => this.ui.showBuyModal(spaceId, doBuy, doAuction),
          onReply: (answer) => (answer === 'buy' ? doBuy() : doAuction())
        });
      }
    } else if (prop.owner === playerId) {
      // Own it
      this.ui.showToast(`${player.name} owns ${space.name}.`, 'info');
      this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
      this.ui.updateAll();
    } else if (prop.mortgaged) {
      // Mortgaged - no rent
      this.ui.showToast(`${space.name} is mortgaged. No rent owed.`, 'info');
      this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
      this.ui.updateAll();
    } else {
      // Pay rent
      let rent = calculateRent(spaceId, { ...this.state, lastDiceRoll: this.lastDiceRoll });

      // Double rent modifiers from cards
      if (this._doubleRentModifier) {
        rent *= 2;
        this._doubleRentModifier = false;
      }
      if (this._utilityTenX && space.type === 'utility') {
        rent = 10 * this.lastDiceRoll;
        this._utilityTenX = false;
      }

      const owner = this.players[prop.owner];
      this.ui.showToast(`${player.name} pays $${rent} rent to ${owner.name} for ${space.name}!`, 'money');
      this.ui.addGameLog(`💵 ${player.name} paid $${rent} rent to ${owner.name}`);

      const actualPaid = this.payRent(playerId, prop.owner, rent);

      if (player.bankrupt) return;
      this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
      this.ui.updateAll();
    }
  }

  handleCardLanding(playerId, type) {
    const card = drawCard(this.decks, type);
    this.ui.addGameLog(`🃏 ${this.players[playerId].name} drew: "${card.text}"`);

    const executeCard = () => {
      card.action(this);
      if (!this._pendingLandAction) {
        this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
        this.ui.updateAll();
      }
      this._pendingLandAction = false;
    };

    if (this.players[playerId].isAI) {
      // Show card briefly then auto-execute
      this.ui.showCardModal(card, type, () => {});
      setTimeout(() => {
        this.ui.closeModal();
        executeCard();
      }, 1200);
    } else {
      this.ui.showCardModal(card, type, executeCard);
    }
  }

  endLandAction() {
    this._pendingLandAction = false;
    this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
    this.ui.updateAll();
  }

  // ── Jail ─────────────────────────────────────────────────
  sendToJail(playerId) {
    const player = this.players[playerId];
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    this.doublesCount = 0;
    this.ui.showToast(`${player.name} is sent to Jail!`, 'error');
    this.ui.addGameLog(`🔒 ${player.name} went to jail!`);
    this.ui.updateBoard();
    this.phase = 'action';
    this.ui.updateAll();
  }

  handleJailOptions() {
    const player = this.players[this.currentPlayer];
    // Whoever is in jail answers, wherever they are sitting.
    const payFine = () => {
      this.payMoney(this.currentPlayer, 50, 'Jail fine');
      player.inJail = false;
      player.jailTurns = 0;
      this.phase = 'roll';
      this.ui.updateAll();
      this.ui.showToast(`${player.name} paid $50 fine and is free!`, 'success');
    };
    const useJailCard = () => {
      const card = player.jailCards.pop();
      returnJailCard(this.decks, card.deckType);
      player.inJail = false;
      player.jailTurns = 0;
      this.phase = 'roll';
      this.ui.updateAll();
      this.ui.showToast(`${player.name} used Get Out of Jail Free card!`, 'success');
    };
    const rollForIt = () => {
      this.phase = 'roll';
      this.ui.updateAll();
    };
    MP.prompt(playerId, 'jail', { playerId }, {
      local: () => this.ui.showJailModal(player, payFine, useJailCard, rollForIt),
      onReply: (answer) => {
        if (answer === 'pay') payFine();
        else if (answer === 'card') useJailCard();
        else rollForIt();
      }
    });
  }

  // ── Money Transactions ───────────────────────────────────
  collectMoney(playerId, amount, reason) {
    this.players[playerId].money += amount;
    this.ui.updatePlayerPanels();
  }

  payMoney(playerId, amount, reason) {
    const player = this.players[playerId];
    if (player.money >= amount) {
      player.money -= amount;
      if (this.useFreeParkingPot) {
        this.state.freeParkingPot += amount;
      }
      this.ui.updatePlayerPanels();
    } else {
      // Can't afford — check if assets can cover it
      if (player.money + this.getMaxLiquidValue(playerId) < amount) {
        // Totally insolvent — auto-bankrupt to bank
        this.declareBankruptcy(playerId, -1);
      } else {
        // Has enough assets — show raise funds modal
        this._pendingDebt = { playerId, amount, creditorId: -1, reason };
        this.phase = 'debt';
        MP.hostOnlyPrompt('raising funds'); this.ui.showRaiseFundsModal(playerId, amount, -1, reason);
      }
    }
  }

  payRent(payerId, receiverId, amount) {
    const payer = this.players[payerId];
    const receiver = this.players[receiverId];

    if (payer.money >= amount) {
      payer.money -= amount;
      receiver.money += amount;
      this.ui.updatePlayerPanels();
    } else {
      // Can't afford — check if assets can cover it
      if (payer.money + this.getMaxLiquidValue(payerId) < amount) {
        // Totally insolvent — give what they have and bankrupt
        receiver.money += payer.money;
        payer.money = 0;
        this.declareBankruptcy(payerId, receiverId);
      } else {
        // Has enough assets — show raise funds modal
        this._pendingDebt = { playerId: payerId, amount, creditorId: receiverId, reason: `Rent to ${receiver.name}` };
        this.phase = 'debt';
        MP.hostOnlyPrompt('raising funds'); this.ui.showRaiseFundsModal(payerId, amount, receiverId, `Rent to ${receiver.name}`);
      }
    }
  }

  // Called from Raise Funds modal after player sells/mortgages
  resolveDebt() {
    if (!this._pendingDebt) return;
    const { playerId, amount, creditorId } = this._pendingDebt;
    const player = this.players[playerId];

    if (player.money >= amount) {
      // Can now afford it — pay the debt
      player.money -= amount;
      if (creditorId >= 0) {
        this.players[creditorId].money += amount;
      } else if (this.useFreeParkingPot) {
        this.state.freeParkingPot += amount;
      }
      this._pendingDebt = null;
      this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
      this.ui.showToast(`${player.name} paid the debt of $${amount}!`, 'success');
      this.ui.updateAll();
    } else {
      // Still can't afford — keep the modal open
      this.ui.showToast(`Still need $${amount - player.money} more!`, 'warning');
    }
  }

  // Called when player gives up in Raise Funds modal
  forceSettleDebt() {
    if (!this._pendingDebt) return;
    const { playerId, creditorId } = this._pendingDebt;
    this._pendingDebt = null;
    this.declareBankruptcy(playerId, creditorId);
  }

  payToFreeParkingPot(playerId, amount) {
    const player = this.players[playerId];
    if (player.money >= amount) {
      player.money -= amount;
      if (this.useFreeParkingPot) {
        this.state.freeParkingPot += amount;
      }
      this.ui.updatePlayerPanels();
    } else {
      // Can't afford the tax
      if (player.money + this.getMaxLiquidValue(playerId) < amount) {
        this.declareBankruptcy(playerId, -1);
      } else {
        this._pendingDebt = { playerId, amount, creditorId: -1, reason: 'Tax payment' };
        this.phase = 'debt';
        MP.hostOnlyPrompt('raising funds'); this.ui.showRaiseFundsModal(playerId, amount, -1, 'Tax payment');
      }
    }
  }

  getMaxLiquidValue(playerId) {
    const player = this.players[playerId];
    let total = 0;
    player.properties.forEach(id => {
      const prop = this.state.properties[id];
      const space = BOARD_SPACES[id];
      if (prop && space) {
        if (!prop.mortgaged) total += space.mortgage || 0;
        if (prop.houses > 0) total += prop.houses * ((space.housePrice || 0) / 2);
      }
    });
    return total;
  }

  // ── Property ─────────────────────────────────────────────
  /* The only way a property changes hands for money, and therefore the only
     sensible place to ask whether the money is there. It used to ask nowhere:
     the AI checked before calling and the local modal only drew a Buy button
     when the player could afford it, but an answer arriving from another device
     was taken as given — so a guest could buy anything and go quietly into a
     negative balance, without the debt and bankruptcy machinery ever running. */
  purchaseProperty(playerId, spaceId, price) {
    const player = this.players[playerId];
    const space = BOARD_SPACES[spaceId];

    if (player.money < price) {
      this.ui.showToast(`${player.name} cannot afford ${space.name}.`, 'error');
      this.ui.addGameLog(`${player.name} could not afford ${space.name} ($${price})`);
      return false;
    }

    player.money -= price;
    player.properties.push(spaceId);
    this.state.properties[spaceId].owner = playerId;
    this.ui.showToast(`${player.name} bought ${space.name} for $${price}!`, 'success');
    this.ui.addGameLog(`🏠 ${player.name} bought ${space.name} for $${price}`);
    this.ui.updateAll();
    return true;
  }

  buildHouse(spaceId) {
    if (!canBuildHouse(this.currentPlayer, spaceId, this.state)) {
      this.ui.showToast('Cannot build here!', 'error');
      return;
    }
    const space = BOARD_SPACES[spaceId];
    const player = this.players[this.currentPlayer];
    const prop = this.state.properties[spaceId];
    const cost = space.housePrice;

    if (player.money < cost) {
      this.ui.showToast(`Not enough money to build! Need $${cost}`, 'error');
      return;
    }

    player.money -= cost;
    prop.houses++;
    const isHotel = prop.houses === 5;

    if (isHotel) {
      // Upgrading to hotel: return 4 houses, consume 1 hotel
      this.state.housesAvailable += 4;
      this.state.hotelsAvailable--;
    } else {
      // Building a house: consume 1 house
      this.state.housesAvailable--;
    }

    this.ui.showToast(
      `${player.name} built a ${isHotel ? '🏨 hotel' : '🏠 house'} on ${space.name} for $${cost}! (🏠${this.state.housesAvailable} 🏨${this.state.hotelsAvailable} left)`,
      'success'
    );
    this.ui.addGameLog(`🏠 ${player.name} built on ${space.name}`);
    this.ui.updateAll();
  }

  sellHouse(spaceId) {
    if (!canSellHouse(this.currentPlayer, spaceId, this.state)) {
      this.ui.showToast('Cannot sell here!', 'error');
      return;
    }
    const space = BOARD_SPACES[spaceId];
    const player = this.players[this.currentPlayer];
    const prop = this.state.properties[spaceId];
    const value = Math.floor((space.housePrice || 0) / 2);

    if (prop.houses === 5) {
      // Selling a hotel
      if (this.state.housesAvailable >= 4) {
        // Downgrade to 4 houses
        prop.houses = 4;
        this.state.hotelsAvailable++;
        this.state.housesAvailable -= 4;
      } else {
        // Not enough houses to downgrade — must sell hotel entirely
        prop.houses = 0;
        this.state.hotelsAvailable++;
        // Refund for selling 5 levels of building
        player.money += value * 4; // extra 4 levels beyond the one below
      }
      player.money += value;
    } else {
      player.money += value;
      prop.houses--;
      this.state.housesAvailable++;
    }

    this.ui.showToast(`${player.name} sold a building on ${space.name} for $${value}`, 'info');
    this.ui.updateAll();
  }

  mortgageProperty(spaceId) {
    const space = BOARD_SPACES[spaceId];
    const prop = this.state.properties[spaceId];
    const player = this.players[this.currentPlayer];

    if (prop.mortgaged || (prop.houses || 0) > 0) {
      this.ui.showToast('Cannot mortgage this property!', 'error');
      return;
    }

    prop.mortgaged = true;
    player.money += space.mortgage;
    this.ui.showToast(`${player.name} mortgaged ${space.name} for $${space.mortgage}`, 'warning');
    this.ui.addGameLog(`🔴 ${player.name} mortgaged ${space.name}`);
    this.ui.updateAll();
  }

  unmortgageProperty(spaceId) {
    const space = BOARD_SPACES[spaceId];
    const prop = this.state.properties[spaceId];
    const player = this.players[this.currentPlayer];
    const cost = Math.floor(space.mortgage * 1.1);

    if (!prop.mortgaged || player.money < cost) {
      this.ui.showToast('Cannot unmortgage!', 'error');
      return;
    }

    prop.mortgaged = false;
    player.money -= cost;
    this.ui.showToast(`${player.name} unmortgaged ${space.name} for $${cost}`, 'success');
    this.ui.addGameLog(`🟢 ${player.name} unmortgaged ${space.name}`);
    this.ui.updateAll();
  }

  // ── Build Menu ───────────────────────────────────────────
  showBuildMenu() {
    const player = this.players[this.currentPlayer];
    const buildable = player.properties.filter(id => {
      const space = BOARD_SPACES[id];
      return space.type === 'property' &&
             canBuildHouse(this.currentPlayer, id, this.state);
    });
    const sellable = player.properties.filter(id => {
      return canSellHouse(this.currentPlayer, id, this.state);
    });
    const mortgageable = player.properties.filter(id => {
      const prop = this.state.properties[id];
      return !prop.mortgaged && (prop.houses || 0) === 0;
    });
    const unmortgageable = player.properties.filter(id => {
      const prop = this.state.properties[id];
      const space = BOARD_SPACES[id];
      return prop.mortgaged && player.money >= Math.floor(space.mortgage * 1.1);
    });

    const makeList = (ids, action, label, cls) =>
      ids.map(id => {
        const sp = BOARD_SPACES[id];
        const pr = this.state.properties[id];
        const cost = action === 'build' ? sp.housePrice :
                     action === 'sell' ? Math.floor((sp.housePrice||0)/2) :
                     action === 'mortgage' ? sp.mortgage :
                     Math.floor(sp.mortgage * 1.1);
        return `<button class="btn ${cls} build-action-btn" data-action="${action}" data-id="${id}">
          ${sp.name} (${pr.houses === 5 ? '🏨' : '🏠x' + pr.houses}) — $${cost}
        </button>`;
      }).join('');

    const html = `
      <div class="build-menu">
        <h2>🏗️ Manage Properties</h2>
        ${buildable.length ? `<h3>Build House/Hotel</h3><div class="build-list">${makeList(buildable, 'build', 'Build', 'btn-success')}</div>` : ''}
        ${sellable.length ? `<h3>Sell Building</h3><div class="build-list">${makeList(sellable, 'sell', 'Sell', 'btn-warning')}</div>` : ''}
        ${mortgageable.length ? `<h3>Mortgage Property</h3><div class="build-list">${makeList(mortgageable, 'mortgage', 'Mortgage', 'btn-danger')}</div>` : ''}
        ${unmortgageable.length ? `<h3>Unmortgage Property</h3><div class="build-list">${makeList(unmortgageable, 'unmortgage', 'Unmortgage', 'btn-primary')}</div>` : ''}
        ${!buildable.length && !sellable.length && !mortgageable.length && !unmortgageable.length
          ? '<p class="no-options">No property management options available right now.</p>' : ''}
        <div class="deed-actions"><button class="btn btn-secondary" id="build-close">Close</button></div>
      </div>`;

    this.ui.showModal(html);
    document.getElementById('build-close')?.addEventListener('click', () => this.ui.closeModal());
    document.querySelectorAll('.build-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);
        this.ui.closeModal();
        if (action === 'build') this.buildHouse(id);
        else if (action === 'sell') this.sellHouse(id);
        else if (action === 'mortgage') this.mortgageProperty(id);
        else if (action === 'unmortgage') this.unmortgageProperty(id);
      });
    });
  }

  // ── Trade ────────────────────────────────────────────────
  executeTrade(fromId, toId, offerPropIds, receivePropIds, offerMoney, receiveMoney, offerJailCards = 0, receiveJailCards = 0) {
    const from = this.players[fromId];
    const to = this.players[toId];

    // Exchange money
    from.money -= offerMoney;
    from.money += receiveMoney;
    to.money += offerMoney;
    to.money -= receiveMoney;

    // Exchange jail cards
    for (let i = 0; i < offerJailCards && from.jailCards.length > 0; i++) {
      to.jailCards.push(from.jailCards.pop());
    }
    for (let i = 0; i < receiveJailCards && to.jailCards.length > 0; i++) {
      from.jailCards.push(to.jailCards.pop());
    }

    // Exchange properties
    offerPropIds.forEach(id => {
      from.properties = from.properties.filter(p => p !== id);
      to.properties.push(id);
      this.state.properties[id].owner = toId;
      // 10% interest on mortgaged properties received
      if (this.state.properties[id].mortgaged) {
        const space = BOARD_SPACES[id];
        const interest = Math.floor(space.mortgage * 0.1);
        to.money -= interest;
        this.ui.addGameLog(`💸 ${to.name} paid $${interest} interest on mortgaged ${space.name}`);
      }
    });
    receivePropIds.forEach(id => {
      to.properties = to.properties.filter(p => p !== id);
      from.properties.push(id);
      this.state.properties[id].owner = fromId;
      // 10% interest on mortgaged properties received
      if (this.state.properties[id].mortgaged) {
        const space = BOARD_SPACES[id];
        const interest = Math.floor(space.mortgage * 0.1);
        from.money -= interest;
        this.ui.addGameLog(`💸 ${from.name} paid $${interest} interest on mortgaged ${space.name}`);
      }
    });

    this.ui.showToast(`Trade complete between ${from.name} and ${to.name}!`, 'success');
    this.ui.addGameLog(`🤝 Trade: ${from.name} ↔ ${to.name}`);
    this.ui.updateAll();
  }

  // ── Bankruptcy ───────────────────────────────────────────
  declareBankruptcy(playerId, creditorId) {
    const player = this.players[playerId];
    player.bankrupt = true;

    // Return all buildings to supply
    player.properties.forEach(id => {
      const prop = this.state.properties[id];
      if (prop.houses > 0) {
        if (prop.houses === 5) {
          this.state.hotelsAvailable++;
        } else {
          this.state.housesAvailable += prop.houses;
        }
      }
    });

    // Transfer all assets to creditor or bank
    if (creditorId >= 0) {
      const creditor = this.players[creditorId];
      creditor.money += player.money;
      // Transfer jail cards
      player.jailCards.forEach(card => creditor.jailCards.push(card));
      player.properties.forEach(id => {
        creditor.properties.push(id);
        this.state.properties[id].owner = creditorId;
        this.state.properties[id].houses = 0; // buildings returned to supply
      });
    } else {
      // Return to bank — return jail cards to their decks
      player.jailCards.forEach(card => {
        returnJailCard(this.decks, card.deckType);
      });
      player.properties.forEach(id => {
        this.state.properties[id].owner = null;
        this.state.properties[id].houses = 0;
        this.state.properties[id].mortgaged = false;
      });
    }

    player.money = 0;
    player.properties = [];
    player.jailCards = [];

    this.ui.showToast(`💀 ${player.name} has gone bankrupt!`, 'error');
    this.ui.addGameLog(`💀 ${player.name} declared bankruptcy!`);

    // Check for game over
    const activePlayers = this.players.filter(p => !p.bankrupt);
    if (activePlayers.length === 1) {
      this.ui.showGameOverModal(activePlayers[0]);
      return;
    }

    this.nextTurn();
  }

  // ── Turn Management ──────────────────────────────────────
  endTurn() {
    if (!this.canEndTurn()) return;

    const player = this.players[this.currentPlayer];

    // Jail check at start of turn
    if (player.inJail && this.phase === 'action') {
      // Handled at roll time
    }

    if (!this.lastRoll?.doubles || player.inJail) {
      this.nextTurn();
    } else {
      // Doubles: roll again
      this.phase = 'roll';
      this.ui.updateAll();
      this.ui.showToast(`${player.name} rolled doubles! Roll again.`, 'dice');

      // AI auto-rolls on doubles
      if (player.isAI) {
        setTimeout(() => this.runAITurn(), 800);
      }
    }
  }

  nextTurn() {
    let next = (this.currentPlayer + 1) % this.players.length;
    let loops = 0;
    while (this.players[next].bankrupt && loops < this.players.length) {
      next = (next + 1) % this.players.length;
      loops++;
    }

    this.currentPlayer = next;
    this.lastRoll = null;
    this.lastDiceRoll = 0;
    this.doublesCount = 0;
    this.phase = 'roll';
    this._doubleRentModifier = false;
    this._utilityTenX = false;

    const player = this.players[this.currentPlayer];
    this.ui.updateAll();
    this.ui.showToast(`${player.token.emoji} ${player.name}'s turn! Roll the dice.`, 'dice');
    this.ui.addGameLog(`--- ${player.name}'s turn ---`);

    // AI takes its turn automatically
    if (player.isAI) {
      setTimeout(() => this.runAITurn(), 800);
      return;
    }

    // Human player: if in jail, offer options
    if (player.inJail) {
      this.handleJailOptions();
    }
  }
}
