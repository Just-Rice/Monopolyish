/* Monopolyish — Player creation, tokens, colours and net worth. */

// === player.js ===
// ============================================================
//  PLAYER STATE MANAGEMENT
// ============================================================

/* Full pool of selectable tokens.
 *
 * The default colours are the Okabe-Ito set, which stays distinguishable to
 * the common forms of colour blindness — the old palette had a red, a salmon
 * and a pink in it, and ownership on the board is shown by colour. Anyone who
 * wants the old look can still pick any colour they like at setup, and the
 * board marks each deed with the owner's token as well as their colour. */
const ALL_TOKENS = [
  { name: 'Hat',        emoji: '🎩', color: '#E69F00' },  // orange
  { name: 'Car',        emoji: '🚗', color: '#56B4E9' },  // sky blue
  { name: 'Dog',        emoji: '🐕', color: '#009E73' },  // bluish green
  { name: 'Battleship', emoji: '🚢', color: '#F0E442' },  // yellow
  { name: 'Cat',        emoji: '🐈', color: '#0072B2' },  // blue
  { name: 'Boot',       emoji: '👢', color: '#D55E00' },  // vermillion
  { name: 'Iron',       emoji: '♟️', color: '#CC79A7' },  // reddish purple
  { name: 'Rocket',     emoji: '🚀', color: '#8C8C8C' },  // grey
  { name: 'Star',       emoji: '⭐', color: '#DDCC77' },  // sand
  { name: 'Diamond',    emoji: '💎', color: '#44AA99' },  // teal
  { name: 'Crown',      emoji: '👑', color: '#882255' },  // wine
  { name: 'Dragon',     emoji: '🐉', color: '#117733' },  // forest
];

// Default assignments (first 4)
const TOKENS = ALL_TOKENS.slice(0, 4);

const PLAYER_COLORS = ALL_TOKENS.slice(0, 4).map(t => t.color);

function createPlayer(index, name, customToken, isAI = false, aiDifficulty = null,
                     aiPersonality = null) {
  const token = customToken || TOKENS[index];
  return {
    id: index,
    name: name || `Player ${index + 1}`,
    token: token,
    color: token.color,
    money: 1500,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: [],        // array of { deckType: 'chance'|'community' }
    bankrupt: false,
    properties: [],
    doublesCount: 0,
    conceded: false,
    isAI: isAI,
    aiDifficulty: aiDifficulty,   // 'easy' | 'medium' | 'hard' | null
    aiPersonality: aiPersonality, // a key of AI_PERSONALITIES, or null for pot luck
  };
}

function createPlayers(names, tokens, aiConfigs) {
  return names.map((name, i) => createPlayer(
    i, name,
    tokens ? tokens[i] : null,
    aiConfigs ? aiConfigs[i]?.isAI : false,
    aiConfigs ? aiConfigs[i]?.difficulty : null,
    aiConfigs ? aiConfigs[i]?.personality : null
  ));
}

function getPlayerNetWorth(player, properties, boardSpaces) {
  let worth = player.money;
  player.properties.forEach(spaceId => {
    const prop = properties[spaceId];
    const space = boardSpaces[spaceId];
    if (prop && space) {
      if (prop.mortgaged) {
        worth += space.mortgage || 0;
      } else {
        worth += space.price || 0;
        if (prop.houses) {
          const houseValue = (space.housePrice || 0) / 2;
          worth += prop.houses * houseValue;
        }
      }
    }
  });
  return worth;
}
