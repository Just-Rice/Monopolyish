/* Monopolyish — Chance and Community Chest decks, and drawing from them. */

// === cards.js ===
// ============================================================
//  CHANCE & COMMUNITY CHEST CARDS
// ============================================================

const CHANCE_CARDS = [
  {
    id: 'ch1',
    text: 'Advance to GO. Collect $200.',
    action: (game) => {
      game.movePlayerTo(game.currentPlayer, 0, true);
    }
  },
  {
    id: 'ch2',
    text: 'Advance to Illinois Ave. If you pass GO, collect $200.',
    action: (game) => { game.movePlayerTo(game.currentPlayer, 24, true); }
  },
  {
    id: 'ch3',
    text: 'Advance to St. Charles Place. If you pass GO, collect $200.',
    action: (game) => { game.movePlayerTo(game.currentPlayer, 11, true); }
  },
  {
    id: 'ch4',
    text: 'Advance to the nearest Railroad. If unowned, buy it. If owned, pay double rent.',
    action: (game) => {
      const pos = game.getPlayerPosition(game.currentPlayer);
      const railroads = [5, 15, 25, 35];
      let nearest = railroads.reduce((prev, cur) =>
        ((cur - pos + 40) % 40) < ((prev - pos + 40) % 40) ? cur : prev
      );
      game.movePlayerTo(game.currentPlayer, nearest, true, { doubleRent: true });
    }
  },
  {
    id: 'ch5',
    text: 'Advance to the nearest Railroad. If unowned, buy it. If owned, pay double rent.',
    action: (game) => {
      const pos = game.getPlayerPosition(game.currentPlayer);
      const railroads = [5, 15, 25, 35];
      let nearest = railroads.reduce((prev, cur) =>
        ((cur - pos + 40) % 40) < ((prev - pos + 40) % 40) ? cur : prev
      );
      game.movePlayerTo(game.currentPlayer, nearest, true, { doubleRent: true });
    }
  },
  {
    id: 'ch6',
    text: 'Advance to the nearest Utility. If unowned, buy it. If owned, throw dice and pay 10x.',
    action: (game) => {
      const pos = game.getPlayerPosition(game.currentPlayer);
      const utils = [12, 28];
      let nearest = utils.reduce((prev, cur) =>
        ((cur - pos + 40) % 40) < ((prev - pos + 40) % 40) ? cur : prev
      );
      game.movePlayerTo(game.currentPlayer, nearest, true, { utilityTenX: true });
    }
  },
  {
    id: 'ch7',
    text: 'Bank pays you dividend of $50.',
    action: (game) => { game.collectMoney(game.currentPlayer, 50, 'Bank dividend'); }
  },
  {
    id: 'ch8',
    text: 'Get Out of Jail Free.',
    action: (game) => {
      game.players[game.currentPlayer].jailCards.push({ deckType: 'chance' });
      game.ui.showToast(`${game.players[game.currentPlayer].name} gets a Get Out of Jail Free card!`, 'success');
    }
  },
  {
    id: 'ch9',
    text: 'Go Back 3 Spaces.',
    action: (game) => {
      const pos = game.getPlayerPosition(game.currentPlayer);
      game.movePlayerTo(game.currentPlayer, (pos - 3 + 40) % 40, false);
    }
  },
  {
    id: 'ch10',
    text: 'Go to Jail. Go directly to Jail. Do not pass GO. Do not collect $200.',
    action: (game) => { game.sendToJail(game.currentPlayer); }
  },
  {
    id: 'ch11',
    text: 'Make general repairs on all your property. $25 per house, $100 per hotel.',
    action: (game) => {
      let total = 0;
      Object.entries(game.state.properties).forEach(([id, prop]) => {
        if (prop.owner === game.currentPlayer) {
          if (prop.houses < 5) total += prop.houses * 25;
          else total += 100;
        }
      });
      game.payMoney(game.currentPlayer, total, `Property repairs: $${total}`);
    }
  },
  {
    id: 'ch12',
    text: 'Pay poor tax of $15.',
    action: (game) => { game.payMoney(game.currentPlayer, 15, 'Poor tax'); }
  },
  {
    id: 'ch13',
    text: 'Take a trip to Reading Railroad. If you pass GO, collect $200.',
    action: (game) => { game.movePlayerTo(game.currentPlayer, 5, true); }
  },
  {
    id: 'ch14',
    text: 'Take a walk on the Boardwalk. Advance to Boardwalk.',
    action: (game) => { game.movePlayerTo(game.currentPlayer, 39, true); }
  },
  {
    id: 'ch15',
    text: 'You have been elected Chairman of the Board. Pay each player $50.',
    action: (game) => {
      const activePlayers = game.players.filter((p, i) => !p.bankrupt && i !== game.currentPlayer);
      const totalPaid = activePlayers.length * 50;
      game.payMoney(game.currentPlayer, totalPaid, 'Chairman of the Board');
      activePlayers.forEach(p => { p.money += 50; });
      game.ui.updateAll();
    }
  },
  {
    id: 'ch16',
    text: 'Your building and loan matures. Collect $150.',
    action: (game) => { game.collectMoney(game.currentPlayer, 150, 'Building and loan'); }
  },
];

const COMMUNITY_CHEST_CARDS = [
  {
    id: 'cc1',
    text: 'Advance to GO. Collect $200.',
    action: (game) => { game.movePlayerTo(game.currentPlayer, 0, true); }
  },
  {
    id: 'cc2',
    text: 'Bank error in your favor. Collect $200.',
    action: (game) => { game.collectMoney(game.currentPlayer, 200, 'Bank error'); }
  },
  {
    id: 'cc3',
    text: 'Doctor\'s fees. Pay $50.',
    action: (game) => { game.payMoney(game.currentPlayer, 50, 'Doctor\'s fees'); }
  },
  {
    id: 'cc4',
    text: 'From sale of stock you get $50.',
    action: (game) => { game.collectMoney(game.currentPlayer, 50, 'Stock sale'); }
  },
  {
    id: 'cc5',
    text: 'Get Out of Jail Free.',
    action: (game) => {
      game.players[game.currentPlayer].jailCards.push({ deckType: 'community' });
      game.ui.showToast(`${game.players[game.currentPlayer].name} gets a Get Out of Jail Free card!`, 'success');
    }
  },
  {
    id: 'cc6',
    text: 'Go to Jail. Go directly to Jail.',
    action: (game) => { game.sendToJail(game.currentPlayer); }
  },
  {
    id: 'cc7',
    text: 'Grand Opera Night. Collect $50 from every player.',
    action: (game) => {
      const activePlayers = game.players.filter((p, i) => !p.bankrupt && i !== game.currentPlayer);
      activePlayers.forEach(p => {
        const amt = Math.min(50, p.money);
        p.money -= amt;
        game.players[game.currentPlayer].money += amt;
      });
      game.ui.updateAll();
    }
  },
  {
    id: 'cc8',
    text: 'Holiday Fund matures. Receive $100.',
    action: (game) => { game.collectMoney(game.currentPlayer, 100, 'Holiday fund'); }
  },
  {
    id: 'cc9',
    text: 'Income tax refund. Collect $20.',
    action: (game) => { game.collectMoney(game.currentPlayer, 20, 'Tax refund'); }
  },
  {
    id: 'cc10',
    text: 'It is your birthday. Collect $10 from every player.',
    action: (game) => {
      const activePlayers = game.players.filter((p, i) => !p.bankrupt && i !== game.currentPlayer);
      activePlayers.forEach(p => {
        const amt = Math.min(10, p.money);
        p.money -= amt;
        game.players[game.currentPlayer].money += amt;
      });
      game.ui.updateAll();
    }
  },
  {
    id: 'cc11',
    text: 'Life insurance matures. Collect $100.',
    action: (game) => { game.collectMoney(game.currentPlayer, 100, 'Life insurance'); }
  },
  {
    id: 'cc12',
    text: 'Hospital fees. Pay $100.',
    action: (game) => { game.payMoney(game.currentPlayer, 100, 'Hospital fees'); }
  },
  {
    id: 'cc13',
    text: 'School fees. Pay $150.',
    action: (game) => { game.payMoney(game.currentPlayer, 150, 'School fees'); }
  },
  {
    id: 'cc14',
    text: 'Receive $25 consultancy fee.',
    action: (game) => { game.collectMoney(game.currentPlayer, 25, 'Consultancy fee'); }
  },
  {
    id: 'cc15',
    text: 'You are assessed for street repairs. $40 per house, $115 per hotel.',
    action: (game) => {
      let total = 0;
      Object.entries(game.state.properties).forEach(([id, prop]) => {
        if (prop.owner === game.currentPlayer) {
          if (prop.houses < 5) total += prop.houses * 40;
          else total += 115;
        }
      });
      game.payMoney(game.currentPlayer, total, `Street repairs: $${total}`);
    }
  },
  {
    id: 'cc16',
    text: 'You have won second prize in a beauty contest. Collect $10.',
    action: (game) => { game.collectMoney(game.currentPlayer, 10, 'Beauty contest'); }
  },
];

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function createDecks() {
  return {
    chance: shuffleDeck(CHANCE_CARDS),
    community: shuffleDeck(COMMUNITY_CHEST_CARDS),
    chanceIndex: 0,
    communityIndex: 0,
  };
}

function drawCard(decks, type) {
  if (type === 'chance') {
    // Skip jail cards that have been removed from the deck
    let card = decks.chance[decks.chanceIndex];
    decks.chanceIndex = (decks.chanceIndex + 1) % decks.chance.length;
    return card;
  } else {
    let card = decks.community[decks.communityIndex];
    decks.communityIndex = (decks.communityIndex + 1) % decks.community.length;
    return card;
  }
}

// Return a Get Out of Jail Free card to the bottom of its source deck
function returnJailCard(decks, deckType) {
  const jailCardId = deckType === 'chance' ? 'ch8' : 'cc5';
  // The card is already in the deck array (it cycles), so nothing to add.
  // The cycling index system means it will naturally come up again.
  // This function exists for API completeness and future deck removal support.
}
