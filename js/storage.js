/* Monopolyish — saving and resuming.
 *
 * The whole game state goes into localStorage as one JSON blob. Cards are
 * stored by id and looked back up in the decks on load, because a card is a
 * function and functions do not survive JSON.
 *
 * Every read and write is wrapped: localStorage throws outright in some
 * private-browsing modes, and a game that cannot save should still be a game
 * you can play.
 */

const SAVE_KEY = 'monopolyish.save.v1';
const SAVE_VERSION = 1;

const Save = {
  available() {
    try {
      localStorage.setItem('monopolyish.probe', '1');
      localStorage.removeItem('monopolyish.probe');
      return true;
    } catch (e) { return false; }
  },

  serialize(game) {
    const cardIds = (deck) => deck.map(c => c.id);
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      options: game.options || {},
      turnNumber: game.turnNumber || 0,
      elapsedMs: game.elapsedMs(),
      currentPlayer: game.currentPlayer,
      phase: game.phase === 'debt' ? 'action' : game.phase,
      doublesCount: game.doublesCount,
      lastRoll: game.lastRoll,
      lastDiceRoll: game.lastDiceRoll,
      players: game.players.map(p => ({
        id: p.id, name: p.name, token: p.token, color: p.color,
        money: p.money, position: p.position,
        inJail: p.inJail, jailTurns: p.jailTurns,
        jailCards: p.jailCards.map(c => ({ deckType: c.deckType })),
        bankrupt: p.bankrupt, conceded: !!p.conceded,
        properties: p.properties.slice(),
        isAI: p.isAI, aiDifficulty: p.aiDifficulty, aiPersonality: p.aiPersonality || null
      })),
      properties: Object.keys(game.state.properties).reduce((out, id) => {
        const pr = game.state.properties[id];
        out[id] = { owner: pr.owner, houses: pr.houses, mortgaged: pr.mortgaged };
        return out;
      }, {}),
      freeParkingPot: game.state.freeParkingPot,
      housesAvailable: game.state.housesAvailable,
      hotelsAvailable: game.state.hotelsAvailable,
      decks: {
        chance: cardIds(game.decks.chance),
        community: cardIds(game.decks.community),
        chanceIndex: game.decks.chanceIndex,
        communityIndex: game.decks.communityIndex
      },
      stats: game.stats,
      log: (game.log || []).slice(-200)
    };
  },

  /* Pours a saved blob back into a freshly built Game. The Game is constructed
     first so every method, AI instance and UI binding is the real thing; only
     the state is replaced. */
  apply(game, data) {
    if (!data || data.version !== SAVE_VERSION) return false;

    game.options = data.options || {};
    game.useFreeParkingPot = game.options.freeParkingPot !== false;
    game.turnNumber = data.turnNumber || 0;
    game._elapsedBefore = data.elapsedMs || 0;
    game._startedAt = Date.now();
    game.currentPlayer = data.currentPlayer || 0;
    game.phase = data.phase || 'roll';
    game.doublesCount = data.doublesCount || 0;
    game.lastRoll = data.lastRoll || null;
    game.lastDiceRoll = data.lastDiceRoll || 0;

    data.players.forEach((saved, i) => {
      const p = game.players[i];
      if (!p) return;
      p.name = saved.name;
      p.token = saved.token;
      p.color = saved.color;
      p.money = saved.money;
      p.position = saved.position;
      p.inJail = saved.inJail;
      p.jailTurns = saved.jailTurns;
      p.jailCards = (saved.jailCards || []).map(c => ({ deckType: c.deckType }));
      p.bankrupt = saved.bankrupt;
      p.conceded = !!saved.conceded;
      p.properties = (saved.properties || []).slice();
      p.isAI = saved.isAI;
      p.aiDifficulty = saved.aiDifficulty;
      p.aiPersonality = saved.aiPersonality;
    });

    Object.keys(data.properties || {}).forEach(id => {
      const target = game.state.properties[id];
      const saved = data.properties[id];
      if (!target || !saved) return;
      target.owner = saved.owner;
      target.houses = saved.houses;
      target.mortgaged = saved.mortgaged;
    });

    game.state.freeParkingPot = data.freeParkingPot || 0;
    game.state.housesAvailable = data.housesAvailable;
    game.state.hotelsAvailable = data.hotelsAvailable;

    const byId = (deck) => deck.reduce((m, c) => { m[c.id] = c; return m; }, {});
    const chanceById = byId(CHANCE_CARDS);
    const communityById = byId(COMMUNITY_CHEST_CARDS);
    const relink = (ids, lookup, fallback) => {
      const cards = (ids || []).map(id => lookup[id]).filter(Boolean);
      return cards.length === fallback.length ? cards : shuffleDeck(fallback);
    };
    game.decks.chance = relink(data.decks && data.decks.chance, chanceById, CHANCE_CARDS);
    game.decks.community = relink(data.decks && data.decks.community, communityById, COMMUNITY_CHEST_CARDS);
    game.decks.chanceIndex = (data.decks && data.decks.chanceIndex) || 0;
    game.decks.communityIndex = (data.decks && data.decks.communityIndex) || 0;

    if (data.stats) game.stats = data.stats;
    game.log = (data.log || []).slice();

    // The AI instances were built from the constructor's config; rebuild them
    // so a saved difficulty or personality is the one that plays.
    game.aiPlayers = {};
    game.players.forEach(p => {
      if (p.isAI) {
        game.aiPlayers[p.id] = new AIPlayer(p.id, p.aiDifficulty || 'medium', p.aiPersonality);
      }
    });
    return true;
  },

  write(game) {
    if (!game || game.over) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize(game)));
      return true;
    } catch (e) { return false; }
  },

  read() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.version === SAVE_VERSION ? data : null;
    } catch (e) { return null; }
  },

  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  },

  /* A one-line description for the resume button, so you can tell whether the
     saved game is the one you meant to come back to. */
  summary(data) {
    if (!data) return null;
    const alive = data.players.filter(p => !p.bankrupt);
    const when = new Date(data.savedAt);
    const stamp = isNaN(when.getTime()) ? '' :
      when.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      stamp,
      turn: data.turnNumber || 0,
      players: alive.map(p => `${p.token && p.token.emoji ? p.token.emoji : ''}${p.name}`).join(', '),
      text: `Turn ${data.turnNumber || 0} · ${alive.length} players · ${stamp}`
    };
  }
};
