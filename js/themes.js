/* Monopolyish — board themes.
 *
 * A theme is a set of names, nothing more: the prices, rents, groups and
 * positions are the board's and never move. That keeps every rule, every AI
 * valuation and both test suites working against any theme, and makes writing
 * a new one a matter of listing 28 names.
 */

const BOARD_THEMES = {
  classic: {
    label: 'Atlantic City',
    title: 'MONOPOLY',
    subtitle: 'Classic Edition',
    names: {}                      // the board as property.js declares it
  },

  london: {
    label: 'London',
    title: 'MONOPOLY',
    subtitle: 'London Edition',
    names: {
      1: 'Old Kent Road',        3: 'Whitechapel Road',
      5: "King's Cross Station",
      6: 'The Angel Islington',  8: 'Euston Road',       9: 'Pentonville Road',
      11: 'Pall Mall',           12: 'Electric Company', 13: 'Whitehall',
      14: 'Northumberland Ave',  15: 'Marylebone Station',
      16: 'Bow Street',          18: 'Marlborough St',   19: 'Vine Street',
      21: 'Strand',              23: 'Fleet Street',     24: 'Trafalgar Square',
      25: 'Fenchurch St Station',
      26: 'Leicester Square',    27: 'Coventry Street',  28: 'Water Works',
      29: 'Piccadilly',
      31: 'Regent Street',       32: 'Oxford Street',    34: 'Bond Street',
      35: 'Liverpool St Station',
      37: 'Park Lane',           39: 'Mayfair',
      4: 'Income Tax',           38: 'Super Tax'
    }
  },

  world: {
    label: 'World Cities',
    title: 'MONOPOLY',
    subtitle: 'World Tour',
    names: {
      1: 'Cairo',        3: 'Lagos',
      5: 'North Line',
      6: 'Lima',         8: 'Bogotá',      9: 'Santiago',
      11: 'Warsaw',      12: 'Power Grid', 13: 'Prague',
      14: 'Lisbon',      15: 'East Line',
      16: 'Seoul',       18: 'Osaka',      19: 'Toronto',
      21: 'Berlin',      23: 'Madrid',     24: 'Rome',
      25: 'South Line',
      26: 'Amsterdam',   27: 'Sydney',     28: 'Water Board',
      29: 'Dubai',
      31: 'Shanghai',    32: 'Singapore',  34: 'Paris',
      35: 'West Line',
      37: 'New York',    39: 'Tokyo',
      4: 'Customs Duty', 38: 'Departure Tax'
    }
  },

  space: {
    label: 'Solar System',
    title: 'MONOPOLY',
    subtitle: 'Orbital Edition',
    names: {
      1: 'Low Orbit',      3: 'Lagrange 1',
      5: 'Launch Loop',
      6: 'Mare Crisium',   8: 'Tycho Base',    9: 'Sea of Rains',
      11: 'Phobos',        12: 'Solar Array',  13: 'Deimos',
      14: 'Olympus Mons',  15: 'Ion Ferry',
      16: 'Ceres Docks',   18: 'Vesta Yard',   19: 'Pallas Deep',
      21: 'Io Foundry',    23: 'Europa Wells', 24: 'Ganymede City',
      25: 'Slingshot Line',
      26: 'Titan Fields',  27: 'Enceladus',    28: 'Ice Refinery',
      29: 'Rhea Station',
      31: 'Miranda',       32: 'Titania',      34: 'Triton',
      35: 'Deep Space Line',
      37: 'Charon',        39: 'Pluto Station',
      4: 'Docking Fee',    38: 'Fuel Levy'
    }
  }
};

/* Which theme is in force. The board is drawn after the theme is chosen, so
   the middle of it has to be able to ask rather than be told. */
let activeThemeKey = 'classic';

function activeBoardTheme() {
  return BOARD_THEMES[activeThemeKey] || BOARD_THEMES.classic;
}

/* Renaming happens in place, because everything else already holds references
   into BOARD_SPACES. The first call records the original names so switching
   back to classic — or between two themes — never compounds. */
function applyBoardTheme(key) {
  const theme = BOARD_THEMES[key] || BOARD_THEMES.classic;
  activeThemeKey = BOARD_THEMES[key] ? key : 'classic';

  BOARD_SPACES.forEach(space => {
    if (space.baseName === undefined) space.baseName = space.name;
    space.name = theme.names[space.id] || space.baseName;
  });

  const titleEl = document.getElementById('board-theme-title');
  const subEl = document.getElementById('board-theme-subtitle');
  if (titleEl) titleEl.textContent = theme.title;
  if (subEl) subEl.textContent = theme.subtitle;

  return theme;
}

function boardThemeKeys() {
  return Object.keys(BOARD_THEMES);
}
