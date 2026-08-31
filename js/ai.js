/* Monopolyish — The computer opponent. */

// === ai.js ===
// ============================================================
//  AI DECISION ENGINE
//  Handles all computer player decision-making
// ============================================================

// Property groups ranked by strategic value (landing probability × rent potential)
const GROUP_VALUE = {
  orange: 10, red: 9, yellow: 8, green: 7, darkblue: 7,
  pink: 6, lightblue: 5, brown: 3, railroad: 6, utility: 2,
};

/* Difficulty is how well a computer player thinks; personality is what it
 * wants. Three "hard" opponents used to be one opponent three times over —
 * same table of group values, same reserve, same appetite for a deal. Each of
 * these bends those numbers, so the table has characters at it.
 *
 *   bias           multiplies a group's strategic value
 *   cashFloor      how much of a reserve it insists on keeping
 *   buildEagerness how readily it turns cash into houses
 *   auctionNerve   how far past a property's price it will bid
 *   tradeMargin    how much better than even a deal has to be
 *   tradeUrge      how often it opens a negotiation of its own
 */
const AI_PERSONALITIES = {
  balanced: {
    label: 'Balanced', blurb: 'plays it down the middle',
    bias: {}, cashFloor: 1, buildEagerness: 1,
    auctionNerve: 1, tradeMargin: 1, tradeUrge: 0.35
  },
  tycoon: {
    label: 'Tycoon', blurb: 'builds early and often',
    bias: { orange: 1.3, red: 1.2, yellow: 1.2, green: 1.15 },
    cashFloor: 0.7, buildEagerness: 1.5,
    auctionNerve: 1.15, tradeMargin: 0.95, tradeUrge: 0.45
  },
  collector: {
    label: 'Collector', blurb: 'hoards railroads and utilities',
    bias: { railroad: 2, utility: 2.2 },
    cashFloor: 0.9, buildEagerness: 0.8,
    auctionNerve: 1.1, tradeMargin: 1, tradeUrge: 0.4
  },
  hustler: {
    label: 'Hustler', blurb: 'always has an offer for you',
    bias: {}, cashFloor: 0.8, buildEagerness: 1,
    auctionNerve: 1.2, tradeMargin: 0.8, tradeUrge: 0.8
  },
  miser: {
    label: 'Miser', blurb: 'sits on its cash',
    bias: { brown: 1.2, lightblue: 1.3 },
    cashFloor: 1.8, buildEagerness: 0.6,
    auctionNerve: 0.7, tradeMargin: 1.3, tradeUrge: 0.2
  }
};

function aiPersonalityKeys() { return Object.keys(AI_PERSONALITIES); }

class AIPlayer {
  constructor(playerId, difficulty = 'medium', personality = null) {
    this.playerId = playerId;
    this.difficulty = difficulty; // 'easy' | 'medium' | 'hard'

    const keys = aiPersonalityKeys();
    this.personality = AI_PERSONALITIES[personality]
      ? personality
      : keys[Math.floor(Math.random() * keys.length)];
    this.traits = AI_PERSONALITIES[this.personality];
  }

  // ── Helpers ────────────────────────────────────────────────
  _rand() { return Math.random(); }

  /* Strategic worth of a group, as this particular opponent sees it. */
  _groupValue(group) {
    return (GROUP_VALUE[group] || 0) * ((this.traits.bias || {})[group] || 1);
  }

  /* The cash it wants left in hand after doing something. */
  _reserve(base) { return Math.round(base * this.traits.cashFloor); }

  _getPlayer(game) { return game.players[this.playerId]; }

  _delay() {
    // Thinking delay in ms based on difficulty
    const base = this.difficulty === 'easy' ? 600 : this.difficulty === 'medium' ? 900 : 1200;
    return base + Math.floor(Math.random() * 400);
  }

  // Count how many properties in a group the player owns
  _groupOwnership(group, game) {
    const groupSpaces = getGroupSpaces(group);
    const owned = groupSpaces.filter(s => game.state.properties[s.id]?.owner === this.playerId);
    return { owned: owned.length, total: groupSpaces.length, spaces: groupSpaces };
  }

  // Check if buying this would complete a color group
  _wouldCompleteGroup(spaceId, game) {
    const space = BOARD_SPACES[spaceId];
    if (!space.group || space.type === 'railroad' || space.type === 'utility') return false;
    const { owned, total } = this._groupOwnership(space.group, game);
    return owned === total - 1; // buying this completes it
  }

  // How many properties of a group do opponents own?
  _opponentGroupOwnership(group, game) {
    const groupSpaces = getGroupSpaces(group);
    return groupSpaces.filter(s => {
      const owner = game.state.properties[s.id]?.owner;
      return owner !== null && owner !== this.playerId;
    }).length;
  }

  // ── Buy Decision ──────────────────────────────────────────
  decideBuy(spaceId, game) {
    const space = BOARD_SPACES[spaceId];
    const player = this._getPlayer(game);
    const price = space.price;

    if (player.money < price) return 'auction';

    switch (this.difficulty) {
      case 'easy':
        // 50% chance to buy, less likely if expensive
        return this._rand() < 0.5 && player.money > price * 1.5 ? 'buy' : 'auction';

      case 'medium':
        // Buy if the reserve it likes to keep survives the purchase
        if (player.money - price >= this._reserve(200)) return 'buy';
        // Still buy railroads/utilities
        if ((space.type === 'railroad' || space.type === 'utility') &&
            player.money - price >= this._reserve(100)) return 'buy';
        return 'auction';

      case 'hard':
        // Always buy if would complete a group
        if (this._wouldCompleteGroup(spaceId, game)) return 'buy';
        // Buy if blocks opponent from completing
        if (this._opponentGroupOwnership(space.group, game) >= 1) return 'buy';
        // Buy railroads aggressively — more so for a collector
        if (space.type === 'railroad' && this._groupValue('railroad') >= 6) return 'buy';
        // Buy if can afford with its usual reserve
        if (player.money - price >= this._reserve(150)) return 'buy';
        // Buy cheap properties even with low reserve
        if (price <= 150 && player.money - price >= this._reserve(50)) return 'buy';
        return 'auction';
    }
  }

  // ── Auction Bidding ───────────────────────────────────────
  decideAuctionBid(spaceId, currentBid, game) {
    const space = BOARD_SPACES[spaceId];
    const player = this._getPlayer(game);
    const price = space.price || 200;

    switch (this.difficulty) {
      case 'easy': {
        // Bid low, sometimes pass
        if (this._rand() < 0.4) return 0; // pass
        const maxBid = Math.floor(price * 0.5);
        if (currentBid >= maxBid || currentBid >= player.money - 100) return 0;
        return currentBid + 10;
      }
      case 'medium': {
        const maxBid = Math.floor(price * 0.75 * this.traits.auctionNerve);
        if (currentBid >= maxBid || currentBid >= player.money - this._reserve(200)) return 0;
        return currentBid + Math.floor(10 + this._rand() * 20);
      }
      case 'hard': {
        const nerve = this.traits.auctionNerve;
        let maxBid = Math.floor(price * 0.9 * nerve);
        // Pay more for group-completing properties
        if (this._wouldCompleteGroup(spaceId, game)) maxBid = Math.floor(price * 1.5 * nerve);
        // Pay more to block opponents
        else if (this._opponentGroupOwnership(space.group, game) >= 1) maxBid = Math.floor(price * nerve);
        maxBid = Math.min(maxBid, player.money - this._reserve(100));
        if (currentBid >= maxBid) return 0;
        const increment = Math.floor(10 + this._rand() * 30);
        return Math.min(currentBid + increment, maxBid);
      }
    }
  }

  // ── Jail Decision ─────────────────────────────────────────
  decideJail(game) {
    const player = this._getPlayer(game);
    const hasCard = player.jailCards.length > 0;

    switch (this.difficulty) {
      case 'easy':
        // Random choice
        if (hasCard && this._rand() < 0.5) return 'card';
        if (player.money >= 50 && this._rand() < 0.3) return 'pay';
        return 'roll';

      case 'medium':
        // Use card if available, otherwise pay early
        if (hasCard) return 'card';
        if (player.jailTurns >= 2) return player.money >= 50 ? 'pay' : 'roll';
        return 'roll';

      case 'hard': {
        // Late game: stay in jail (avoid landing on developed properties)
        const activePlayers = game.players.filter(p => !p.bankrupt);
        const totalHouses = Object.values(game.state.properties).reduce((sum, p) => sum + (p.houses || 0), 0);
        const isLateGame = totalHouses > 10 || activePlayers.length <= 2;

        if (isLateGame && player.jailTurns < 2) {
          return 'roll'; // try to stay in jail by rolling (hoping no doubles)
        }
        if (hasCard) return 'card';
        if (player.money >= 50) return 'pay';
        return 'roll';
      }
    }
  }

  // ── Building Decision ─────────────────────────────────────
  // Returns array of spaceIds to build on (in order)
  decideBuilding(game) {
    const player = this._getPlayer(game);
    const buildActions = [];

    switch (this.difficulty) {
      case 'easy': {
        // Build randomly on one property if has lots of money
        if (player.money < this._reserve(500)) return [];
        const buildable = player.properties.filter(id =>
          canBuildHouse(this.playerId, id, game.state) &&
          player.money - BOARD_SPACES[id].housePrice >= this._reserve(300)
        );
        if (buildable.length > 0 && this._rand() < 0.4 * this.traits.buildEagerness) {
          buildActions.push(buildable[Math.floor(this._rand() * buildable.length)]);
        }
        return buildActions;
      }

      case 'medium': {
        // Build evenly across monopolies once its reserve is comfortable
        if (player.money < this._reserve(400)) return [];
        const buildable = player.properties.filter(id =>
          canBuildHouse(this.playerId, id, game.state)
        );
        // Sort by cheapest first
        buildable.sort((a, b) => (BOARD_SPACES[a].housePrice || 0) - (BOARD_SPACES[b].housePrice || 0));
        let budget = player.money - this._reserve(300);
        for (const id of buildable) {
          const cost = BOARD_SPACES[id].housePrice;
          if (budget >= cost) {
            buildActions.push(id);
            budget -= cost;
          }
        }
        return buildActions;
      }

      case 'hard': {
        // Strategic: prioritize high-value groups, build to 3 houses (sweet spot)
        if (player.money < this._reserve(300)) return [];
        const buildable = player.properties.filter(id =>
          canBuildHouse(this.playerId, id, game.state)
        );
        // Score by group value and current houses
        buildable.sort((a, b) => {
          const ga = BOARD_SPACES[a].group;
          const gb = BOARD_SPACES[b].group;
          const ha = game.state.properties[a].houses || 0;
          const hb = game.state.properties[b].houses || 0;
          // Prioritize getting to 3 houses (biggest rent jump)
          const scoreA = this._groupValue(ga) * (ha < 3 ? 3 : 1);
          const scoreB = this._groupValue(gb) * (hb < 3 ? 3 : 1);
          return scoreB - scoreA;
        });
        let budget = player.money - this._reserve(200);
        for (const id of buildable) {
          const cost = BOARD_SPACES[id].housePrice;
          if (budget >= cost) {
            buildActions.push(id);
            budget -= cost;
          }
        }
        return buildActions;
      }
    }
  }

  // ── Trading ───────────────────────────────────────────────
  //
  // The computer used to have no opinion about a trade at all: you clicked
  // "Accept" on its behalf, and it never opened one itself. Since monopolies
  // rarely form without trading, that quietly flattened the whole middle of
  // the game. Everything below is what it thinks a deal is worth.

  /* What a deed is worth in the hands of `ownerId` — not its printed price.
     A property that completes a set is worth far more than one that does not,
     and the fourth railroad is worth more than the first. */
  _propertyWorth(spaceId, game, ownerId) {
    const space = BOARD_SPACES[spaceId];
    const prop = game.state.properties[spaceId];
    if (!space || !prop) return 0;

    // A mortgaged deed comes with its debt attached.
    let base = prop.mortgaged ? (space.mortgage || 0) * 0.85 : (space.price || 0);
    let multiplier = 1;

    if (space.type === 'railroad') {
      const owned = [5, 15, 25, 35]
        .filter(id => game.state.properties[id].owner === ownerId).length;
      multiplier = 1 + 0.35 * owned;
    } else if (space.type === 'utility') {
      const owned = [12, 28]
        .filter(id => game.state.properties[id].owner === ownerId).length;
      multiplier = 1 + 0.3 * owned;
    } else {
      const groupSpaces = getGroupSpaces(space.group);
      const held = groupSpaces
        .filter(sp => game.state.properties[sp.id].owner === ownerId && sp.id !== spaceId)
        .length;
      if (held === groupSpaces.length - 1) multiplier = 2.6;   // completes the set
      else if (held > 0) multiplier = 1.45;                    // builds towards it
    }

    // Taste: a collector pays over the odds for railroads, a tycoon for orange.
    const flavour = 0.75 + 0.05 * this._groupValue(space.group);
    return Math.round(base * multiplier * flavour);
  }

  /* Would handing this deed to `ownerId` finish a colour group for them? That
     is the one thing worth refusing a profitable trade over. */
  _completesGroupFor(spaceId, ownerId, game) {
    const space = BOARD_SPACES[spaceId];
    if (!space || space.type !== 'property' || !space.group) return false;
    const groupSpaces = getGroupSpaces(space.group);
    return groupSpaces.every(sp =>
      sp.id === spaceId || game.state.properties[sp.id].owner === ownerId);
  }

  /* Cash is not worth the same to everyone at every moment: a player one bad
     landing from bankruptcy values a dollar more than one sitting on $3,000. */
  _cashWeight(game) {
    const player = this._getPlayer(game);
    const comfortable = this._reserve(500);
    if (player.money < comfortable) return 1.35;
    if (player.money > comfortable * 4) return 0.85;
    return 1;
  }

  /* Answer an offer. `deal` is written from the proposer's side, so what they
     "give" is what this player gets. Returns { accept, reason }. */
  decideTrade(deal, game) {
    if (!deal || deal.toId !== this.playerId) return { accept: false, reason: 'not mine to answer' };

    const partnerId = deal.fromId;
    const cash = this._cashWeight(game);
    const player = this._getPlayer(game);

    const gainProps = (deal.giveProps || []).map(Number);
    const loseProps = (deal.getProps || []).map(Number);
    const gainMoney = Math.max(0, deal.giveMoney || 0);
    const loseMoney = Math.max(0, deal.getMoney || 0);

    if (loseMoney > player.money) return { accept: false, reason: 'it cannot afford that' };

    let gain = gainMoney / cash + (deal.giveJailCards || 0) * 60;
    gainProps.forEach(id => {
      gain += this._propertyWorth(id, game, this.playerId);
      // Taking a deed that would have completed their set is worth extra.
      if (this._completesGroupFor(id, partnerId, game)) gain += 0.6 * this._propertyWorth(id, game, partnerId);
    });

    let cost = loseMoney * cash + (deal.getJailCards || 0) * 60;
    let handsOverAMonopoly = false;
    loseProps.forEach(id => {
      cost += this._propertyWorth(id, game, this.playerId);
      if (this._completesGroupFor(id, partnerId, game)) {
        handsOverAMonopoly = true;
        /* What it costs to complete somebody's set is most of what the set is
           worth to them — enough that it takes a serious offer, not so much
           that the deed is simply not for sale. A hard player refuses outright
           below, which is where "not for sale" belongs. */
        cost += 0.9 * this._propertyWorth(id, game, partnerId);
      }
    });

    const gainsAMonopoly = gainProps.some(id => this._completesGroupFor(id, this.playerId, game));

    // How much better than even it wants the deal to be.
    const margins = { easy: 0.85, medium: 1.05, hard: 1.2 };
    const required = (margins[this.difficulty] || 1.05) * this.traits.tradeMargin;

    if (this.difficulty === 'easy') {
      // Easy players are talked into things.
      const noise = 0.8 + this._rand() * 0.5;
      return gain * noise >= cost * required
        ? { accept: true }
        : { accept: false, reason: 'it does not fancy the deal' };
    }

    if (this.difficulty === 'hard' && handsOverAMonopoly && !gainsAMonopoly) {
      return { accept: false, reason: 'it will not hand over a colour group' };
    }

    if (cost <= 0) return { accept: true };
    return gain >= cost * required
      ? { accept: true }
      : { accept: false, reason: 'it wants more than that' };
  }

  /* Open a negotiation. Looks for the one deed that would complete a set,
     works out what it can afford to pay for it, and sweetens the offer with a
     spare property when it has one going begging.

     Returns a deal in the same shape the trade builder produces, or null. */
  proposeTrade(game) {
    if (this.difficulty === 'easy') return null;         // easy players do not scheme
    if (this._rand() > this.traits.tradeUrge) return null;

    const me = this._getPlayer(game);
    if (me.bankrupt) return null;

    const wanted = [];
    Object.keys(COLOR_GROUPS).forEach(group => {
      const groupSpaces = getGroupSpaces(group);
      if (!groupSpaces.length) return;
      // Buildings anywhere in a group freeze every deed in it.
      if (groupSpaces.some(sp => (game.state.properties[sp.id].houses || 0) > 0)) return;

      const missing = groupSpaces.filter(sp => game.state.properties[sp.id].owner !== this.playerId);
      if (missing.length !== 1) return;

      const target = missing[0];
      const ownerId = game.state.properties[target.id].owner;
      if (ownerId === null || ownerId === undefined) return;   // the bank's: buy it by landing
      const owner = game.players[ownerId];
      if (!owner || owner.bankrupt) return;

      wanted.push({ spaceId: target.id, ownerId, score: this._groupValue(group) });
    });

    if (!wanted.length) return null;
    wanted.sort((a, b) => b.score - a.score);
    const pick = wanted[0];
    const space = BOARD_SPACES[pick.spaceId];

    // What it will pay: over the odds, but never into its own reserve.
    const eagerness = this.difficulty === 'hard' ? 1.45 : 1.2;
    const ceiling = me.money - this._reserve(250);
    if (ceiling <= 0) return null;
    let offerMoney = Math.min(Math.round((space.price || 100) * eagerness), ceiling);
    offerMoney = Math.max(0, Math.round(offerMoney / 10) * 10);

    // A spare deed makes a cash offer land better: something in a group this
    // player is not going to finish, and ideally one the other player is.
    const spares = me.properties.filter(id => {
      const sp = BOARD_SPACES[id];
      const prop = game.state.properties[id];
      if (prop.mortgaged || (prop.houses || 0) > 0) return false;
      if (sp.type !== 'property') return false;
      const groupSpaces = getGroupSpaces(sp.group);
      if (groupSpaces.some(g => (game.state.properties[g.id].houses || 0) > 0)) return false;
      const mine = groupSpaces.filter(g => game.state.properties[g.id].owner === this.playerId).length;
      return mine === 1 && groupSpaces.length > 1;         // a lone deed, going nowhere
    }).sort((a, b) => this._propertyWorth(a, game, this.playerId) -
                      this._propertyWorth(b, game, this.playerId));

    const deal = {
      fromId: this.playerId,
      toId: pick.ownerId,
      giveProps: [],
      getProps: [pick.spaceId],
      giveMoney: offerMoney,
      getMoney: 0,
      giveJailCards: 0,
      getJailCards: 0
    };

    // Only sweeten when the cash alone looks thin, and never with a deed that
    // finishes a set for them.
    const worthToThem = this._propertyWorth(pick.spaceId, game, pick.ownerId);
    if (offerMoney < worthToThem && spares.length) {
      const sweetener = spares.find(id => !this._completesGroupFor(id, pick.ownerId, game));
      if (sweetener !== undefined) deal.giveProps.push(sweetener);
    }

    if (!deal.giveMoney && !deal.giveProps.length) return null;
    return deal;
  }

  /* The speed die's triple: name any space on the board. */
  decideAnywhere(game) {
    const player = this._getPlayer(game);
    const candidates = BOARD_SPACES.filter(space => {
      const prop = game.state.properties[space.id];
      return prop && prop.owner === null && (space.price || 0) <= player.money;
    });

    if (candidates.length) {
      candidates.sort((a, b) => {
        const completes = (sp) => this._wouldCompleteGroup(sp.id, game) ? 1000 : 0;
        return (completes(b) + this._propertyWorth(b.id, game, this.playerId)) -
               (completes(a) + this._propertyWorth(a.id, game, this.playerId));
      });
      return candidates[0].id;
    }
    return 0;   // nothing worth buying: take the $200 for passing GO
  }

  // ── Raise Funds Decision ──────────────────────────────────
  // Returns sequence of { action: 'mortgage'|'sell', spaceId } to raise funds
  decideRaiseFunds(amountNeeded, game) {
    const player = this._getPlayer(game);
    const actions = [];
    let available = player.money;

    // First: sell buildings (most liquid)
    const withBuildings = player.properties
      .filter(id => (game.state.properties[id]?.houses || 0) > 0)
      .sort((a, b) => {
        if (this.difficulty === 'hard') {
          // Sell from least valuable group first
          return this._groupValue(BOARD_SPACES[a].group) - this._groupValue(BOARD_SPACES[b].group);
        }
        return (game.state.properties[b]?.houses || 0) - (game.state.properties[a]?.houses || 0);
      });

    for (const id of withBuildings) {
      if (available >= amountNeeded) break;
      while ((game.state.properties[id]?.houses || 0) > 0 &&
             canSellHouse(this.playerId, id, game.state) &&
             available < amountNeeded) {
        const value = Math.floor((BOARD_SPACES[id].housePrice || 0) / 2);
        actions.push({ action: 'sell', spaceId: id });
        available += value;
      }
    }

    // Then: mortgage properties
    if (available < amountNeeded) {
      const mortgageable = player.properties
        .filter(id => {
          const prop = game.state.properties[id];
          return !prop.mortgaged && (prop.houses || 0) === 0;
        })
        .sort((a, b) => {
          if (this.difficulty === 'hard') {
            // Mortgage isolated properties first, protect monopoly groups
            const aHasGroup = ownsFullGroup(this.playerId, BOARD_SPACES[a].group, game.state);
            const bHasGroup = ownsFullGroup(this.playerId, BOARD_SPACES[b].group, game.state);
            if (aHasGroup !== bHasGroup) return aHasGroup ? 1 : -1; // mortgage non-group first
            return this._groupValue(BOARD_SPACES[a].group) - this._groupValue(BOARD_SPACES[b].group);
          }
          return (BOARD_SPACES[a].mortgage || 0) - (BOARD_SPACES[b].mortgage || 0);
        });

      for (const id of mortgageable) {
        if (available >= amountNeeded) break;
        actions.push({ action: 'mortgage', spaceId: id });
        available += BOARD_SPACES[id].mortgage || 0;
      }
    }

    return actions;
  }
}
