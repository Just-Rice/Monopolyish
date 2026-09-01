/* Headless smoke test for Monopolyish.
 *
 * There is no browser here, so this stubs enough DOM to let the game's scripts
 * load and run, then checks the board data, the decks and the pure rules
 * helpers. It exists mainly to catch a refactor going wrong: it runs against
 * whichever source layout is current, so the same numbers before and after a
 * split mean the split was clean.
 *
 * Run with: test/run.sh   (or jsc test/smoke.js from the project root)
 */

var fails = [];
var checksRun = 0;
function check(name, cond, detail) {
  checksRun++;
  if (!cond) fails.push(name + (detail ? ' — ' + detail : ''));
}

/* Promise callbacks have to have run before the checks that read their effect.
   jsc can flush them on the spot; elsewhere the next macrotask does it, so the
   engine's own setTimeout is kept here before the DOM stub below shadows it. */
var realSetTimeout = typeof setTimeout === 'function' ? setTimeout : null;
var lateChecks = function () {};
function afterMicrotasks(fn) {
  if (typeof drainMicrotasks === 'function') { drainMicrotasks(); return fn(); }
  if (realSetTimeout) return realSetTimeout(fn, 0);
  fn();
}

/* ------------------------------------------------------------ dom stub -- */

var timers = [];
function ClassList(el) { this.el = el; this.set = {}; }
ClassList.prototype.add = function () {
  for (var i = 0; i < arguments.length; i++) this.set[arguments[i]] = true;
};
ClassList.prototype.remove = function () {
  for (var i = 0; i < arguments.length; i++) delete this.set[arguments[i]];
};
ClassList.prototype.contains = function (c) { return !!this.set[c]; };
ClassList.prototype.toggle = function (c, force) {
  var on = force === undefined ? !this.set[c] : !!force;
  if (on) this.set[c] = true; else delete this.set[c];
  return on;
};

function El(tag) {
  this.tagName = String(tag).toUpperCase();
  this.children = [];
  this.style = {};
  this.dataset = {};
  this.classList = new ClassList(this);
  this._listeners = {};
  this.textContent = '';
  this._innerHTML = '';
  this.value = '';
  this.checked = false;
  this.disabled = false;
}
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { return this._innerHTML; },
  set: function (v) { this._innerHTML = v; if (v === '') this.children = []; }
});
Object.defineProperty(El.prototype, 'className', {
  get: function () { return Object.keys(this.classList.set).join(' '); },
  set: function (v) {
    this.classList.set = {};
    String(v).split(/\s+/).forEach(function (c) { if (c) this.classList.set[c] = true; }, this);
  }
});
/* The board builder sets innerHTML then reads firstElementChild off it. The
   stub does not parse HTML, so hand back a stand-in element instead of
   undefined — otherwise the harness fails on its own limitation. */
Object.defineProperty(El.prototype, 'firstElementChild', {
  get: function () {
    if (this.children.length) return this.children[0];
    if (this._innerHTML) return new El('div');
    return null;
  }
});
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; return c; };
El.prototype.removeChild = function (c) {
  this.children = this.children.filter(function (x) { return x !== c; });
  return c;
};
El.prototype.remove = function () {
  if (this.parentNode) this.parentNode.removeChild(this);
};
El.prototype.insertBefore = function (c) { return this.appendChild(c); };
El.prototype.addEventListener = function (t, fn) {
  (this._listeners[t] = this._listeners[t] || []).push(fn);
};
El.prototype.removeEventListener = function () {};
El.prototype.querySelector = function () { return new El('div'); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.getAttribute = function (k) { return this.dataset[k] || null; };
El.prototype.setAttribute = function (k, v) { this.dataset[k] = v; };
/* Dice faces are drawn on a canvas. */
El.prototype.getContext = function () {
  var noop = function () {};
  var ctx = {
    canvas: this, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1, shadowBlur: 0, shadowColor: ''
  };
  ['clearRect','fillRect','strokeRect','beginPath','closePath','moveTo','lineTo',
   'arc','arcTo','ellipse','rect','fill','stroke','save','restore','translate',
   'scale','rotate','fillText','strokeText','setTransform','drawImage','clip',
   'setLineDash','quadraticCurveTo','bezierCurveTo','roundRect']
    .forEach(function (m) { ctx[m] = noop; });
  ctx.createLinearGradient = ctx.createRadialGradient = function () {
    return { addColorStop: noop };
  };
  ctx.measureText = function (t) { return { width: String(t).length * 7 }; };
  return ctx;
};
El.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 400, height: 400 };
};
El.prototype.focus = function () {};
El.prototype.scrollIntoView = function () {};
El.prototype.closest = function () { return null; };
El.prototype.click = function () {
  (this._listeners.click || []).forEach(function (fn) {
    try { fn({ preventDefault: function () {}, stopPropagation: function () {}, target: this }); }
    catch (e) { fails.push('click handler threw: ' + (e.message || e)); }
  }, this);
};

var documentStub = new El('document');
documentStub.body = new El('body');
documentStub.head = new El('head');
documentStub.createElement = function (t) { return new El(t); };
documentStub.createTextNode = function (t) { var e = new El('text'); e.textContent = t; return e; };
documentStub.getElementById = function () { return new El('div'); };
documentStub.querySelector = function () { return new El('div'); };
documentStub.querySelectorAll = function () { return []; };
documentStub.addEventListener = El.prototype.addEventListener;

this.document = documentStub;
this.window = this;
this.navigator = { userAgent: 'jsc', language: 'en' };
this.location = { hash: '', href: '', reload: function () {} };
this.localStorage = {
  _d: {},
  getItem: function (k) { return k in this._d ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
this.setTimeout = function (fn, ms) { timers.push({ fn: fn, ms: ms || 0 }); return timers.length; };
/* Anything driven by timers — an auction going round the table, the computer
   thinking — is unreachable in a stub that only queues them. This runs the
   queue, and whatever the queue queues, until it settles. */
this.runTimers = function (rounds) {
  for (var r = 0; r < (rounds || 40); r++) {
    var batch = timers;
    timers = [];
    if (!batch.length) return;
    batch.sort(function (a, b) { return a.ms - b.ms; });
    for (var i = 0; i < batch.length; i++) {
      try { batch[i].fn(); } catch (e) { fails.push('a queued callback threw: ' + (e.message || e)); }
    }
  }
};
this.clearTimeout = function () {};
this.setInterval = function () { return 0; };      // the parking-pot ticker
this.clearInterval = function () {};
this.requestAnimationFrame = function (fn) { timers.push({ fn: fn, ms: 16 }); return timers.length; };
this.cancelAnimationFrame = function () {};
this.alert = function () {};
this.confirm = function () { return true; };
this.addEventListener = function () {};

/* --------------------------------------------------------------- load -- */

/* Reads whichever layout is current: the files index.html points at, or the
   script blocks still inside it. Both are concatenated and run inside one
   function, because `const` and `class` in separate evals would not see each
   other the way two <script> blocks on a page do. */
function gameSource() {
  var html = read('index.html');
  var srcs = [], m;
  var re = /<script src="([^"]+)"><\/script>/g;
  while ((m = re.exec(html))) srcs.push(m[1]);

  if (srcs.length) {
    return {
      where: srcs.join(', '),
      code: srcs.map(function (f) { return read(f); }).join('\n;\n')
    };
  }
  var blocks = [], b;
  var re2 = /<script>([\s\S]*?)<\/script>/g;
  while ((b = re2.exec(html))) blocks.push(b[1]);
  return { where: blocks.length + ' inline block(s) in index.html',
           code: blocks.join('\n;\n') };
}

var src = gameSource();
var G = {};
try {
  G = (0, eval)(
    '(function(){\n' + src.code + '\n' +
    'return {' +
    ['BOARD_SPACES','COLOR_GROUPS','CHANCE_CARDS','COMMUNITY_CHEST_CARDS',
     'ALL_TOKENS','TOKENS','PLAYER_COLORS','shuffleDeck','createDecks',
     'calculateRent','ownsFullGroup','getGroupSpaces','AIPlayer','UI','Game',
     'startLocalGame','MP','canBuildHouse','canSellHouse','rollDice',
     'Save','BOARD_THEMES','applyBoardTheme','boardThemeKeys',
     'AI_PERSONALITIES','aiPersonalityKeys','getPlayerNetWorth','SFX',
     'activeBoardTheme']
      .map(function (n) {
        return n + ': typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined';
      }).join(',') +
    '};})'
  )();
} catch (e) {
  fails.push('loading the game threw: ' + (e.message || e));
}

print('loaded: ' + src.where);

var BOARD_SPACES = G.BOARD_SPACES, COLOR_GROUPS = G.COLOR_GROUPS;
var CHANCE_CARDS = G.CHANCE_CARDS, COMMUNITY_CHEST_CARDS = G.COMMUNITY_CHEST_CARDS;
var shuffleDeck = G.shuffleDeck, createDecks = G.createDecks;
var AIPlayer = G.AIPlayer, UI = G.UI, Game = G.Game;

/* --------------------------------------------------------- board data -- */

check('BOARD_SPACES exists', typeof BOARD_SPACES !== 'undefined');
if (typeof BOARD_SPACES !== 'undefined') {
  check('the board has 40 spaces', BOARD_SPACES.length === 40, BOARD_SPACES.length + ' spaces');
  check('every space has a name and type',
        BOARD_SPACES.every(function (s) { return s && s.name && s.type; }),
        JSON.stringify(BOARD_SPACES.filter(function (s) { return !s || !s.name || !s.type; })[0]));

  var props = BOARD_SPACES.filter(function (s) { return s.type === 'property'; });
  var rails = BOARD_SPACES.filter(function (s) { return s.type === 'railroad'; });
  var utils = BOARD_SPACES.filter(function (s) { return s.type === 'utility'; });
  check('22 coloured properties', props.length === 22, props.length + '');
  check('4 railroads', rails.length === 4, rails.length + '');
  check('2 utilities', utils.length === 2, utils.length + '');

  check('every property has a price', props.every(function (s) { return s.price > 0; }));
  check('every property has a full rent table',
        props.every(function (s) { return Array.isArray(s.rent) && s.rent.length === 6; }),
        JSON.stringify(props.filter(function (s) { return !s.rent || s.rent.length !== 6; })
                            .map(function (s) { return s.name; })));
  check('rent rises with each house',
        props.every(function (s) {
          for (var i = 1; i < s.rent.length; i++) if (s.rent[i] <= s.rent[i - 1]) return false;
          return true;
        }),
        JSON.stringify(props.filter(function (s) {
          for (var i = 1; i < s.rent.length; i++) if (s.rent[i] <= s.rent[i - 1]) return true;
          return false;
        }).map(function (s) { return s.name; })));
  check('every property belongs to a known colour group',
        props.every(function (s) { return s.group && COLOR_GROUPS[s.group]; }),
        JSON.stringify(props.filter(function (s) { return !s.group || !COLOR_GROUPS[s.group]; })
                            .map(function (s) { return s.name; })));
}

/* The table also carries railroad and utility alongside the eight colours. */
var COLOURS = ['brown','lightblue','pink','orange','red','yellow','green','darkblue'];
check('COLOR_GROUPS covers all eight colour groups',
      COLOR_GROUPS && COLOURS.every(function (c) { return c in COLOR_GROUPS; }),
      COLOR_GROUPS ? COLOURS.filter(function (c) { return !(c in COLOR_GROUPS); }).join(',') : 'missing');
check('COLOR_GROUPS also covers railroads and utilities',
      COLOR_GROUPS && 'railroad' in COLOR_GROUPS && 'utility' in COLOR_GROUPS);

/* -------------------------------------------------------------- decks -- */

check('CHANCE_CARDS is a non-trivial deck',
      typeof CHANCE_CARDS !== 'undefined' && CHANCE_CARDS.length >= 12,
      typeof CHANCE_CARDS !== 'undefined' ? CHANCE_CARDS.length + ' cards' : 'missing');
check('COMMUNITY_CHEST_CARDS is a non-trivial deck',
      typeof COMMUNITY_CHEST_CARDS !== 'undefined' && COMMUNITY_CHEST_CARDS.length >= 12,
      typeof COMMUNITY_CHEST_CARDS !== 'undefined' ? COMMUNITY_CHEST_CARDS.length + ' cards' : 'missing');
if (typeof CHANCE_CARDS !== 'undefined') {
  check('every chance card has text',
        CHANCE_CARDS.every(function (c) { return c && (c.text || c.title); }),
        JSON.stringify(CHANCE_CARDS.filter(function (c) { return !c || !(c.text || c.title); })[0]));
}

/* ------------------------------------------------------- pure helpers -- */

if (typeof shuffleDeck === 'function') {
  var deck = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  var shuffled = shuffleDeck(deck.slice());
  check('shuffleDeck keeps every card',
        shuffled.slice().sort(function (a, b) { return a - b; }).join(',') === deck.join(','),
        shuffled.join(','));
  /* Over many shuffles the first card should not always be the same one. */
  var firsts = {};
  for (var i = 0; i < 200; i++) firsts[shuffleDeck(deck.slice())[0]] = true;
  check('shuffleDeck actually shuffles', Object.keys(firsts).length > 3,
        Object.keys(firsts).join(','));
}

if (typeof createDecks === 'function') {
  try {
    var d = createDecks();
    check('createDecks returns both decks', d && typeof d === 'object');
  } catch (e) { fails.push('createDecks threw: ' + (e.message || e)); }
}

check('the AI class loaded', typeof AIPlayer === 'function');
check('the UI class loaded', typeof UI === 'function');
check('the Game class loaded', typeof Game === 'function');

/* The online lobby starts the game by calling this directly. Synthesising a
   click on the button instead re-entered the online handler and re-hosted the
   room, dropping everybody already in it. */
check('startLocalGame is reachable from other files',
      typeof G.startLocalGame === 'function', typeof G.startLocalGame);
check('the online layer loaded', G.MP && typeof G.MP.snapshot === 'function');

/* ------------------------------------------------- starting a game ------ */

/* The online lobby calls startLocalGame directly. If that throws, the host
   silently stays in the lobby and the game never begins — which is exactly
   what was reported. */
if (typeof G.startLocalGame === 'function') {
  try {
    G.startLocalGame();
    check('startLocalGame runs without throwing', true);
  } catch (e) {
    fails.push('startLocalGame threw: ' + (e.message || e) +
               (e.stack ? ' @ ' + String(e.stack).split('\n')[0] : ''));
  }
}

/* ------------------------------------------------ money and the AI ------ */

/* Built directly rather than through the lobby, so the checks below are about
   the rules and not about the screen. */
if (typeof G.Game === 'function') {
  var g = new G.Game(['A', 'B'], ['car', 'hat']);

  /* A property changes hands for money in exactly one place, so that is where
     the money has to be checked. The AI asked before calling and the local
     modal only drew a Buy button when the player could afford it — but an
     answer arriving from another device was taken as given. */
  var buyer = g.players[0];
  var priced = -1;
  for (var i = 0; i < G.BOARD_SPACES.length; i++) {
    if (G.BOARD_SPACES[i].type === 'property' && G.BOARD_SPACES[i].price > 0) { priced = i; break; }
  }
  check('the board has something to buy', priced >= 0);

  var price = G.BOARD_SPACES[priced].price;
  buyer.money = price - 1;
  var owned = buyer.properties.length;
  var bought = g.purchaseProperty(0, priced, price);
  check('a purchase you cannot afford is refused', bought === false, String(bought));
  check('and costs nothing', buyer.money === price - 1, String(buyer.money));
  check('and hands over nothing', buyer.properties.length === owned &&
        g.state.properties[priced].owner === null);

  buyer.money = price;
  check('one you can afford goes through', g.purchaseProperty(0, priced, price) === true);
  check('and is paid for', buyer.money === 0, String(buyer.money));
  check('and is yours', g.state.properties[priced].owner === 0);

  /* The flag that stops two AI turns overlapping used to be cleared by hand at
     each exit, so anything that threw left it set and every later AI turn
     became a silent no-op — the computer stopped playing for good. */
  var g2 = new G.Game(['A', 'B'], ['car', 'hat']);
  g2._playAITurn = function () { throw new Error('deliberate'); };
  /* The failure below is the point of the check, so its console noise is not. */
  var realError = (typeof console !== 'undefined') ? console.error : null;
  if (realError) console.error = function () {};
  g2.runAITurn();
  if (realError) console.error = realError;
  check('a failed AI turn does not keep the lock',
        g2._aiRunning === false, String(g2._aiRunning));

  var ran = 0;
  var g3 = new G.Game(['A', 'B'], ['car', 'hat']);
  g3._playAITurn = function () { ran++; return Promise.resolve(ran < 3); };
  g3.runAITurn();
  lateChecks = function () {
  check('doubles go round again instead of re-entering', ran === 3, String(ran));
  check('and the lock is released at the end', g3._aiRunning === false);

  /* Collect-from-everyone cards used to take whatever a player happened to have
     and leave them solvent on paper, short-changing whoever drew the card. */
  var collectors = (G.COMMUNITY_CHEST_CARDS || []).filter(function (c) {
    return /Collect \$\d+ from every player/i.test(c.text);
  });
  check('the collect-from-everyone cards are still there', collectors.length === 2,
        String(collectors.length));
  collectors.forEach(function (card) {
    var g4 = new G.Game(['A', 'B'], ['car', 'hat']);
    var asked = [];
    g4.payRent = function (from, to, amount) { asked.push([from, to, amount]); };
    g4.currentPlayer = 0;
    card.action(g4);
    check('"' + card.text.slice(0, 24) + '…" bills through the debt system',
          asked.length === 1 && asked[0][0] === 1 && asked[0][1] === 0 && asked[0][2] > 0,
          JSON.stringify(asked));
  });
  };
}

/* ------------------------------------------------------------- rent ---- */

/* The rent tables are the game. None of them was checked: the suite proved a
   rent table rose, not that landing on the thing charged the right amount. */
if (typeof G.Game === 'function') {
  var rentGame = new G.Game(['A', 'B'], null);
  var rentOf = function (spaceId, roll) {
    return G.calculateRent(spaceId, Object.assign({}, rentGame.state, { lastDiceRoll: roll || 0 }));
  };
  var give = function (playerId, ids) {
    ids.forEach(function (id) {
      rentGame.state.properties[id].owner = playerId;
      rentGame.players[playerId].properties.push(id);
    });
  };

  check('an unowned property charges nothing', rentOf(1) === 0, String(rentOf(1)));

  give(0, [5]);
  check('one railroad charges $25', rentOf(5) === 25, String(rentOf(5)));
  give(0, [15]);
  check('two railroads charge $50', rentOf(5) === 50, String(rentOf(5)));
  give(0, [25]);
  check('three railroads charge $100', rentOf(5) === 100, String(rentOf(5)));
  give(0, [35]);
  check('four railroads charge $200', rentOf(5) === 200, String(rentOf(5)));

  rentGame.state.properties[35].mortgaged = true;
  check('a mortgaged railroad does not count towards the others',
        rentOf(5) === 100, String(rentOf(5)));
  check('and charges nothing itself', rentOf(35) === 0, String(rentOf(35)));
  rentGame.state.properties[35].mortgaged = false;

  give(0, [12]);
  check('one utility charges four times the roll', rentOf(12, 9) === 36, String(rentOf(12, 9)));
  give(0, [28]);
  check('both utilities charge ten times the roll', rentOf(12, 9) === 90, String(rentOf(12, 9)));

  give(0, [1]);
  check('a single deed charges its base rent',
        rentOf(1) === G.BOARD_SPACES[1].rent[0], String(rentOf(1)));
  give(0, [3]);
  check('a whole colour group charges double, unbuilt',
        rentOf(1) === G.BOARD_SPACES[1].rent[0] * 2, String(rentOf(1)));

  rentGame.state.properties[1].houses = 3;
  check('three houses charge the three-house rent',
        rentOf(1) === G.BOARD_SPACES[1].rent[3], String(rentOf(1)));
  rentGame.state.properties[1].houses = 5;
  check('a hotel charges the hotel rent',
        rentOf(1) === G.BOARD_SPACES[1].rent[5], String(rentOf(1)));
  rentGame.state.properties[1].mortgaged = true;
  check('a mortgaged property charges nothing', rentOf(1) === 0, String(rentOf(1)));
}

/* ------------------------------------------------------- building ------ */

if (typeof G.Game === 'function') {
  var b = new G.Game(['A', 'B'], null);
  var pinks = [11, 13, 14];
  pinks.forEach(function (id) {
    b.state.properties[id].owner = 0;
    b.players[0].properties.push(id);
  });
  b.players[0].money = 5000;

  check('you may build on a group you own whole',
        G.canBuildHouse(0, 11, b.state) === true);
  check('but not on one you do not', G.canBuildHouse(0, 1, b.state) === false);

  b.buildHouse(11);
  check('building takes the money and puts up a house',
        b.state.properties[11].houses === 1 && b.players[0].money === 4900,
        b.players[0].houses + ' / ' + b.players[0].money);
  check('and takes it out of the bank\'s supply',
        b.state.housesAvailable === 31, String(b.state.housesAvailable));
  check('the even-build rule stops a second house on the same deed',
        G.canBuildHouse(0, 11, b.state) === false);

  b.buildHouse(13); b.buildHouse(14);
  check('once the group is level, building resumes',
        G.canBuildHouse(0, 11, b.state) === true);
  check('and you may not sell from the deed with fewest',
        G.canSellHouse(0, 11, b.state) === true &&
        (b.buildHouse(11), G.canSellHouse(0, 13, b.state)) === false,
        String(b.state.properties[11].houses));

  // Up to a hotel, and the four houses come back to the bank.
  var before = b.state.housesAvailable;
  b.state.properties[11].houses = 4;
  b.state.properties[13].houses = 4;
  b.state.properties[14].houses = 4;
  b.buildHouse(11);
  check('a hotel returns its four houses to the supply',
        b.state.properties[11].houses === 5 && b.state.housesAvailable === before + 4,
        b.state.housesAvailable + ' vs ' + before);
  check('and takes a hotel out of it', b.state.hotelsAvailable === 11,
        String(b.state.hotelsAvailable));

  check('a mortgaged deed in the group stops building',
        (b.state.properties[13].mortgaged = true,
         G.canBuildHouse(0, 14, b.state)) === false);
}

/* ------------------------------------------------------ bankruptcy ----- */

if (typeof G.Game === 'function') {
  var bk = new G.Game(['A', 'B', 'C'], null);
  [1, 3].forEach(function (id) {
    bk.state.properties[id].owner = 0;
    bk.players[0].properties.push(id);
  });
  bk.state.properties[1].houses = 2;
  bk.state.housesAvailable -= 2;
  bk.players[0].money = 120;
  bk.players[0].jailCards.push({ deckType: 'chance' });

  var creditorCash = bk.players[1].money;
  var houseSupply = bk.state.housesAvailable;
  bk.declareBankruptcy(0, 1);

  check('a bankrupt player is out', bk.players[0].bankrupt === true);
  check('their cash goes to the creditor',
        bk.players[1].money === creditorCash + 120, String(bk.players[1].money));
  check('their deeds go with it',
        bk.state.properties[1].owner === 1 && bk.state.properties[3].owner === 1);
  check('their jail card goes too', bk.players[1].jailCards.length === 1);
  check('and the buildings go back to the bank',
        bk.state.housesAvailable === houseSupply + 2 && bk.state.properties[1].houses === 0,
        String(bk.state.housesAvailable));
  check('they keep nothing',
        bk.players[0].properties.length === 0 && bk.players[0].money === 0);

  // To the bank instead: the deeds are for sale again.
  var bk2 = new G.Game(['A', 'B', 'C'], null);
  bk2.state.properties[6].owner = 0;
  bk2.players[0].properties.push(6);
  bk2.state.properties[6].mortgaged = true;
  bk2.declareBankruptcy(0, -1);
  check('going bankrupt to the bank frees the deeds',
        bk2.state.properties[6].owner === null &&
        bk2.state.properties[6].mortgaged === false);

  // Last one standing wins.
  var bk3 = new G.Game(['A', 'B'], null);
  bk3.declareBankruptcy(1, 0);
  check('the last player standing ends the game',
        bk3.over === true && bk3.endReason === 'last player standing',
        String(bk3.endReason));
}

/* ------------------------------------------------------ house rules ---- */

if (typeof G.Game === 'function') {
  var noAuction = new G.Game(['A', 'B'], null, { noAuctions: true });
  var auctionsShown = 0;
  noAuction.ui.showAuctionModal = function () { auctionsShown++; };
  noAuction.startAuction(1);
  check('the no-auction rule leaves a declined deed with the bank',
        auctionsShown === 0 && noAuction.state.properties[1].owner === null);

  var auctioned = new G.Game(['A', 'B'], null);
  auctioned.ui.showAuctionModal = function () { auctionsShown++; };
  auctioned.startAuction(1);
  check('and without it, the deed goes under the hammer', auctionsShown === 1);

  var goGame = new G.Game(['A', 'B'], null, { exactGoBonus: true });
  goGame.players[0].money = 0;
  goGame.landOnSpace(0, 0);
  check('landing exactly on GO pays a second $200 when the rule is on',
        goGame.players[0].money === 200, String(goGame.players[0].money));

  var plainGo = new G.Game(['A', 'B'], null);
  plainGo.players[0].money = 0;
  plainGo.landOnSpace(0, 0);
  check('and nothing extra when it is off',
        plainGo.players[0].money === 0, String(plainGo.players[0].money));

  var jailRule = new G.Game(['A', 'B'], null, { noRentInJail: true });
  jailRule.state.properties[1].owner = 1;
  jailRule.players[1].properties.push(1);
  jailRule.players[1].inJail = true;
  jailRule.players[0].money = 1500;
  jailRule.handlePropertyLanding(0, 1);
  check('a landlord in jail collects no rent under the house rule',
        jailRule.players[0].money === 1500, String(jailRule.players[0].money));

  var shortGame = new G.Game(['A', 'B', 'C'], null, { shortGame: true });
  var dealt = shortGame.players.map(function (p) { return p.properties.length; });
  check('the short game deals two deeds to each player',
        dealt.every(function (n) { return n === 2; }), dealt.join(','));
  var owners = {};
  shortGame.players.forEach(function (p) {
    p.properties.forEach(function (id) { owners[id] = (owners[id] || 0) + 1; });
  });
  check('and never deals the same one twice',
        Object.keys(owners).every(function (id) { return owners[id] === 1; }));
  check('every dealt deed is recorded on the board too',
        shortGame.players.every(function (p) {
          return p.properties.every(function (id) {
            return shortGame.state.properties[id].owner === p.id;
          });
        }));

  var rich = new G.Game(['A', 'B'], null, { startingCash: 2500 });
  check('starting cash is settable',
        rich.players.every(function (p) { return p.money === 2500; }),
        String(rich.players[0].money));
}

/* ------------------------------------------------------- the clock ----- */

if (typeof G.Game === 'function') {
  var limited = new G.Game(['A', 'B'], null, { turnLimit: 2 });
  limited.players[0].money = 100;
  limited.players[1].money = 900;
  limited.phase = 'action';
  limited.turnNumber = 2;
  limited.currentPlayer = 1;
  limited.endTurn();                    // wraps back to player 0: round 3
  check('the round limit ends the game', limited.over === true, String(limited.turnNumber));
  check('and the richest player wins it',
        limited.standings()[0].player.id === 1,
        JSON.stringify(limited.standings().map(function (s) { return s.netWorth; })));

  var conceder = new G.Game(['A', 'B', 'C'], null);
  conceder.concede(1);
  check('conceding marks the player and takes them out',
        conceder.players[1].conceded === true && conceder.players[1].bankrupt === true);
  check('and does not end a game with players left', conceder.over === false);

  /* A debt has to survive the turn carrying on around it, or the player can
     roll and end their turn still owing the money. */
  var debtor = new G.Game(['A', 'B'], null);
  debtor.state.properties[39].owner = 1;
  debtor.players[1].properties.push(39);
  debtor.state.properties[37].owner = 0;
  debtor.players[0].properties.push(37);   // something to sell
  debtor.players[0].money = 5;
  debtor.handlePropertyLanding(0, 39);
  check('an unpayable rent leaves the game in debt',
        debtor.phase === 'debt' && !!debtor._pendingDebt, debtor.phase);
  check('and the turn cannot be ended while it stands',
        debtor.canEndTurn() === false && debtor.canRoll() === false);
}

/* ---------------------------------------------- questions and answers -- */

/* Some modals are questions the game is waiting on, and walking away from one
   leaves the turn with nothing to resolve it — pressing Escape on the buy
   prompt left the board unplayable. Each modal says which it is. */
if (typeof G.Game === 'function') {
  var q = new G.Game(['A', 'B'], null);
  q.showBuildMenu();
  check('the build menu is yours to close', q.ui.blocking === false, String(q.ui.blocking));

  q.ui.showPropertyModal(1);
  check('so is a deed you opened to read', q.ui.blocking === false);

  q.ui.showBuyModal(1, function () {}, function () {});
  check('buy or auction is a question, and stays put', q.ui.blocking === true);

  q.ui.closeModal();
  check('and closing a modal clears it again', q.ui.blocking === false);

  q.ui.showJailModal(q.players[0], function () {}, function () {}, function () {});
  check('the jail choice is a question too', q.ui.blocking === true);

  q.ui.showCardModal({ text: 'a card' }, 'chance', function () {});
  check('so is a card waiting to be acknowledged', q.ui.blocking === true);

  q.ui.showTradeOfferModal({ fromId: 0, toId: 1, giveProps: [], getProps: [],
                             giveMoney: 10, getMoney: 0 },
                           function () {}, function () {});
  check('and an offer put to you', q.ui.blocking === true);

  q.ui.showRaiseFundsModal(0, 200, 1, 'Rent');
  check('a debt cannot be dismissed', q.ui.blocking === true);

  q.ui.closeModal();
  q.ui.showTradeModal();
  check('but the trade builder is your own', q.ui.blocking === false);
}

/* ------------------------------------------------------ money at rest -- */

/* Nothing may mint money. Each of these cards moves money between players, and
   each of them used to get it wrong when somebody could not pay. */
if (typeof G.Game === 'function') {
  var inPlay = function (g) {
    return g.players.reduce(function (sum, p) { return sum + p.money; }, 0) +
           g.state.freeParkingPot;
  };
  var cardNamed = function (fragment) {
    return (G.CHANCE_CARDS || []).concat(G.COMMUNITY_CHEST_CARDS || [])
      .filter(function (c) { return c.text.indexOf(fragment) >= 0; })[0];
  };

  /* Paying everyone when you cannot afford it. The old card paid the whole sum
     to the bank and then handed every player $50 regardless, which conjured
     the difference out of nothing. */
  var chairman = cardNamed('Chairman of the Board');
  check('the chairman card is still in the deck', !!chairman);
  if (chairman) {
    var ch = new G.Game(['A', 'B', 'C'], null);
    ch.currentPlayer = 0;
    ch.players[0].money = 20;              // cannot cover two payments of $50
    var chBefore = inPlay(ch);
    chairman.action(ch);
    check('paying every player conserves the money in play',
          inPlay(ch) === chBefore, chBefore + ' -> ' + inPlay(ch));
    check('and the payer is bankrupted rather than paying what it does not have',
          ch.players[0].bankrupt === true && ch.players[0].money === 0);
  }

  /* Collecting from everyone when one of them goes bankrupt part-way round.
     Bankruptcy passes the turn on, and the card read whose turn it was on each
     pass — so the rest of the table paid whoever that turned out to be. */
  var opera = cardNamed('Grand Opera');
  if (opera) {
    var op = new G.Game(['A', 'B', 'C'], null);
    op.currentPlayer = 0;
    op.players[1].money = 5;               // goes under on the first payment
    op.players[2].money = 900;
    var opBefore = inPlay(op);
    var collectorMoney = op.players[0].money;
    opera.action(op);
    check('collecting from everyone conserves the money in play',
          inPlay(op) === opBefore, opBefore + ' -> ' + inPlay(op));
    check('and every payment goes to the player who drew the card',
          op.players[0].money > collectorMoney && op.players[2].money === 850,
          op.players.map(function (p) { return p.money; }).join(','));
  }
}

/* ------------------------------------------ what a card charges extra -- */

/* "Advance to the nearest railroad and pay double" and "…the nearest utility
   and pay ten times the roll" belong to the square the card sends you to. If
   nobody owns it, there is nothing to pay — and the instruction has to expire
   there rather than doubling the next rent that happens to come along. */
if (typeof G.Game === 'function') {
  var extra = new G.Game(['A', 'B'], null);
  extra.currentPlayer = 0;
  extra.lastRoll = { d1: 1, d2: 2, total: 3, doubles: true };
  extra._doubleRentModifier = true;
  extra.handlePropertyLanding(0, 5);            // an unowned railroad
  check('"pay double" is spent on the square the card sent you to',
        extra._doubleRentModifier === false);

  extra.state.properties[1].owner = 1;
  extra.players[1].properties.push(1);
  var before = extra.players[0].money;
  extra.handlePropertyLanding(0, 1);
  check('so the next rent is the rent, not twice the rent',
        before - extra.players[0].money === G.BOARD_SPACES[1].rent[0],
        String(before - extra.players[0].money));

  var tenx = new G.Game(['A', 'B'], null);
  tenx.currentPlayer = 0;
  tenx.lastDiceRoll = 9;
  tenx.lastRoll = { d1: 4, d2: 5, total: 9, doubles: false };
  tenx._utilityTenX = true;
  tenx.handlePropertyLanding(0, 12);            // an unowned utility
  check('and so is "ten times the roll"', tenx._utilityTenX === false);

  tenx.state.properties[28].owner = 1;
  tenx.players[1].properties.push(28);
  var beforeUtil = tenx.players[0].money;
  tenx.handlePropertyLanding(0, 28);
  check('leaving one utility charging four times the roll',
        beforeUtil - tenx.players[0].money === 36,
        String(beforeUtil - tenx.players[0].money));

  /* And when the square is owned, the card's instruction does apply. */
  var owed = new G.Game(['A', 'B'], null);
  owed.currentPlayer = 0;
  owed.state.properties[5].owner = 1;
  owed.players[1].properties.push(5);
  owed.lastRoll = { d1: 1, d2: 2, total: 3, doubles: false };
  owed._doubleRentModifier = true;
  var cash = owed.players[0].money;
  owed.handlePropertyLanding(0, 5);
  check('a card that says pay double, on a railroad someone owns, pays double',
        cash - owed.players[0].money === 50, String(cash - owed.players[0].money));
}

/* ------------------------------------------------ a move in flight ----- */

if (typeof G.Game === 'function') {
  /* A card that moves you takes a second to walk it out, and the square it
     lands on decides the phase. The turn used to be handed back the instant
     the card was acknowledged: you could end it mid-move, and the landing then
     resolved during somebody else's turn. */
  var mover = (G.CHANCE_CARDS || []).filter(function (c) {
    return /Advance to Illinois/.test(c.text);
  })[0];
  if (mover) {
    var mv = new G.Game(['A', 'B'], null);
    mv.currentPlayer = 0;
    mv.phase = 'rolling';
    mv.lastRoll = { d1: 1, d2: 2, total: 3, doubles: false };
    mv.ui.showCardModal = function (card, type, onClose) { onClose(); };
    mv.decks.chanceIndex = mv.decks.chance.indexOf(mover);
    mv.handleCardLanding(0, 'chance');
    check('a card that moves you holds the turn until the token lands',
          mv.canEndTurn() === false && mv.phase !== 'action',
          mv.phase + ' @ ' + mv.players[0].position);
  }

  /* ...and the flag has to come down again, or the next card — one that only
     pays money — leaves the turn with nobody to end it. */
  var payer = (G.CHANCE_CARDS || []).filter(function (c) {
    return /dividend of \$50/.test(c.text);
  })[0];
  if (payer) {
    var mv2 = new G.Game(['A', 'B'], null);
    mv2.currentPlayer = 0;
    mv2.lastRoll = { d1: 3, d2: 4, total: 7, doubles: false };
    mv2.phase = 'rolling';
    mv2.ui.showCardModal = function (card, type, onClose) { onClose(); };
    mv2.landOnSpace(0, 7);                 // Chance, drawing the money card
    mv2.decks.chanceIndex = mv2.decks.chance.indexOf(payer);
    mv2.ui.showCardModal = function (card, type, onClose) { onClose(); };
    mv2.handleCardLanding(0, 'chance');
    check('a card that only pays money gives the turn straight back',
          mv2.canEndTurn() === true, mv2.phase);
  }
}

/* --------------------------------------------------- the bank sells --- */

if (typeof G.Game === 'function') {
  var owned = new G.Game(['A', 'B'], null);
  owned.state.properties[1].owner = 1;
  owned.players[1].properties.push(1);
  var buyerCash = owned.players[0].money;
  check('a deed that is already owned is not for sale',
        owned.purchaseProperty(0, 1, 60) === false &&
        owned.state.properties[1].owner === 1 &&
        owned.players[0].money === buyerCash);

  /* Taking a mortgaged deed costs 10% interest, and that has to go through the
     same machinery as any other bill — it used to come straight out of the
     balance and could leave a player below zero with nothing said. */
  var interest = new G.Game(['A', 'B'], null);
  interest.state.properties[1].owner = 0;
  interest.players[0].properties.push(1);
  interest.state.properties[1].mortgaged = true;
  interest.players[1].money = 0;
  interest.executeTrade(0, 1, [1], [], 0, 0, 0, 0);
  check('interest on a mortgaged deed never leaves a player below zero',
        interest.players[1].money >= 0, String(interest.players[1].money));

  /* The deeds move first and the bills follow. Billing inside the transfer
     meant a player the interest bankrupted had everything returned to the bank
     half way through, and the rest was handed to someone already out. */
  var midway = new G.Game(['A', 'B', 'C'], null);
  [1, 3].forEach(function (id) {
    midway.state.properties[id].owner = 0;
    midway.players[0].properties.push(id);
    midway.state.properties[id].mortgaged = true;
  });
  midway.players[1].money = 0;
  midway.executeTrade(0, 1, [1, 3], [], 0, 0, 0, 0);

  var listedNotOwned = midway.players.reduce(function (bad, p) {
    return bad.concat(p.properties.filter(function (id) {
      return midway.state.properties[id].owner !== p.id;
    }));
  }, []);
  var ownedNotListed = Object.keys(midway.state.properties).filter(function (id) {
    var owner = midway.state.properties[id].owner;
    return owner !== null && midway.players[owner].properties.indexOf(Number(id)) < 0;
  });
  check('a trade that bankrupts someone still leaves the board consistent',
        listedNotOwned.length === 0 && ownedNotListed.length === 0,
        JSON.stringify([listedNotOwned, ownedNotListed]));
  check('and nothing is handed to a player who is already out',
        midway.players[1].properties.length === 0 || !midway.players[1].bankrupt,
        JSON.stringify(midway.players[1].properties));

  /* Going bankrupt twice paid the creditor twice. */
  var twice = new G.Game(['A', 'B'], null);
  twice.players[0].money = 300;
  var creditorBefore = twice.players[1].money;
  twice.declareBankruptcy(0, 1);
  twice.declareBankruptcy(0, 1);
  check('a player can only go bankrupt once',
        twice.players[1].money === creditorBefore + 300,
        String(twice.players[1].money));
}

/* --------------------------------------------------------- saving ----- */

if (typeof G.Save !== 'undefined' && typeof G.Game === 'function') {
  G.Save.clear();
  var owing = new G.Game(['A', 'B'], null);
  [1, 3, 6, 8, 9].forEach(function (id) {
    owing.state.properties[id].owner = 0;
    owing.players[0].properties.push(id);
  });
  owing.state.properties[39].owner = 1;
  owing.players[1].properties.push(39);
  owing.players[0].money = 5;
  owing.ui.showRaiseFundsModal = function () {};
  owing.handlePropertyLanding(0, 39);          // rent it cannot cover
  check('an unpayable rent raises a debt', !!owing._pendingDebt);
  owing.mortgageProperty(1, 0);                // raising funds triggers a save
  check('nothing is saved over an open debt, which a save cannot carry',
        G.Save.read() === null, JSON.stringify(G.Save.read() && G.Save.read().phase));
  G.Save.clear();
}

/* ------------------------------------------------------------- jail ---- */

/* Starting a turn in jail reached for a variable that was never declared, so
   it threw before the modal could be drawn and the turn went nowhere. */
if (typeof G.Game === 'function') {
  var jail = new G.Game(['A', 'B'], null);
  jail.players[0].inJail = true;
  jail.players[0].jailTurns = 1;
  jail.currentPlayer = 0;

  var offered = null;
  jail.ui.showJailModal = function (player) { offered = player; };
  var jailThrew = null;
  try { jail.handleJailOptions(); } catch (e) { jailThrew = e.message || String(e); }
  check('a turn that starts in jail offers the choices', jailThrew === null, jailThrew);
  check('and offers them to the player who is in there',
        offered === jail.players[0], String(offered && offered.name));

  /* Paying the fine has to actually open the doors. */
  var jail2 = new G.Game(['A', 'B'], null);
  jail2.players[0].inJail = true;
  jail2.currentPlayer = 0;
  jail2.ui.showJailModal = function (player, onPay) { onPay(); };
  jail2.handleJailOptions();
  check('paying the fine gets you out and lets you roll',
        jail2.players[0].inJail === false && jail2.players[0].money === 1450 &&
        jail2.phase === 'roll',
        jail2.players[0].money + '/' + jail2.phase);

  var jail3 = new G.Game(['A', 'B'], null);
  jail3.players[0].inJail = true;
  jail3.players[0].jailCards.push({ deckType: 'chance' });
  jail3.currentPlayer = 0;
  jail3.ui.showJailModal = function (player, onPay, onCard) { onCard(); };
  jail3.handleJailOptions();
  check('and so does the card, which is spent doing it',
        jail3.players[0].inJail === false && jail3.players[0].jailCards.length === 0 &&
        jail3.players[0].money === 1500);

  /* A fine you cannot cover in cash is a debt, and a debt comes before
     anything else. The doors used to open anyway, with the phase set back to
     'roll' over the top of it — so the player rolled, moved and landed while
     still owing the money. */
  var broke = new G.Game(['A', 'B'], null);
  broke.currentPlayer = 0;
  broke.players[0].inJail = true;
  broke.players[0].money = 5;
  [1, 3, 6, 8, 9].forEach(function (id) {          // assets, so it is a debt
    broke.state.properties[id].owner = 0;
    broke.players[0].properties.push(id);
  });
  broke.ui.showJailModal = function (player, onPay) { onPay(); };
  broke.ui.showRaiseFundsModal = function () {};
  broke.handleJailOptions();
  check('a fine you cannot pay leaves you in the cell, owing it',
        !!broke._pendingDebt && broke.players[0].inJail === true &&
        broke.phase === 'debt' && broke.canRoll() === false,
        broke.phase + '/' + broke.players[0].inJail);

  /* Same on the third turn, where the fine is compulsory. */
  var third = new G.Game(['A', 'B'], null);
  third.currentPlayer = 0;
  third.players[0].inJail = true;
  third.players[0].jailTurns = 2;
  third.players[0].money = 5;
  [1, 3, 6, 8, 9].forEach(function (id) {
    third.state.properties[id].owner = 0;
    third.players[0].properties.push(id);
  });
  third.players[0].position = 10;                  // in the cell, where else
  third.ui.showRaiseFundsModal = function () {};
  third.handleJailRoll({ d1: 1, d2: 2, total: 3, doubles: false });
  check('the compulsory fine is settled before the player moves',
        !!third._pendingDebt && third.players[0].position === 10 &&
        third.players[0].inJail === true,
        third.players[0].position + '/' + third.players[0].inJail);

  /* Doubles open the door and move you — they do not also earn another roll. */
  var freed = new G.Game(['A', 'B'], null);
  freed.currentPlayer = 0;
  freed.players[0].inJail = true;
  freed.players[0].position = 10;
  freed.phase = 'rolling';
  freed.handleJailRoll({ d1: 5, d2: 5, total: 10, doubles: true });
  check('doubles out of jail do not earn another roll',
        freed.lastRoll.doubles === false && freed.doublesCount === 0,
        JSON.stringify(freed.lastRoll));
}

/* -------------------------------------------------------- speed die ---- */

if (typeof G.rollDice === 'function') {
  var faces = {};
  var triples = 0;
  var badTriple = null, badTotal = null;
  for (var sd = 0; sd < 4000; sd++) {
    var roll = G.rollDice(true);
    faces[roll.speed.kind] = (faces[roll.speed.kind] || 0) + 1;
    if (roll.triples) {
      triples++;
      if (!(roll.d1 === roll.d2 && roll.d2 === roll.speed.value)) badTriple = roll;
    }
    var expected = roll.d1 + roll.d2 + (roll.speed.kind === 'number' ? roll.speed.value : 0);
    if (roll.total !== expected) badTotal = roll;
  }
  check('a triple is always three of a kind', badTriple === null, JSON.stringify(badTriple));
  check('a numbered speed die adds to the total, and the others do not',
        badTotal === null, JSON.stringify(badTotal));
  var tripleDoubles = 0;
  for (var td = 0; td < 3000; td++) {
    var tdRoll = G.rollDice(true);
    if (tdRoll.triples && tdRoll.doubles) tripleDoubles++;
  }
  check('a triple is not a double: no second roll, and no third-double jail',
        tripleDoubles === 0, String(tripleDoubles));

  check('all three speed faces come up',
        faces.number > 0 && faces.monopoly > 0 && faces.bus > 0, JSON.stringify(faces));
  check('triples happen, but rarely', triples > 0 && triples < 400, String(triples));
  check('without the rule there is no third die', G.rollDice(false).speed === undefined);
}

/* --------------------------------------------------------- auctions ---- */

/* The auction was untestable while it lived inside one modal. Now that each
   bidder is asked a question, a table of computer players can be run through
   a whole auction here. */
if (typeof G.Game === 'function') {
  var au = new G.Game(['CPU A', 'CPU B'], null, {
    aiConfigs: [{ isAI: true, difficulty: 'hard' }, { isAI: true, difficulty: 'medium' }]
  });
  au.ui.showAuctionModal.call(au.ui, 39);       // Boardwalk, worth bidding for
  runTimers(200);
  var sold = au.state.properties[39];
  check('an auction between computer players ends with a sale',
        sold.owner === 0 || sold.owner === 1, JSON.stringify(sold));
  if (sold.owner !== null) {
    check('the winner paid for it',
          au.players[sold.owner].money < 1500, String(au.players[sold.owner].money));
    check('and it is counted as an auction won',
          au.stats.perPlayer[sold.owner].auctionsWon === 1,
          String(au.stats.perPlayer[sold.owner].auctionsWon));
  }
  check('and the turn is released afterwards', au.phase !== 'rolling', au.phase);

  /* Nobody can afford it: it stays with the bank rather than hanging. */
  var broke = new G.Game(['CPU A', 'CPU B'], null, {
    aiConfigs: [{ isAI: true, difficulty: 'easy' }, { isAI: true, difficulty: 'easy' }]
  });
  broke.players.forEach(function (p) { p.money = 0; });
  broke.ui.showAuctionModal.call(broke.ui, 39);
  runTimers(200);
  check('an auction nobody can bid in ends with the bank keeping it',
        broke.state.properties[39].owner === null,
        String(broke.state.properties[39].owner));
}

/* ------------------------------------------------------------ trades --- */

if (typeof G.Game === 'function') {
  var tr = new G.Game(['A', 'B'], null);
  [11, 13].forEach(function (id) {
    tr.state.properties[id].owner = 0;
    tr.players[0].properties.push(id);
  });
  tr.state.properties[14].owner = 1;
  tr.players[1].properties.push(14);

  var deal = { fromId: 0, toId: 1, giveProps: [11], getProps: [14],
               giveMoney: 100, getMoney: 0, giveJailCards: 0, getJailCards: 0 };
  check('a deal both players can honour is legal', tr.validateDeal(deal).ok === true,
        tr.validateDeal(deal).reason);

  check('you cannot trade away what you do not own',
        tr.validateDeal({ fromId: 0, toId: 1, giveProps: [14], getProps: [] }).ok === false);
  check('nor money you do not have',
        tr.validateDeal({ fromId: 0, toId: 1, giveProps: [], getProps: [],
                          giveMoney: 99999 }).ok === false);
  check('nor a jail card you were never given',
        tr.validateDeal({ fromId: 0, toId: 1, giveProps: [], getProps: [],
                          giveJailCards: 1 }).ok === false);
  check('an empty trade is refused',
        tr.validateDeal({ fromId: 0, toId: 1, giveProps: [], getProps: [] }).ok === false);
  check('and so is trading with yourself',
        tr.validateDeal({ fromId: 0, toId: 0, giveProps: [11], getProps: [] }).ok === false);

  /* Buildings anywhere in a group freeze every deed in it — otherwise a house
     could change colour groups mid-game. */
  tr.state.properties[13].houses = 1;
  check('a group with a house on it cannot be broken up',
        tr.validateDeal(deal).ok === false, tr.validateDeal(deal).reason);
  tr.state.properties[13].houses = 0;

  tr.executeTrade(0, 1, [11], [14], 100, 0, 0, 0);
  check('a trade moves the deeds',
        tr.state.properties[11].owner === 1 && tr.state.properties[14].owner === 0);
  check('and the money',
        tr.players[0].money === 1400 && tr.players[1].money === 1600,
        tr.players[0].money + '/' + tr.players[1].money);
  check('and each player\'s own list of deeds keeps up',
        tr.players[0].properties.indexOf(14) >= 0 &&
        tr.players[0].properties.indexOf(11) < 0 &&
        tr.players[1].properties.indexOf(11) >= 0,
        JSON.stringify([tr.players[0].properties, tr.players[1].properties]));
}

/* ------------------------------------------------------ the computer -- */

if (typeof G.AIPlayer === 'function' && typeof G.Game === 'function') {
  var mk = function (difficulty, personality) {
    var g = new G.Game(['CPU', 'You'], null, {
      aiConfigs: [{ isAI: true, difficulty: difficulty, personality: personality }, { isAI: false }]
    });
    return g;
  };

  /* The AI holds two of the three pinks; the human holds the third. */
  var setUpPinks = function (g, aiHoldsTwo) {
    var mine = aiHoldsTwo ? [11, 13] : [14];
    var theirs = aiHoldsTwo ? [14] : [11, 13];
    mine.forEach(function (id) { g.state.properties[id].owner = 0; g.players[0].properties.push(id); });
    theirs.forEach(function (id) { g.state.properties[id].owner = 1; g.players[1].properties.push(id); });
  };

  var g1 = mk('medium', 'balanced');
  setUpPinks(g1, true);
  var ai1 = g1.getAI(0);
  check('the computer takes the deed that completes its own set',
        ai1.decideTrade({ fromId: 1, toId: 0, giveProps: [14], getProps: [],
                          giveMoney: 0, getMoney: 200 }, g1).accept === true);
  check('and turns down a deed it does not need for a price it does not like',
        ai1.decideTrade({ fromId: 1, toId: 0, giveProps: [], getProps: [11],
                          giveMoney: 20, getMoney: 0 }, g1).accept === false);

  var g2 = mk('hard', 'balanced');
  setUpPinks(g2, false);              // the human is one deed short of a set
  var ai2 = g2.getAI(0);
  check('a hard computer will not hand over a colour group at any price',
        ai2.decideTrade({ fromId: 1, toId: 0, giveProps: [], getProps: [14],
                          giveMoney: 5000, getMoney: 0 }, g2).accept === false,
        JSON.stringify(ai2.decideTrade({ fromId: 1, toId: 0, giveProps: [], getProps: [14],
                                         giveMoney: 5000, getMoney: 0 }, g2)));

  var g3 = mk('medium', 'balanced');
  setUpPinks(g3, false);
  var ai3 = g3.getAI(0);
  var sells = false;
  for (var price = 100; price <= 4000 && !sells; price += 50) {
    sells = ai3.decideTrade({ fromId: 1, toId: 0, giveProps: [], getProps: [14],
                              giveMoney: price, getMoney: 0 }, g3).accept;
  }
  check('a merely competent one has a price for it', sells === true);

  var g4 = mk('hard', 'hustler');
  setUpPinks(g4, true);
  var proposal = null;
  for (var attempt = 0; attempt < 60 && !proposal; attempt++) {
    proposal = g4.getAI(0).proposeTrade(g4);
  }
  check('the computer opens a negotiation of its own', !!proposal,
        String(proposal));
  if (proposal) {
    check('and asks for the deed it is missing',
          proposal.getProps.length === 1 && proposal.getProps[0] === 14,
          JSON.stringify(proposal));
    check('offering something for it',
          proposal.giveMoney > 0 || proposal.giveProps.length > 0,
          JSON.stringify(proposal));
    check('and the offer it makes is a legal one',
          g4.validateDeal(proposal).ok === true, g4.validateDeal(proposal).reason);
  }

  var g5 = mk('easy', 'balanced');
  check('easy players do not go looking for deals', g5.getAI(0).proposeTrade(g5) === null);

  check('every personality is a real one',
        G.aiPersonalityKeys().every(function (key) { return !!G.AI_PERSONALITIES[key]; }));
  var picked = {};
  for (var n = 0; n < 200; n++) picked[new G.AIPlayer(0, 'medium').personality] = true;
  check('and one is picked at random when nobody chooses',
        Object.keys(picked).length > 1, Object.keys(picked).join(','));
  check('a named personality is the one you get',
        new G.AIPlayer(0, 'medium', 'miser').personality === 'miser');
}

/* -------------------------------------------- the computer under water -- */

if (typeof G.Game === 'function') {
  var broke = new G.Game(['CPU', 'B'], null, {
    aiConfigs: [{ isAI: true, difficulty: 'hard' }, { isAI: false }]
  });
  [11, 13, 14].forEach(function (id) {
    broke.state.properties[id].owner = 0;
    broke.players[0].properties.push(id);
    broke.state.properties[id].houses = 2;
  });
  broke.players[0].money = 0;

  var plan = broke.getAI(0).decideRaiseFunds(2000, broke);
  var sells = plan.filter(function (a) { return a.action === 'sell'; });
  var mortgages = plan.filter(function (a) { return a.action === 'mortgage'; });
  /* The plan used to read the houses off the board, which it had not touched
     yet, so it planned the same four sales over and over — forty deep, each
     surplus one refused when the plan was carried out. */
  check('a plan never sells more buildings than are standing',
        sells.length <= 6, sells.length + ' sales for 6 houses');
  check('and never mortgages the same deed twice',
        mortgages.length === new Set(mortgages.map(function (a) { return a.spaceId; })).size,
        JSON.stringify(mortgages));
  check('a player with nothing to sell plans nothing',
        new G.Game(['CPU', 'B'], null, { aiConfigs: [{ isAI: true }, { isAI: false }] })
          .getAI(0).decideRaiseFunds(500, new G.Game(['CPU', 'B'], null)).length === 0);
}

/* ------------------------------------------------------------- saves --- */

if (typeof G.Save !== 'undefined' && typeof G.Game === 'function') {
  var live = new G.Game(['A', 'B'], null, { speedDie: true, turnLimit: 30, theme: 'london' });
  live.players[0].money = 1234;
  live.players[0].position = 19;
  [16, 18, 19].forEach(function (id) {
    live.state.properties[id].owner = 0;
    live.players[0].properties.push(id);
  });
  live.state.properties[19].houses = 3;
  live.state.properties[16].mortgaged = true;
  live.players[1].jailCards.push({ deckType: 'community' });
  live.players[1].inJail = true;
  live.players[1].jailTurns = 2;
  live.turnNumber = 9;
  live.decks.chanceIndex = 4;
  live.stats.perPlayer[0].rentCollected = 550;
  live.log.push('something that happened');

  var blob = JSON.parse(JSON.stringify(G.Save.serialize(live)));
  var restored = new G.Game(['A', 'B'], null);
  var ok = G.Save.apply(restored, blob);

  check('a saved game can be poured back into a new one', ok === true);
  check('money and position survive',
        restored.players[0].money === 1234 && restored.players[0].position === 19);
  check('deeds, houses and mortgages survive',
        restored.state.properties[19].houses === 3 &&
        restored.state.properties[16].mortgaged === true &&
        restored.players[0].properties.join(',') === '16,18,19',
        JSON.stringify(restored.players[0].properties));
  check('jail survives',
        restored.players[1].inJail === true && restored.players[1].jailTurns === 2 &&
        restored.players[1].jailCards.length === 1);
  check('the round number and the house rules survive',
        restored.turnNumber === 9 && restored.options.speedDie === true &&
        restored.options.turnLimit === 30 && restored.options.theme === 'london',
        JSON.stringify(restored.options));
  check('the statistics survive',
        restored.stats.perPlayer[0].rentCollected === 550);
  check('the log survives', restored.log.indexOf('something that happened') >= 0);
  check('the card decks come back in the order they were left in',
        restored.decks.chance.map(function (c) { return c.id; }).join(',') ===
        live.decks.chance.map(function (c) { return c.id; }).join(',') &&
        restored.decks.chanceIndex === 4);
  check('and they are the real cards, not the ids they travelled as',
        typeof restored.decks.chance[0].action === 'function');

  /* A game is written out at the moments things change hands, and buying a
     property is one of them — which happens while the square is still being
     resolved. Saving that phase verbatim gave back a turn that could neither
     roll nor be ended. */
  ['rolling', 'landed', 'waiting', 'debt', 'over'].forEach(function (phase) {
    var mid = new G.Game(['A', 'B'], null);
    mid.phase = phase;
    check('a save taken during "' + phase + '" resumes as a turn you can finish',
          ['roll', 'action', 'rolled'].indexOf(G.Save.serialize(mid).phase) >= 0,
          G.Save.serialize(mid).phase);
  });
  ['roll', 'action', 'rolled'].forEach(function (phase) {
    var settled = new G.Game(['A', 'B'], null);
    settled.phase = phase;
    check('and a settled "' + phase + '" is saved as it stands',
          G.Save.serialize(settled).phase === phase);
  });

  check('a save from another version is refused',
        G.Save.apply(new G.Game(['A', 'B'], null), { version: 999 }) === false);
  check('and so is nothing at all',
        G.Save.apply(new G.Game(['A', 'B'], null), null) === false);
}

/* ------------------------------------------------------------ themes --- */

if (typeof G.applyBoardTheme === 'function') {
  var classicNames = G.BOARD_SPACES.map(function (s) { return s.name; });
  G.applyBoardTheme('london');
  check('a theme renames the board', G.BOARD_SPACES[39].name === 'Mayfair',
        G.BOARD_SPACES[39].name);
  check('but moves nothing', G.BOARD_SPACES[39].price === 400 &&
        G.BOARD_SPACES[39].group === 'darkblue' && G.BOARD_SPACES.length === 40);
  G.applyBoardTheme('world');
  check('switching themes does not compound', G.BOARD_SPACES[39].name === 'Tokyo',
        G.BOARD_SPACES[39].name);
  G.applyBoardTheme('london');
  check('the board knows which theme it is drawing',
        G.activeBoardTheme().label === 'London', G.activeBoardTheme().label);
  G.applyBoardTheme('nonsense');
  check('an unknown theme falls back to the classic board',
        G.activeBoardTheme().label === 'Atlantic City' &&
        G.BOARD_SPACES[39].name === 'Boardwalk', G.BOARD_SPACES[39].name);

  G.applyBoardTheme('classic');
  check('and going back gives the original names',
        G.BOARD_SPACES.map(function (s) { return s.name; }).join('|') === classicNames.join('|'));
  check('every theme names spaces the board actually has',
        G.boardThemeKeys().every(function (key) {
          return Object.keys(G.BOARD_THEMES[key].names)
            .every(function (id) { return !!G.BOARD_SPACES[id]; });
        }));
}

/* ------------------------------------------------------------- report -- */

function report() {
print('');
if (typeof BOARD_SPACES !== 'undefined') {
  print('board: ' + BOARD_SPACES.length + ' spaces, ' +
        BOARD_SPACES.filter(function (s) { return s.type === 'property'; }).length + ' properties');
}
if (typeof CHANCE_CARDS !== 'undefined') {
  print('decks: ' + CHANCE_CARDS.length + ' chance, ' +
        COMMUNITY_CHEST_CARDS.length + ' community chest');
}
if (!fails.length) {
  print('✅ all ' + checksRun + ' smoke checks passed');
} else {
  print('❌ ' + fails.length + ' failure(s):');
  fails.slice(0, 20).forEach(function (f) { print('  - ' + f); });
}
}

afterMicrotasks(function () {
  try { lateChecks(); } catch (e) { fails.push('the late checks threw: ' + (e.message || e)); }
  report();
});
