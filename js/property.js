/* Monopolyish — Board layout, colour groups, rent and building rules. */

// === property.js ===
// ============================================================
//  PROPERTY DATA & RENT LOGIC
// ============================================================

const COLOR_GROUPS = {
  brown:      { color: '#8B4513', lightColor: '#A0522D', houseCount: 2 },
  lightblue:  { color: '#ADD8E6', lightColor: '#87CEEB', houseCount: 3 },
  pink:       { color: '#FF69B4', lightColor: '#FF85C2', houseCount: 3 },
  orange:     { color: '#FF8C00', lightColor: '#FFA500', houseCount: 3 },
  red:        { color: '#DC143C', lightColor: '#FF2052', houseCount: 3 },
  yellow:     { color: '#FFD700', lightColor: '#FFE44D', houseCount: 3 },
  green:      { color: '#228B22', lightColor: '#2EA82E', houseCount: 3 },
  darkblue:   { color: '#00008B', lightColor: '#0000CD', houseCount: 2 },
  railroad:   { color: '#1a1a1a', lightColor: '#333', houseCount: 0 },
  utility:    { color: '#708090', lightColor: '#8A9BB0', houseCount: 0 },
};

// All 40 board spaces in clockwise order starting from GO (index 0)
const BOARD_SPACES = [
  // Bottom row (right to left: indices 0-10)
  { id: 0,  name: 'GO',                type: 'go',        corner: true },
  { id: 1,  name: 'Mediterranean Ave', type: 'property',  group: 'brown',    price: 60,  housePrice: 50,  rent: [2, 10, 30, 90, 160, 250],  mortgage: 30 },
  { id: 2,  name: 'Community Chest',   type: 'community', },
  { id: 3,  name: 'Baltic Ave',        type: 'property',  group: 'brown',    price: 60,  housePrice: 50,  rent: [4, 20, 60, 180, 320, 450],  mortgage: 30 },
  { id: 4,  name: 'Income Tax',        type: 'tax',       amount: 200 },
  { id: 5,  name: 'Reading Railroad',  type: 'railroad',  group: 'railroad', price: 200, mortgage: 100 },
  { id: 6,  name: 'Oriental Ave',      type: 'property',  group: 'lightblue',price: 100, housePrice: 50,  rent: [6, 30, 90, 270, 400, 550],  mortgage: 50 },
  { id: 7,  name: 'Chance',            type: 'chance' },
  { id: 8,  name: 'Vermont Ave',       type: 'property',  group: 'lightblue',price: 100, housePrice: 50,  rent: [6, 30, 90, 270, 400, 550],  mortgage: 50 },
  { id: 9,  name: 'Connecticut Ave',   type: 'property',  group: 'lightblue',price: 120, housePrice: 50,  rent: [8, 40, 100, 300, 450, 600], mortgage: 60 },
  { id: 10, name: 'Jail / Just Visiting', type: 'jail',   corner: true },

  // Left column (bottom to top: indices 11-19)
  { id: 11, name: 'St. Charles Place', type: 'property',  group: 'pink',   price: 140, housePrice: 100, rent: [10, 50, 150, 450, 625, 750],  mortgage: 70 },
  { id: 12, name: 'Electric Company',  type: 'utility',   group: 'utility',price: 150, mortgage: 75 },
  { id: 13, name: 'States Ave',        type: 'property',  group: 'pink',   price: 140, housePrice: 100, rent: [10, 50, 150, 450, 625, 750],  mortgage: 70 },
  { id: 14, name: 'Virginia Ave',      type: 'property',  group: 'pink',   price: 160, housePrice: 100, rent: [12, 60, 180, 500, 700, 900],  mortgage: 80 },
  { id: 15, name: 'Pennsylvania RR',   type: 'railroad',  group: 'railroad',price: 200, mortgage: 100 },
  { id: 16, name: 'St. James Place',   type: 'property',  group: 'orange', price: 180, housePrice: 100, rent: [14, 70, 200, 550, 750, 950],  mortgage: 90 },
  { id: 17, name: 'Community Chest',   type: 'community' },
  { id: 18, name: 'Tennessee Ave',     type: 'property',  group: 'orange', price: 180, housePrice: 100, rent: [14, 70, 200, 550, 750, 950],  mortgage: 90 },
  { id: 19, name: 'New York Ave',      type: 'property',  group: 'orange', price: 200, housePrice: 100, rent: [16, 80, 220, 600, 800, 1000], mortgage: 100 },

  // Top row (left to right: indices 20-30)
  { id: 20, name: 'Free Parking',      type: 'freeparking', corner: true },
  { id: 21, name: 'Kentucky Ave',      type: 'property',  group: 'red',    price: 220, housePrice: 150, rent: [18, 90, 250, 700, 875, 1050], mortgage: 110 },
  { id: 22, name: 'Chance',            type: 'chance' },
  { id: 23, name: 'Indiana Ave',       type: 'property',  group: 'red',    price: 220, housePrice: 150, rent: [18, 90, 250, 700, 875, 1050], mortgage: 110 },
  { id: 24, name: 'Illinois Ave',      type: 'property',  group: 'red',    price: 240, housePrice: 150, rent: [20, 100, 300, 750, 925, 1100],mortgage: 120 },
  { id: 25, name: 'B&O Railroad',      type: 'railroad',  group: 'railroad',price: 200, mortgage: 100 },
  { id: 26, name: 'Atlantic Ave',      type: 'property',  group: 'yellow', price: 260, housePrice: 150, rent: [22, 110, 330, 800, 975, 1150],mortgage: 130 },
  { id: 27, name: 'Ventnor Ave',       type: 'property',  group: 'yellow', price: 260, housePrice: 150, rent: [22, 110, 330, 800, 975, 1150],mortgage: 130 },
  { id: 28, name: 'Water Works',       type: 'utility',   group: 'utility',price: 150, mortgage: 75 },
  { id: 29, name: 'Marvin Gardens',    type: 'property',  group: 'yellow', price: 280, housePrice: 150, rent: [24, 120, 360, 850, 1025, 1200],mortgage: 140 },
  { id: 30, name: 'Go To Jail',        type: 'gotojail',  corner: true },

  // Right column (top to bottom: indices 31-39)
  { id: 31, name: 'Pacific Ave',       type: 'property',  group: 'green',  price: 300, housePrice: 200, rent: [26, 130, 390, 900, 1100, 1275],mortgage: 150 },
  { id: 32, name: 'North Carolina Ave',type: 'property',  group: 'green',  price: 300, housePrice: 200, rent: [26, 130, 390, 900, 1100, 1275],mortgage: 150 },
  { id: 33, name: 'Community Chest',   type: 'community' },
  { id: 34, name: 'Pennsylvania Ave',  type: 'property',  group: 'green',  price: 320, housePrice: 200, rent: [28, 150, 450, 1000, 1200, 1400],mortgage: 160 },
  { id: 35, name: 'Short Line RR',     type: 'railroad',  group: 'railroad',price: 200, mortgage: 100 },
  { id: 36, name: 'Chance',            type: 'chance' },
  { id: 37, name: 'Park Place',        type: 'property',  group: 'darkblue',price: 350, housePrice: 200, rent: [35, 175, 500, 1100, 1300, 1500],mortgage: 175 },
  { id: 38, name: 'Luxury Tax',        type: 'tax',       amount: 100 },
  { id: 39, name: 'Boardwalk',         type: 'property',  group: 'darkblue',price: 400, housePrice: 200, rent: [50, 200, 600, 1400, 1700, 2000],mortgage: 200 },
];

// Group membership: which spaces belong to each color group
function getGroupSpaces(group) {
  return BOARD_SPACES.filter(s => s.group === group);
}

// Calculate rent for a property given game state
function calculateRent(spaceId, gameState) {
  const space = BOARD_SPACES[spaceId];
  if (!space || !['property','railroad','utility'].includes(space.type)) return 0;

  const prop = gameState.properties[spaceId];
  if (!prop || prop.owner === null || prop.mortgaged) return 0;

  const owner = gameState.players[prop.owner];

  if (space.type === 'railroad') {
    const railroadsOwned = [5, 15, 25, 35].filter(
      id => gameState.properties[id]?.owner === prop.owner && !gameState.properties[id]?.mortgaged
    ).length;
    return 25 * Math.pow(2, railroadsOwned - 1);
  }

  if (space.type === 'utility') {
    const utilitiesOwned = [12, 28].filter(
      id => gameState.properties[id]?.owner === prop.owner && !gameState.properties[id]?.mortgaged
    ).length;
    const multiplier = utilitiesOwned === 2 ? 10 : 4;
    return multiplier * gameState.lastDiceRoll;
  }

  // Color property
  const groupSpaces = getGroupSpaces(space.group);
  const ownsGroup = groupSpaces.every(s => gameState.properties[s.id]?.owner === prop.owner);

  const houses = prop.houses || 0;
  let rentIndex = houses; // 0=base, 1-4=houses, 5=hotel

  if (houses === 0 && ownsGroup) {
    // Double rent if owns full color group and no houses
    return space.rent[0] * 2;
  }

  return space.rent[rentIndex] || 0;
}

// Check if player owns full color group
function ownsFullGroup(playerId, group, gameState) {
  const groupSpaces = getGroupSpaces(group);
  return groupSpaces.every(s => gameState.properties[s.id]?.owner === playerId);
}

// Can a player build a house on a property?
function canBuildHouse(playerId, spaceId, gameState) {
  const space = BOARD_SPACES[spaceId];
  if (!space || space.type !== 'property') return false;
  const prop = gameState.properties[spaceId];
  if (!prop || prop.owner !== playerId || prop.mortgaged) return false;
  if (!ownsFullGroup(playerId, space.group, gameState)) return false;

  // Check no property in the group is mortgaged
  const groupSpaces = getGroupSpaces(space.group);
  if (groupSpaces.some(s => gameState.properties[s.id]?.mortgaged)) return false;

  const houses = prop.houses || 0;
  if (houses >= 5) return false; // 5 = hotel, max

  // Even build rule: can't build if another property in the group has fewer houses
  const minHouses = Math.min(...groupSpaces.map(s => gameState.properties[s.id]?.houses || 0));
  if (houses > minHouses) return false;

  // House/hotel supply check
  if (houses === 4) {
    // Upgrading to hotel: need 1 hotel available
    if (gameState.hotelsAvailable !== undefined && gameState.hotelsAvailable <= 0) return false;
  } else {
    // Building a house: need 1 house available
    if (gameState.housesAvailable !== undefined && gameState.housesAvailable <= 0) return false;
  }

  return true;
}

// Can a player sell a house on a property?
function canSellHouse(playerId, spaceId, gameState) {
  const space = BOARD_SPACES[spaceId];
  if (!space || space.type !== 'property') return false;
  const prop = gameState.properties[spaceId];
  if (!prop || prop.owner !== playerId) return false;

  const houses = prop.houses || 0;
  if (houses === 0) return false;

  // Even sell rule
  const groupSpaces = getGroupSpaces(space.group);
  const maxHouses = Math.max(...groupSpaces.map(s => gameState.properties[s.id]?.houses || 0));
  return houses >= maxHouses;
}

// Initialize property state for all purchasable spaces
function initProperties() {
  const props = {};
  BOARD_SPACES.forEach(space => {
    if (['property','railroad','utility'].includes(space.type)) {
      props[space.id] = {
        owner: null,
        houses: 0,      // 0-4 houses, 5 = hotel
        mortgaged: false,
      };
    }
  });
  return props;
}
