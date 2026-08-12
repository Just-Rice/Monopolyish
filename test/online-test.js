/* Tests the Monopolyish online layer over an in-memory transport. Covers the
 * parts a browser is not needed for: snapshot fidelity, the guest mirror, who
 * is allowed to act, and the ask/reply prompt routing.
 *
 * It does NOT prove two real browsers connect, and it does not exercise the
 * modal flows still resolved on the host. */

var root = this;
load('js/net.js');
var Net = root.ChowkaNet;

var fails = [];
function check(name, cond, detail) {
  if (!cond) fails.push(name + (detail ? ' — ' + detail : ''));
}

var queue = [];
function schedule(fn) { queue.push(fn); }
function pump(n) {
  for (var i = 0; i < (n || 12); i++) {
    var batch = queue; queue = [];
    if (!batch.length) return;
    batch.forEach(function (f) { f(); });
  }
}

/* A stand-in Game with the shape MP.snapshot and MP.applyIntent expect. */
function fakeGame() {
  return {
    currentPlayer: 0,
    phase: 'roll',
    lastRoll: { die1: 3, die2: 4, total: 7, doubles: false },
    log: ['a', 'b'],
    rolled: 0, ended: 0, built: [],
    players: [
      { id:0, name:'Ada',  token:'🎩', color:'#e74c3c', money:1500, position:0,
        inJail:false, jailTurns:0, getOutOfJailCards:0, bankrupt:false, isAI:false },
      { id:1, name:'Brei', token:'🚗', color:'#3498db', money:1320, position:12,
        inJail:true, jailTurns:1, getOutOfJailCards:1, bankrupt:false, isAI:false }
    ],
    state: {
      properties: [ { owner:-1, houses:0, mortgaged:false },
                    { owner:1, houses:3, mortgaged:false } ],
      freeParkingPot: 250, housesAvailable: 29, hotelsAvailable: 12
    },
    handleRoll: function () { this.rolled++; this.phase = 'action'; },
    endTurn:    function () { this.ended++; this.currentPlayer = 1; this.phase = 'roll'; },
    buildHouse: function (p, s) { this.built.push([p, s]); }
  };
}

/* ------------------------------------------------------- snapshot ------- */

/* Load MP without a DOM: only the pure parts are exercised here. */
this.document = { getElementById: function () { return { style: {} }; } };
this.window = this;
this.UI = function (g) { this.game = g; this.updateAll = function () {}; };
this.renderBoard = function () {};
load('js/online.js');

var game = fakeGame();
var snap = MP.snapshot(game);

check('a snapshot carries every player', snap.players.length === 2);
check('money and position survive',
      snap.players[1].money === 1320 && snap.players[1].position === 12,
      JSON.stringify(snap.players[1]));
check('jail state survives', snap.players[1].inJail === true);
check('property ownership and houses survive',
      snap.properties[1].owner === 1 && snap.properties[1].houses === 3,
      JSON.stringify(snap.properties[1]));
check('the pot and the bank survive',
      snap.freeParkingPot === 250 && snap.housesAvailable === 29);
check('whose turn it is survives', snap.currentPlayer === 0 && snap.phase === 'roll');

/* The board layout and decks must not be shipped every time. */
var wire = JSON.stringify(snap);
check('the board layout is not sent',
      wire.indexOf('Boardwalk') < 0 && wire.indexOf('"rent"') < 0 &&
      wire.indexOf('"price"') < 0);
check('a snapshot stays small', wire.length < 4000, wire.length + ' bytes');
check('a null game gives a null snapshot', MP.snapshot(null) === null);

/* --------------------------------------------------------- mirror ------- */

MP.mode = 'guest'; MP.mySeat = 0;
var mirror = MP.buildMirror(snap);
check('the mirror exposes what the UI reads',
      mirror.players.length === 2 && mirror.state.properties.length === 2 &&
      typeof mirror.canRoll === 'function' && typeof mirror.canEndTurn === 'function');
check('the seated guest may roll on their own turn', mirror.canRoll() === true);

MP.mySeat = 1;
mirror = MP.buildMirror(snap);
check('a guest may not roll on someone else\'s turn', mirror.canRoll() === false);
check('nor end that turn', mirror.canEndTurn() === false);

MP.mode = 'local';
mirror = MP.buildMirror(snap);
check('offline, the local player may always act', mirror.canRoll() === true);

/* -------------------------------------------------------- intents ------- */

MP.mode = 'host';
game = fakeGame();
check('a roll from the player whose turn it is, is applied',
      MP.applyIntent(0, { kind: 'roll' }, game) === true && game.rolled === 1);
check('a roll from anyone else is refused',
      MP.applyIntent(1, { kind: 'roll' }, game) === false, String(game.rolled));

game = fakeGame();
check('rolling out of phase is refused',
      (game.phase = 'action', MP.applyIntent(0, { kind: 'roll' }, game)) === false);
check('ending a turn out of phase is refused',
      (game.phase = 'roll', MP.applyIntent(0, { kind: 'endTurn' }, game)) === false);

game = fakeGame(); game.phase = 'action';
check('ending your own turn is applied',
      MP.applyIntent(0, { kind: 'endTurn' }, game) === true && game.ended === 1);

game = fakeGame();
check('building routes through with its space id',
      MP.applyIntent(0, { kind: 'build', spaceId: 5 }, game) === true &&
      game.built[0][1] === 5, JSON.stringify(game.built));
check('an unknown intent is refused',
      MP.applyIntent(0, { kind: 'nonsense' }, game) === false);
check('an empty intent is refused', MP.applyIntent(0, null, game) === false);

/* --------------------------------------------------------- prompts ------ */

/* Offline, a prompt is just the local modal. */
MP.mode = 'local';
var localRan = 0;
MP.prompt(0, 'buy', { spaceId: 1 }, { local: function () { localRan++; }, onReply: function () {} });
check('offline, a prompt shows the modal here', localRan === 1);

/* Hosting, a prompt for a seat this browser owns is still local. */
MP.mode = 'host';
MP.config = { seatKinds: ['local', 'remote'] };
MP.host = { peerForSeat: function () { return null; }, askPeer: function () {} };
localRan = 0;
MP.prompt(0, 'buy', { spaceId: 1 }, { local: function () { localRan++; }, onReply: function () {} });
check('the host answers its own seat locally', localRan === 1);

/* A prompt for a remote seat is sent to that peer and resolved by their reply. */
var sentTo = null, sentMsg = null;
MP.host = {
  peerForSeat: function (seat) { return seat === 1 ? 'PEER1' : null; },
  askPeer: function (peer, q) { sentTo = peer; sentMsg = q; }
};
var answered = null;
localRan = 0;
MP.prompt(1, 'buy', { spaceId: 9 }, {
  local: function () { localRan++; },
  onReply: function (a) { answered = a; }
});
check('a remote seat is asked, not answered here', localRan === 0 && sentTo === 'PEER1',
      String(sentTo));
check('the question carries its kind and payload',
      sentMsg && sentMsg.kind === 'buy' && sentMsg.payload.spaceId === 9,
      JSON.stringify(sentMsg));

MP.onReply({ id: sentMsg.id, answer: 'auction' });
check('their answer runs the callback here', answered === 'auction', String(answered));

MP.onReply({ id: sentMsg.id, answer: 'buy' });
check('a duplicate reply is ignored', answered === 'auction', String(answered));
check('an unknown reply id is ignored', (MP.onReply({ id: 999, answer: 'x' }), true));

/* A seat nobody is sitting in falls back to the host answering. */
MP.host.peerForSeat = function () { return null; };
localRan = 0;
MP.prompt(1, 'buy', {}, { local: function () { localRan++; }, onReply: function () {} });
check('an empty seat is answered by the host', localRan === 1);

/* ------------------------------------------------- ask over the wire ---- */

var net = Net.createFakeNetwork({ schedule: schedule });
var h = net.endpoint('H'), g = net.endpoint('G');
var hostGame = fakeGame();
var replies = [];
var host = Net.createHost({
  transport: h,
  game: {
    getSeats: function () { return [{ id:0, kind:'local' }, { id:1, kind:'open' }]; },
    getSnapshot: function () { return MP.snapshot(hostGame); },
    applyIntent: function (seat, intent) { return MP.applyIntent(seat, intent, hostGame); }
  },
  onReply: function (m) { replies.push(m); }
});
var asked = [];
var guest = Net.createGuest({
  transport: g, name: 'G', selfPeerId: 'G',
  onAsk: function (m) { asked.push(m); }
});
net.connect('H', 'G');
pump();
g.broadcast({ t: Net.M.CLAIM, seatId: 1 });
pump();

check('the host can find the peer in a seat', host.peerForSeat(1) === 'G',
      String(host.peerForSeat(1)));
check('an empty seat has no peer', host.peerForSeat(0) === null);

host.askPeer('G', { id: 7, kind: 'jail', payload: { playerId: 1 } });
pump();
check('the question reaches the guest', asked.length === 1 && asked[0].kind === 'jail',
      JSON.stringify(asked));

guest.replyToAsk({ id: 7, answer: 'pay' });
pump();
check('the answer reaches the host', replies.length === 1 && replies[0].answer === 'pay',
      JSON.stringify(replies));
check('the answer is matched to its question', replies[0].id === 7);

/* ------------------------------------ slow to connect is not a disconnect -- */

/* The bug this guards: a guest declared the host missing after seven seconds,
   counted from when its own peer opened rather than from first contact. Across
   two devices, signalling plus ICE takes longer than that, so joining a room
   reported "the host dropped out" before it had ever connected. */
var net2 = Net.createFakeNetwork({ schedule: schedule });
var h2 = net2.endpoint('H2'), q2 = net2.endpoint('Q2');
Net.createHost({
  transport: h2,
  game: { getSeats: function () { return [{ id: 0, kind: 'local' }]; },
          getSnapshot: function () { return null; },
          applyIntent: function () { return false; } }
});
var clock = Date.now(), lost = 0, failed = 0;
var slow = Net.createGuest({
  transport: q2, name: 'Slow', selfPeerId: 'Q2',
  timeout: 7000, connectTimeout: 25000,
  now: function () { return clock; },
  onHostLost: function () { lost++; },
  onConnectFailed: function () { failed++; }
});

check('a guest that has not connected knows it', slow.hasConnected() === false);
for (var i = 0; i < 5; i++) { clock += 2000; slow.tick(clock); pump(); }
check('ten seconds of connecting is not a drop-out', lost === 0, lost + ' calls');
check('and is not yet a failure either', failed === 0, failed + ' calls');

net2.connect('H2', 'Q2');
pump();
check('first contact is recorded', slow.hasConnected() === true);

clock += 20000;
slow.tick(clock);
check('after connecting, silence does mean the host is gone', lost === 1, lost + ' calls');

/* ------------------------------------------------------------ report ---- */

print('');
print('snapshot: ' + wire.length + ' bytes for a 2-player board');
if (!fails.length) {
  print('✅ all online checks passed');
  print('   (peer discovery and the host-only modal flows are untested)');
} else {
  print('❌ ' + fails.length + ' failure(s):');
  fails.slice(0, 20).forEach(function (f) { print('  - ' + f); });
}
