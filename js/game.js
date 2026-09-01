/* Monopolyish — The Game class: turn flow and everything it coordinates. */

// === game.js ===
// ============================================================
//  MAIN GAME CONTROLLER
// ============================================================

/* Everything the setup screen can change about how a game plays. Defaults are
   the standard rules, so a Game built with no options at all is the game the
   rulebook describes. */
const DEFAULT_OPTIONS = {
  freeParkingPot: true,   // fines and taxes pile up under Free Parking
  noAuctions: false,      // a declined property stays with the bank
  exactGoBonus: false,    // landing exactly on GO pays double
  noRentInJail: false,    // a landlord in jail collects nothing
  shortGame: false,       // two properties dealt to each player, 40-round limit
  speedDie: false,        // the third die from the 2007 rules
  startingCash: 1500,
  turnLimit: 0,           // rounds, 0 = play until one player is left
  timeLimit: 0,           // minutes, 0 = no clock
  theme: 'classic'
};

function createGameStats(playerCount) {
  const perPlayer = [];
  for (let i = 0; i < playerCount; i++) {
    perPlayer.push({
      rentPaid: 0, rentCollected: 0, biggestRent: 0,
      propertiesBought: 0, auctionsWon: 0, housesBuilt: 0,
      timesInJail: 0, goPasses: 0, taxesPaid: 0,
      trades: 0, cardsDrawn: 0
    });
  }
  // rolls[2..12], counted on the two white dice so the histogram means the
  // same thing whether or not the speed die is in play.
  const rolls = [];
  for (let i = 0; i <= 12; i++) rolls.push(0);
  return { perPlayer, rolls, doubles: 0 };
}

class Game {
  constructor(playerNames, tokens, options = {}) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);
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
    this.useFreeParkingPot = this.options.freeParkingPot !== false; // default ON
    this._aiRunning = false; // prevents re-entrant AI turns

    // Rounds, not player-turns: one round is everybody having played once.
    this.turnNumber = 1;
    this._startedAt = Date.now();
    this._elapsedBefore = 0;
    this.over = false;
    this.endReason = null;
    this.stats = createGameStats(this.players.length);

    if (this.options.startingCash && this.options.startingCash !== 1500) {
      this.players.forEach(p => { p.money = this.options.startingCash; });
    }

    // Create AI instances for computer players
    this.aiPlayers = {};
    this.players.forEach(p => {
      if (p.isAI) {
        this.aiPlayers[p.id] = new AIPlayer(p.id, p.aiDifficulty || 'medium', p.aiPersonality);
        p.aiPersonality = this.aiPlayers[p.id].personality;
      }
    });

    if (this.options.shortGame) this._dealOpeningProperties();
  }

  /* The short game deals everyone two properties before the first roll, which
     is what stops a forty-minute opening where nobody owns anything. */
  _dealOpeningProperties() {
    const pool = BOARD_SPACES
      .filter(s => ['property', 'railroad', 'utility'].includes(s.type))
      .map(s => s.id);
    // Fisher-Yates, same as the decks use.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.players.forEach(player => {
      for (let n = 0; n < 2 && pool.length; n++) {
        const id = pool.pop();
        player.properties.push(id);
        this.state.properties[id].owner = player.id;
      }
    });
  }

  /* Someone who has asked their system for less motion should not have to sit
     through a token hopping round forty squares. The move still happens step
     by step — the log and the rules depend on it — just without the wait. */
  _stepDelay(base) {
    if (typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 0;
    }
    return base;
  }

  /* Play time, across saves: a resumed game carries the clock it had. */
  elapsedMs() {
    return this._elapsedBefore + (Date.now() - this._startedAt);
  }

  autosave() {
    if (typeof Save === 'undefined') return;
    if (this.over) return;
    if (typeof MP !== 'undefined' && MP.mode === 'guest') return;  // guests own nothing
    /* Not in the middle of a debt. A save carries no pending debt, so one
       written while the raise-funds modal was open came back as a game where
       the money was simply never owed — and selling a house to raise it was
       one of the things that triggered a save. */
    if (this._pendingDebt) return;
    Save.write(this);
  }

  // ── Setup ────────────────────────────────────────────────
  init() {
    const boardContainer = document.getElementById('board-grid');
    renderBoard(boardContainer);

    // Board space handlers — pointer and keyboard both open the deed.
    const openSpace = (spaceEl) => {
      if (!spaceEl) return;
      const spaceId = parseInt(spaceEl.dataset.space);
      const type = spaceEl.dataset.type;
      if (['property','railroad','utility'].includes(type)) {
        this.ui.showPropertyModal(spaceId);
      }
    };
    document.getElementById('board-grid').addEventListener('click', (e) => {
      openSpace(e.target.closest('[data-space]'));
    });
    document.getElementById('board-grid').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const spaceEl = e.target.closest ? e.target.closest('[data-space]') : null;
      if (!spaceEl) return;
      e.preventDefault();
      openSpace(spaceEl);
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
    document.getElementById('btn-concede')?.addEventListener('click', () => this.ui.showConcedeModal());

    if (this.options.speedDie) {
      const speedEl = document.getElementById('dice-speed');
      if (speedEl) speedEl.hidden = false;
    }
    this.ui.renderRulesInForce();

    this.ui.updateAll();
    this.ui.showToast(`${this.players[this.currentPlayer].name}'s turn! Roll the dice.`, 'dice');
    if (!this.log.length) {
      this.ui.addGameLog(`🎮 Game started with ${this.players.length} players!`);
    } else {
      this.log.forEach(line => this.ui.renderLogEntry(line));
      this.ui.addGameLog('💾 Resumed from a saved game');
    }

    // If the first player is AI, start their turn
    if (this.isCurrentPlayerAI()) {
      setTimeout(() => this.runAITurn(), 1000);   // wrapper catches its own
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  canRoll() {
    return !this.over && this.phase === 'roll' &&
           !this.players[this.currentPlayer].bankrupt;
  }

  canEndTurn() {
    return !this.over && (this.phase === 'action' || this.phase === 'rolled');
  }

  /* Trading is not tied to whose turn it is — deals are struck across the
     table, and most often by whoever is about to land somewhere expensive.
     It stays shut mid-roll and mid-debt, where the board is not settled. */
  canTrade() {
    if (this.over) return false;
    if (this.phase === 'rolling' || this.phase === 'debt') return false;
    return this.players.filter(p => !p.bankrupt).length >= 2;
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

    /* Wait for any async landing effects — cards, a purchase, an auction.
       'roll' belongs in that list: a player who rolled doubles is back on
       'roll' the moment the square is settled, and leaving it out meant every
       double an opponent threw stalled the game for the full five seconds
       before it noticed nothing more was coming. */
    await this._waitForPhase(['action', 'rolled', 'roll', 'debt', 'over'], 5000);

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

    // Offer a trade, if this one can see a deal worth making
    if (!this.over && !player.bankrupt &&
        (this.phase === 'action' || this.phase === 'rolled')) {
      await this._aiTryTrade(ai);
    }

    // End turn
    await this._wait(300);
    if (this.over) return false;
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

  /* The computer opening a trade. It waits for the answer before ending its
     turn, so an offer does not appear over the next player's roll — but not
     for ever, in case nobody is at the other screen. */
  async _aiTryTrade(ai) {
    const deal = ai.proposeTrade(this);
    if (!deal) return;

    const from = this.players[deal.fromId];
    const to = this.players[deal.toId];
    this.ui.addGameLog(`🤝 ${from.name} offers ${to.name} a trade`);

    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      setTimeout(finish, 45000);
      this.requestTrade(deal, finish);
    });
  }

  async _aiRaiseFunds() {
    // Called from the turn loop and from the debt itself, so it has to be safe
    // to call twice for the same debt — or for one that is already settled.
    if (!this._pendingDebt) return;
    const ai = this.getAI(this._pendingDebt.playerId);
    if (!ai) return;

    const debtorId = this._pendingDebt.playerId;
    const actions = ai.decideRaiseFunds(this._pendingDebt.amount, this);
    for (const act of actions) {
      if (act.action === 'sell') {
        this.sellHouse(act.spaceId, debtorId);
      } else if (act.action === 'mortgage') {
        this.mortgageProperty(act.spaceId, debtorId);
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
    const speedEl = document.getElementById('dice-speed');
    const result = rollDice(this.options.speedDie);
    this.lastRoll = result;
    this.lastDiceRoll = result.total;
    SFX.play('dice');

    await animateDice(d1El, d2El, result, speedEl);

    const player = this.players[this.currentPlayer];
    const doublesMsg = result.doubles ? ' <strong>DOUBLES!</strong>' : '';
    const speedMsg = result.speed ? ` + ${result.speed.label}` : '';
    this.stats.rolls[result.d1 + result.d2]++;
    if (result.doubles) this.stats.doubles++;
    this.ui.showToast(`${player.name} rolled ${result.d1} + ${result.d2}${speedMsg} = ${result.total}${doublesMsg}`, 'dice');
    this.ui.addGameLog(`🎲 ${player.name} rolled ${result.d1}+${result.d2}${speedMsg}=${result.total}${doublesMsg}`);

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

    // All three dice matching is the speed die's "go wherever you like", and
    // it replaces the move rather than following it.
    if (result.triples) {
      await this._speedTriples(this.currentPlayer);
      return;
    }

    // The bus takes you to the next card space instead of counting it out.
    if (result.speed && result.speed.kind === 'bus') {
      const stop = this._nextSpaceOfType(player.position, ['chance', 'community']);
      if (stop !== null) {
        this.ui.showToast(`🚌 ${player.name} takes the bus to ${BOARD_SPACES[stop].name}.`, 'info');
        this.ui.addGameLog(`🚌 ${player.name} took the bus`);
        await this.movePlayerTo(this.currentPlayer, stop, true);
        return;
      }
    }

    await this.movePlayer(this.currentPlayer, result.total);

    // Mr. Monopoly moves you on again once the space you landed on is settled.
    if (result.speed && result.speed.kind === 'monopoly') {
      await this._waitForPhase(['action', 'rolled', 'roll', 'debt'], 120000);
      if (this.phase !== 'debt' && !player.bankrupt && !this.over) {
        await this._speedMrMonopoly(this.currentPlayer);
      }
    }
  }

  /* First space of any of these types, walking forward from `from`. */
  _nextSpaceOfType(from, types) {
    for (let i = 1; i <= 40; i++) {
      const id = (from + i) % 40;
      if (types.includes(BOARD_SPACES[id].type)) return id;
    }
    return null;
  }

  /* Mr. Monopoly: on to the next property nobody owns, or — if the board is
     all spoken for — the next one an opponent owns, at double rent. */
  async _speedMrMonopoly(playerId) {
    const player = this.players[playerId];
    const from = player.position;
    let target = null;
    let opts = {};

    for (let i = 1; i <= 40 && target === null; i++) {
      const id = (from + i) % 40;
      const prop = this.state.properties[id];
      if (prop && prop.owner === null) target = id;
    }
    if (target === null) {
      for (let i = 1; i <= 40 && target === null; i++) {
        const id = (from + i) % 40;
        const prop = this.state.properties[id];
        if (prop && prop.owner !== null && prop.owner !== playerId && !prop.mortgaged) {
          target = id;
          opts = { doubleRent: true };
        }
      }
    }
    if (target === null) return;

    this.ui.showToast(`🎩 Mr. Monopoly moves ${player.name} on to ${BOARD_SPACES[target].name}!`, 'info');
    this.ui.addGameLog(`🎩 Mr. Monopoly sent ${player.name} to ${BOARD_SPACES[target].name}`);
    await this.movePlayerTo(playerId, target, true, opts);
  }

  /* Three of a kind: the player names any space on the board. */
  async _speedTriples(playerId) {
    const player = this.players[playerId];
    this.ui.showToast(`🎲 Triple! ${player.name} may move anywhere on the board.`, 'success');
    this.ui.addGameLog(`🎲 ${player.name} rolled a triple`);

    const go = (spaceId) => {
      const target = Number(spaceId);
      if (!BOARD_SPACES[target]) return this.endLandAction();
      this.movePlayerTo(playerId, target, true);
    };

    if (player.isAI) {
      const ai = this.getAI(playerId);
      return go(ai ? ai.decideAnywhere(this) : 0);
    }

    MP.prompt(playerId, 'anywhere', { playerId }, {
      local: () => this.ui.showChooseSpaceModal(playerId, go),
      onReply: (answer) => go(answer)
    });
  }

  async handleJailRoll(result) {
    const player = this.players[this.currentPlayer];
    if (result.doubles) {
      player.inJail = false;
      player.jailTurns = 0;
      /* Doubles get you out and move you, and then your turn is over: the
         throw that opens the cell does not also earn another one. The phase
         is decided from lastRoll when the token lands, so this is the flag
         that has to say so. */
      this.lastRoll = { ...result, doubles: false };
      this.doublesCount = 0;
      this.ui.showToast(`${player.name} rolled doubles and is free from Jail!`, 'success');
      this.ui.addGameLog(`🔓 ${player.name} escaped jail with doubles!`);
      await this.movePlayer(this.currentPlayer, result.total);
    } else {
      player.jailTurns++;
      if (player.jailTurns >= 3) {
        // Must pay on 3rd turn
        this.ui.showToast(`${player.name} must pay $50 fine to leave jail!`, 'warning');
        this.payMoney(this.currentPlayer, 50, 'Jail fine');
        /* Same as paying the fine by choice: if the money is not there, the
           debt comes first. Moving on top of it landed them on a square that
           could charge rent while the raise-funds modal was still open. */
        if (this._pendingDebt || player.bankrupt) return;
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

    /* A move takes a second or so to walk out, and the square it ends on is
       what decides the phase. Saying so here is what stops a card that moves
       you — "Advance to Illinois Ave" — from handing the turn back the instant
       the card is acknowledged: the phase went to 'action' while the token was
       still three squares in, so the turn could be ended, and the landing then
       fired during somebody else's turn. */
    this._pendingLandAction = true;

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
      const delay = this._stepDelay(80 + Math.floor(40 * (i / steps)));
      await new Promise(r => setTimeout(r, delay));
    }

    if (passedGo && !opts.noGo) {
      this.collectMoney(playerId, 200, 'Passed GO!');
      this.stats.perPlayer[playerId].goPasses++;
      this.ui.showToast(`${player.name} passed GO! Collect $200`, 'money');
      this.ui.addGameLog(`💰 ${player.name} passed GO and collected $200`);
    }

    this.landOnSpace(playerId, player.position, opts);
  }

  async movePlayerTo(playerId, targetPos, collectGo = true, opts = {}) {
    const player = this.players[playerId];
    const startPos = player.position;
    this._pendingLandAction = true;      // see movePlayer, above

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
      const speed = this._stepDelay(Math.max(40, 100 - steps * 2));
      await new Promise(r => setTimeout(r, speed));
    }

    if (passedGo && collectGo && targetPos !== 10) {
      this.collectMoney(playerId, 200, 'Passed GO!');
      this.stats.perPlayer[playerId].goPasses++;
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
    /* The move has arrived, so the flag that says one is in flight comes down
       here: from this point the square itself decides the phase. Leaving it
       standing meant the next card drawn — one that only pays money, with no
       move of its own — took it as "somebody else will set the phase", and the
       turn could never be ended. */
    this._pendingLandAction = false;
    this.ui.addGameLog(`📍 ${player.name} landed on ${space.name}`);

    switch (space.type) {
      case 'go':
        // The $200 for passing has already been paid; the house rule is for
        // stopping on the square exactly.
        if (this.options.exactGoBonus) {
          this.collectMoney(playerId, 200, 'Landed exactly on GO');
          this.ui.showToast(`${player.name} landed exactly on GO — another $200!`, 'money');
          this.ui.addGameLog(`💰 ${player.name} landed on GO and collected a second $200`);
          SFX.play('money');
        }
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
        this.stats.perPlayer[playerId].taxesPaid += space.amount;
        SFX.play('pay');
        this.payToFreeParkingPot(playerId, space.amount);
        this._afterAction();
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
            SFX.play('money');
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

    /* The two "pay extra when you get there" flags belong to this landing and
       nothing else, so they are spent here whatever the square turns out to
       be. They used to be cleared only where rent was actually charged — so a
       card that sent you to a railroad nobody owned left "pay double" set, and
       the next rent in the same turn, on any square, was charged at twice its
       value. */
    const doubleRent = this._doubleRentModifier;
    const utilityTenX = this._utilityTenX;
    this._doubleRentModifier = false;
    this._utilityTenX = false;

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
          // AI declines: to auction, or back to the bank under the house rule
          this.ui.showToast(`🤖 ${player.name} declines to buy ${space.name}.`, 'info');
          this.ui.addGameLog(`🤖 ${player.name} passed on ${space.name}`);
          this.startAuction(spaceId);
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
        const doAuction = () => this.startAuction(spaceId);
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
    } else if (this.options.noRentInJail && this.players[prop.owner].inJail) {
      // House rule: a landlord behind bars collects nothing.
      this.ui.showToast(`${this.players[prop.owner].name} is in jail — no rent on ${space.name}.`, 'info');
      this.ui.addGameLog(`🔒 No rent on ${space.name}: its owner is in jail`);
      this.phase = this.lastRoll?.doubles ? 'roll' : 'action';
      this.ui.updateAll();
    } else {
      // Pay rent
      let rent = calculateRent(spaceId, { ...this.state, lastDiceRoll: this.lastDiceRoll });

      // Double rent modifiers from cards
      if (doubleRent) rent *= 2;
      if (utilityTenX && space.type === 'utility') rent = 10 * this.lastDiceRoll;

      const owner = this.players[prop.owner];
      this.ui.showToast(`${player.name} pays $${rent} rent to ${owner.name} for ${space.name}!`, 'money');
      this.ui.addGameLog(`💵 ${player.name} paid $${rent} rent to ${owner.name}`);
      SFX.play('pay');

      this.payRent(playerId, prop.owner, rent);

      if (player.bankrupt) return;
      this._afterAction();
    }
  }

  /* Declining a property. Normally it goes under the hammer; the no-auction
     house rule leaves it with the bank for whoever lands on it next. */
  startAuction(spaceId) {
    if (this.options.noAuctions) {
      this.ui.showToast(`${BOARD_SPACES[spaceId].name} stays with the bank.`, 'info');
      this.ui.addGameLog(`🏦 ${BOARD_SPACES[spaceId].name} went back to the bank (no auctions)`);
      this.endLandAction();
      return;
    }
    SFX.play('auction');
    this.ui.showAuctionModal(spaceId);
  }

  handleCardLanding(playerId, type) {
    const card = drawCard(this.decks, type);
    this.stats.perPlayer[playerId].cardsDrawn++;
    SFX.play('card');
    this.ui.addGameLog(`🃏 ${this.players[playerId].name} drew: "${card.text}"`);

    const executeCard = () => {
      card.action(this);
      // A card that bills more than the player has leaves them in debt, and
      // that has to survive the card being dismissed.
      if (!this._pendingLandAction) this._afterAction();
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
    this._afterAction();
  }

  /* The turn carries on — unless it cannot. A rent or a tax the player could
     not cover puts the game in 'debt' and opens the raise-funds modal, and the
     callers used to stamp 'action' over that on the way back out: the modal
     stayed up, but the player could roll and end their turn still owing the
     money. Nothing may leave the debt phase except settling the debt. */
  _afterAction() {
    if (this.phase === 'debt') return;
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
    this.stats.perPlayer[playerId].timesInJail++;
    SFX.play('jail');
    this.ui.showToast(`${player.name} is sent to Jail!`, 'error');
    this.ui.addGameLog(`🔒 ${player.name} went to jail!`);
    this.ui.updateBoard();
    this.phase = 'action';
    this.ui.updateAll();
  }

  handleJailOptions() {
    /* This used to reach for a `playerId` that no line in the method defines:
       every human turn that began in jail threw a ReferenceError instead of
       offering the three choices, and the turn stalled there. */
    const playerId = this.currentPlayer;
    const player = this.players[playerId];
    // Whoever is in jail answers, wherever they are sitting.
    const payFine = () => {
      this.payMoney(playerId, 50, 'Jail fine');
      /* The fine may be more than they have in cash, which opens the debt
         they have to raise before anything else happens. Walking out of the
         cell and setting 'roll' over the top of that let them roll — and move,
         and land — while still owing the money. */
      if (this._pendingDebt || player.bankrupt) return;
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
        this.askToRaiseFunds(playerId, amount, -1, reason);
      }
    }
  }

  payRent(payerId, receiverId, amount) {
    const payer = this.players[payerId];
    const receiver = this.players[receiverId];

    if (payer.money >= amount) {
      payer.money -= amount;
      receiver.money += amount;
      this._recordRent(payerId, receiverId, amount);
      this.ui.updatePlayerPanels();
    } else {
      // Can't afford — check if assets can cover it
      if (payer.money + this.getMaxLiquidValue(payerId) < amount) {
        // Totally insolvent — give what they have and bankrupt
        this._recordRent(payerId, receiverId, payer.money);
        receiver.money += payer.money;
        payer.money = 0;
        this.declareBankruptcy(payerId, receiverId);
      } else {
        // Has enough assets — the debt is settled once they have raised it
        this._pendingDebt = { playerId: payerId, amount, creditorId: receiverId, reason: `Rent to ${receiver.name}` };
        this.phase = 'debt';
        this.askToRaiseFunds(payerId, amount, receiverId, `Rent to ${receiver.name}`);
      }
    }
  }

  /* Who has been bled by whom. The end-of-game table is built from this, and
     it is the only record of a rent that was paid and then spent. */
  _recordRent(payerId, receiverId, amount) {
    if (!amount || amount <= 0) return;
    const paying = this.stats.perPlayer[payerId];
    const collecting = this.stats.perPlayer[receiverId];
    if (paying) paying.rentPaid += amount;
    if (collecting) {
      collecting.rentCollected += amount;
      if (amount > collecting.biggestRent) collecting.biggestRent = amount;
    }
  }

  /* Raising funds is a live back-and-forth rather than one question, so a
     player sitting at another screen gets the modal sent to them and works it
     there; their sells and mortgages come back as ordinary intents. */
  askToRaiseFunds(playerId, amount, creditorId, reason) {
    /* The computer settles its own debts, and it has to be able to do so on
       somebody else's turn: a card can bill every player at once, and the turn
       loop only drives the player whose turn it is. Nothing else would ever
       answer, and the debt phase now holds the game until something does. */
    if (this.players[playerId].isAI) {
      setTimeout(() => this._aiRaiseFunds(), 400);
      return;
    }

    MP.prompt(playerId, 'raiseFunds', { playerId, amount, creditorId, reason }, {
      local: () => this.ui.showRaiseFundsModal(playerId, amount, creditorId, reason),
      onReply: (answer) => {
        if (answer === 'bankrupt') return this.forceSettleDebt();
        this.resolveDebt();
        /* They said pay, but the money was not there. Put the question back to
           them rather than leaving a debt nobody is being asked about. */
        if (this._pendingDebt && this._pendingDebt.playerId === playerId) {
          this.askToRaiseFunds(playerId, amount, creditorId, reason);
        }
      }
    });
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
        this.askToRaiseFunds(playerId, amount, -1, 'Tax payment');
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
    const prop = this.state.properties[spaceId];

    /* Only the bank sells. Without this, a stale answer — an auction settled
       twice, a reply that arrived late from another screen — moved the deed to
       a new owner while the old one still had it on their own list, and both
       of them collected rent on it. */
    if (!prop || prop.owner !== null) {
      this.ui.showToast(`${space.name} is not for sale.`, 'warning');
      return false;
    }

    if (player.money < price) {
      this.ui.showToast(`${player.name} cannot afford ${space.name}.`, 'error');
      this.ui.addGameLog(`${player.name} could not afford ${space.name} ($${price})`);
      return false;
    }

    player.money -= price;
    player.properties.push(spaceId);
    prop.owner = playerId;
    this.stats.perPlayer[playerId].propertiesBought++;
    SFX.play('buy');
    this.ui.showToast(`${player.name} bought ${space.name} for $${price}!`, 'success');
    this.ui.addGameLog(`🏠 ${player.name} bought ${space.name} for $${price}`);
    this.ui.updateAll();
    this.autosave();
    return true;
  }

  /* Managing property is not always the player to move: during a debt it is
     whoever owes, and a debt can be run up on somebody else's turn by a card.
     So each of these takes the owner, defaulting to the player to move. */
  buildHouse(spaceId, playerId = this.currentPlayer) {
    if (!canBuildHouse(playerId, spaceId, this.state)) {
      this.ui.showToast('Cannot build here!', 'error');
      SFX.play('error');
      return;
    }
    const space = BOARD_SPACES[spaceId];
    const player = this.players[playerId];
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
    this.stats.perPlayer[playerId].housesBuilt++;
    SFX.play('build');
    this.ui.addGameLog(`🏠 ${player.name} built on ${space.name}`);
    this.ui.updateAll();
    this.autosave();
  }

  sellHouse(spaceId, playerId = this.currentPlayer) {
    if (!canSellHouse(playerId, spaceId, this.state)) {
      this.ui.showToast('Cannot sell here!', 'error');
      return;
    }
    const space = BOARD_SPACES[spaceId];
    const player = this.players[playerId];
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
    this.autosave();
  }

  mortgageProperty(spaceId, playerId = this.currentPlayer) {
    const space = BOARD_SPACES[spaceId];
    const prop = this.state.properties[spaceId];
    const player = this.players[playerId];

    if (prop.owner !== playerId || prop.mortgaged || (prop.houses || 0) > 0) {
      this.ui.showToast('Cannot mortgage this property!', 'error');
      return;
    }

    prop.mortgaged = true;
    player.money += space.mortgage;
    this.ui.showToast(`${player.name} mortgaged ${space.name} for $${space.mortgage}`, 'warning');
    this.ui.addGameLog(`🔴 ${player.name} mortgaged ${space.name}`);
    this.ui.updateAll();
    this.autosave();
  }

  unmortgageProperty(spaceId, playerId = this.currentPlayer) {
    const space = BOARD_SPACES[spaceId];
    const prop = this.state.properties[spaceId];
    const player = this.players[playerId];
    const cost = Math.floor(space.mortgage * 1.1);

    if (prop.owner !== playerId || !prop.mortgaged || player.money < cost) {
      this.ui.showToast('Cannot unmortgage!', 'error');
      return;
    }

    prop.mortgaged = false;
    player.money -= cost;
    this.ui.showToast(`${player.name} unmortgaged ${space.name} for $${cost}`, 'success');
    this.ui.addGameLog(`🟢 ${player.name} unmortgaged ${space.name}`);
    this.ui.updateAll();
    this.autosave();
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

  /* A deal is written from the proposer's side:
       { fromId, toId, giveProps[], getProps[], giveMoney, getMoney,
         giveJailCards, getJailCards }
     Everything that follows works from that one shape — the builder, the AI,
     the modal the other player sees, and the intent a guest sends. */
  /* Deals arrive from a modal on this screen, from the AI, and off the wire,
     so none of them is trusted: everything is checked against the board here.
     Returns { ok } or { ok:false, reason } with something worth showing. */
  validateDeal(deal) {
    const bad = (reason) => ({ ok: false, reason });
    if (!deal) return bad('There is no offer to make.');

    const from = this.players[deal.fromId];
    const to = this.players[deal.toId];
    if (!from || !to) return bad('That player is not in this game.');
    if (from.id === to.id) return bad('You cannot trade with yourself.');
    if (from.bankrupt || to.bankrupt) return bad('That player is out of the game.');
    if (this.over) return bad('The game is over.');

    const give = (deal.giveProps || []).map(Number);
    const get = (deal.getProps || []).map(Number);
    const giveMoney = Math.max(0, Math.floor(deal.giveMoney || 0));
    const getMoney = Math.max(0, Math.floor(deal.getMoney || 0));
    const giveCards = Math.max(0, Math.floor(deal.giveJailCards || 0));
    const getCards = Math.max(0, Math.floor(deal.getJailCards || 0));

    if (!give.length && !get.length && !giveMoney && !getMoney && !giveCards && !getCards) {
      return bad('An empty trade is not a trade.');
    }

    const ownedBy = (ids, player) => ids.every(id => this.state.properties[id] &&
                                                     this.state.properties[id].owner === player.id);
    if (!ownedBy(give, from)) return bad(`${from.name} does not own all of that.`);
    if (!ownedBy(get, to)) return bad(`${to.name} does not own all of that.`);

    /* Buildings have to come down before the deed moves — and because houses
       are built across a colour group, that means nothing in the group. */
    const groupIsClear = (id) => {
      const space = BOARD_SPACES[id];
      if (!space.group || space.type !== 'property') return (this.state.properties[id].houses || 0) === 0;
      return getGroupSpaces(space.group)
        .every(s => (this.state.properties[s.id].houses || 0) === 0);
    };
    const built = give.concat(get).filter(id => !groupIsClear(id));
    if (built.length) {
      return bad(`Sell the buildings on ${BOARD_SPACES[built[0]].group || BOARD_SPACES[built[0]].name} first.`);
    }

    if (giveMoney > from.money) return bad(`${from.name} does not have $${giveMoney}.`);
    if (getMoney > to.money) return bad(`${to.name} does not have $${getMoney}.`);
    if (giveCards > from.jailCards.length) return bad(`${from.name} has no jail card to give.`);
    if (getCards > to.jailCards.length) return bad(`${to.name} has no jail card to give.`);

    return { ok: true };
  }

  /* Put a deal to the other player: the computer decides for itself, a person
     at this screen gets the modal, and one somewhere else is asked over the
     wire. `settled` is called with true or false once it is answered. */
  requestTrade(deal, settled) {
    const done = (accepted, why) => { if (settled) settled(accepted, why); };
    const check = this.validateDeal(deal);
    if (!check.ok) {
      this.ui.showToast(check.reason, 'warning');
      SFX.play('error');
      done(false, check.reason);
      return false;
    }

    const from = this.players[deal.fromId];
    const to = this.players[deal.toId];

    const accept = () => {
      // The board may have moved on between the offer and the answer.
      const still = this.validateDeal(deal);
      if (!still.ok) {
        this.ui.showToast(still.reason, 'warning');
        return done(false, still.reason);
      }
      this.executeTrade(deal.fromId, deal.toId, deal.giveProps, deal.getProps,
                        deal.giveMoney, deal.getMoney,
                        deal.giveJailCards, deal.getJailCards);
      done(true);
    };
    const decline = (why) => {
      this.ui.showToast(`${to.name} declined the trade.`, 'warning');
      this.ui.addGameLog(`🚫 ${to.name} declined ${from.name}'s offer`);
      done(false, why);
    };

    if (to.isAI) {
      const ai = this.getAI(deal.toId);
      const verdict = ai ? ai.decideTrade(deal, this) : { accept: false };
      this.ui.showToast(`🤖 ${to.name} is considering the offer…`, 'info');
      setTimeout(() => (verdict.accept ? accept() : decline(verdict.reason)), 900);
      return true;
    }

    MP.prompt(deal.toId, 'trade', { deal }, {
      local: () => this.ui.showTradeOfferModal(deal, accept, decline),
      onReply: (answer) => (answer === 'accept' ? accept() : decline())
    });
    return true;
  }

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

    /* The deeds all move first, and the interest on any mortgaged ones is
       billed afterwards. Billing inside the loop meant a player the interest
       bankrupted had everything they owned returned to the bank half way
       through — and the rest of the deeds were then handed to someone who was
       already out of the game. */
    const owed = [];
    offerPropIds.forEach(id => {
      from.properties = from.properties.filter(p => p !== id);
      to.properties.push(id);
      this.state.properties[id].owner = toId;
      if (this.state.properties[id].mortgaged) owed.push({ who: toId, id });
    });
    receivePropIds.forEach(id => {
      to.properties = to.properties.filter(p => p !== id);
      from.properties.push(id);
      this.state.properties[id].owner = fromId;
      if (this.state.properties[id].mortgaged) owed.push({ who: fromId, id });
    });

    // 10% interest on every mortgaged deed received, through the bank's own
    // machinery — taking it straight out of the balance pushed a player who
    // could not afford it below zero, with no debt raised and nothing said.
    owed.forEach(({ who, id }) => {
      if (this.players[who].bankrupt) return;
      const space = BOARD_SPACES[id];
      const interest = Math.floor(space.mortgage * 0.1);
      this.payMoney(who, interest, `Interest on ${space.name}`);
      this.ui.addGameLog(`💸 ${this.players[who].name} paid $${interest} interest on mortgaged ${space.name}`);
    });

    this.stats.perPlayer[fromId].trades++;
    this.stats.perPlayer[toId].trades++;
    SFX.play('trade');
    this.ui.showToast(`Trade complete between ${from.name} and ${to.name}!`, 'success');
    this.ui.addGameLog(`🤝 Trade: ${from.name} ↔ ${to.name}`);
    this.ui.updateAll();
    this.autosave();
  }

  // ── Bankruptcy ───────────────────────────────────────────
  declareBankruptcy(playerId, creditorId) {
    const player = this.players[playerId];
    if (player.bankrupt) return;      // once is enough, and twice paid twice
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

    SFX.play('bankrupt');
    this.ui.showToast(`💀 ${player.name} has gone bankrupt!`, 'error');
    this.ui.addGameLog(`💀 ${player.name} declared bankruptcy!`);

    // Check for game over
    const activePlayers = this.players.filter(p => !p.bankrupt);
    if (activePlayers.length === 1) {
      this.endGame('last player standing');
      return;
    }
    if (activePlayers.length === 0) {          // everybody conceded at once
      this.endGame('everyone is out');
      return;
    }

    // Whoever went bust may not have been the player to move.
    if (playerId === this.currentPlayer) this.nextTurn();
    else this.ui.updateAll();
  }

  // ── Endings ──────────────────────────────────────────────

  /* Giving up. The assets go back to the bank rather than to a rival, because
     conceding should not be a way of handing someone the game. */
  concede(playerId) {
    const player = this.players[playerId];
    if (!player || player.bankrupt || this.over) return;
    player.conceded = true;
    this.ui.addGameLog(`🏳️ ${player.name} conceded`);
    this.ui.showToast(`${player.name} conceded.`, 'warning');
    this.declareBankruptcy(playerId, -1);
  }

  /* Net worth is what settles a game that ends on the clock or the turn count,
     and it is what the final table is sorted by. */
  standings() {
    return this.players
      .map(player => ({
        player,
        netWorth: player.bankrupt
          ? 0
          : getPlayerNetWorth(player, this.state.properties, BOARD_SPACES),
        // A mirror may be reading this before any stats have reached it.
        stats: (this.stats && this.stats.perPlayer[player.id]) || {}
      }))
      .sort((a, b) => {
        if (a.player.bankrupt !== b.player.bankrupt) return a.player.bankrupt ? 1 : -1;
        return b.netWorth - a.netWorth;
      });
  }

  /* Has this game run out of rounds or minutes? Checked as each round opens,
     so a limit ends the game between turns rather than mid-move. */
  checkEndConditions() {
    if (this.over) return false;
    const { turnLimit, timeLimit } = this.options;
    if (turnLimit && this.turnNumber > turnLimit) {
      this.endGame(`the ${turnLimit}-round limit`);
      return true;
    }
    if (timeLimit && this.elapsedMs() >= timeLimit * 60000) {
      this.endGame(`the ${timeLimit}-minute limit`);
      return true;
    }
    return false;
  }

  endGame(reason) {
    if (this.over) return;
    this.over = true;
    this.endReason = reason;
    this.phase = 'over';
    const standings = this.standings();
    if (typeof Save !== 'undefined') Save.clear();   // nothing left to resume
    SFX.play('win');
    this.ui.addGameLog(`🏆 ${standings[0].player.name} wins — ${reason}`);
    this.ui.updateAll();
    this.ui.showGameOverModal(standings[0].player, { reason, standings });
  }

  // ── Turn Management ──────────────────────────────────────
  endTurn() {
    if (this.over || !this.canEndTurn()) return;

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
    if (this.over) return;

    let next = (this.currentPlayer + 1) % this.players.length;
    let loops = 0;
    while (this.players[next].bankrupt && loops < this.players.length) {
      next = (next + 1) % this.players.length;
      loops++;
    }

    // A round is everybody having played once, so it ticks over when the turn
    // wraps back round the table. That is the unit the turn limit counts in.
    if (next <= this.currentPlayer) {
      this.turnNumber++;
      if (this.checkEndConditions()) return;
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
    this.autosave();
    this.ui.showToast(`${player.token.emoji} ${player.name}'s turn! Roll the dice.`, 'dice');
    this.ui.addGameLog(`--- ${player.name}'s turn (round ${this.turnNumber}) ---`);

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
