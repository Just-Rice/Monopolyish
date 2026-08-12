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

class AIPlayer {
  constructor(playerId, difficulty = 'medium') {
    this.playerId = playerId;
    this.difficulty = difficulty; // 'easy' | 'medium' | 'hard'
  }

  // ── Helpers ────────────────────────────────────────────────
  _rand() { return Math.random(); }

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
        // Buy if has $200+ reserve after purchase
        if (player.money - price >= 200) return 'buy';
        // Still buy railroads/utilities
        if ((space.type === 'railroad' || space.type === 'utility') && player.money - price >= 100) return 'buy';
        return 'auction';

      case 'hard':
        // Always buy if would complete a group
        if (this._wouldCompleteGroup(spaceId, game)) return 'buy';
        // Buy if blocks opponent from completing
        if (this._opponentGroupOwnership(space.group, game) >= 1) return 'buy';
        // Buy railroads aggressively
        if (space.type === 'railroad') return 'buy';
        // Buy if can afford with $150 reserve
        if (player.money - price >= 150) return 'buy';
        // Buy cheap properties even with low reserve
        if (price <= 150 && player.money - price >= 50) return 'buy';
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
        const maxBid = Math.floor(price * 0.75);
        if (currentBid >= maxBid || currentBid >= player.money - 200) return 0;
        return currentBid + Math.floor(10 + this._rand() * 20);
      }
      case 'hard': {
        let maxBid = Math.floor(price * 0.9);
        // Pay more for group-completing properties
        if (this._wouldCompleteGroup(spaceId, game)) maxBid = Math.floor(price * 1.5);
        // Pay more to block opponents
        else if (this._opponentGroupOwnership(space.group, game) >= 1) maxBid = price;
        maxBid = Math.min(maxBid, player.money - 100);
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
        if (player.money < 500) return [];
        const buildable = player.properties.filter(id =>
          canBuildHouse(this.playerId, id, game.state) &&
          player.money - BOARD_SPACES[id].housePrice >= 300
        );
        if (buildable.length > 0 && this._rand() < 0.4) {
          buildActions.push(buildable[Math.floor(this._rand() * buildable.length)]);
        }
        return buildActions;
      }

      case 'medium': {
        // Build evenly across monopolies when has $500+ reserve
        if (player.money < 400) return [];
        const buildable = player.properties.filter(id =>
          canBuildHouse(this.playerId, id, game.state)
        );
        // Sort by cheapest first
        buildable.sort((a, b) => (BOARD_SPACES[a].housePrice || 0) - (BOARD_SPACES[b].housePrice || 0));
        let budget = player.money - 300; // keep $300 reserve
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
        if (player.money < 300) return [];
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
          const scoreA = (GROUP_VALUE[ga] || 0) * (ha < 3 ? 3 : 1);
          const scoreB = (GROUP_VALUE[gb] || 0) * (hb < 3 ? 3 : 1);
          return scoreB - scoreA;
        });
        let budget = player.money - 200;
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
          return (GROUP_VALUE[BOARD_SPACES[a].group] || 0) - (GROUP_VALUE[BOARD_SPACES[b].group] || 0);
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
            return (GROUP_VALUE[BOARD_SPACES[a].group] || 0) - (GROUP_VALUE[BOARD_SPACES[b].group] || 0);
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
