/* Monopolyish — Player creation, tokens, colours and net worth. */

// === player.js ===
// ============================================================
//  PLAYER STATE MANAGEMENT
// ============================================================

// Full pool of selectable tokens
const ALL_TOKENS = [
  { name: 'Hat',        emoji: '🎩', color: '#FF6B6B' },
  { name: 'Car',        emoji: '🚗', color: '#4ECDC4' },
  { name: 'Dog',        emoji: '🐕', color: '#FFE66D' },
  { name: 'Battleship', emoji: '🚢', color: '#A8E6CF' },
  { name: 'Cat',        emoji: '🐈', color: '#C9B1FF' },
  { name: 'Boot',       emoji: '👢', color: '#FFA07A' },
  { name: 'Iron',       emoji: '♟️', color: '#87CEFA' },
  { name: 'Rocket',     emoji: '🚀', color: '#FF85C2' },
  { name: 'Star',       emoji: '⭐', color: '#FFD700' },
  { name: 'Diamond',    emoji: '💎', color: '#40E0D0' },
  { name: 'Crown',      emoji: '👑', color: '#FFB347' },
  { name: 'Dragon',     emoji: '🐉', color: '#98FB98' },
];

// Default assignments (first 4)
const TOKENS = ALL_TOKENS.slice(0, 4);

const PLAYER_COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#FFE66D', // yellow
  '#A8E6CF', // mint
];

function createPlayer(index, name, customToken, isAI = false, aiDifficulty = null) {
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
    isAI: isAI,
    aiDifficulty: aiDifficulty, // 'easy' | 'medium' | 'hard' | null
  };
}

function createPlayers(names, tokens, aiConfigs) {
  return names.map((name, i) => createPlayer(
    i, name,
    tokens ? tokens[i] : null,
    aiConfigs ? aiConfigs[i]?.isAI : false,
    aiConfigs ? aiConfigs[i]?.difficulty : null
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
