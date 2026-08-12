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
function check(name, cond, detail) {
  if (!cond) fails.push(name + (detail ? ' — ' + detail : ''));
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
     'startLocalGame','MP']
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

/* ------------------------------------------------------------- report -- */

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
  print('✅ all smoke checks passed');
} else {
  print('❌ ' + fails.length + ' failure(s):');
  fails.slice(0, 20).forEach(function (f) { print('  - ' + f); });
}
