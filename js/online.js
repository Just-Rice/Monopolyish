/* Monopolyish online play.
 *
 * Host-authoritative, over the same peer-to-peer layer Chowka-Bhara uses. The
 * host's browser runs the one real Game; guests receive a snapshot of it after
 * every change and render a read-only mirror, then send intents for their own
 * turn. Two boards therefore cannot drift apart.
 *
 * What is routed to remote players in this version:
 *   - the turn loop: roll, end turn
 *   - buy or auction, jail options, card acknowledgement
 *
 * What is NOT yet routed, and is resolved on the host:
 *   - auction bidding, which is a live multi-round loop rather than a question
 *   - trades, which are a two-sided builder
 *   - raising funds during bankruptcy
 * Those are deliberately left until the foundation here has been play-tested.
 * MP.hostOnlyPrompt() marks each one so they are easy to find.
 */
"use strict";

var MP = {
  mode: 'local',          // 'local' | 'host' | 'guest'
  peer: null,
  transport: null,
  host: null,
  guest: null,
  myId: null,
  mySeat: null,           // guest: which player index they control
  myReady: false,
  roomCode: null,
  pausedSeat: null,
  beat: null,
  config: null,           // { playerCount, seatKinds[], freeParking }
  mirror: null,           // guest-side stand-in for the Game object
  _pending: {},           // host: prompts awaiting a remote reply
  _promptSeq: 0,
  _loading: null
};

function mpEl(id) { return document.getElementById(id); }

MP.isOnline = function () { return MP.mode !== 'local'; };

/* True when this browser is the one that decides things. Offline, everyone is. */
MP.isAuthority = function () { return MP.mode !== 'guest'; };

/* Does the person at this screen control that player? */
MP.controls = function (playerId) {
  if (MP.mode === 'local') return true;
  if (MP.mode === 'guest') return MP.mySeat === playerId;
  return MP.config && MP.config.seatKinds[playerId] === 'local';
};

/* ------------------------------------------------------------- library -- */

MP.loadPeerJS = function () {
  if (window.Peer) return Promise.resolve();
  if (MP._loading) return MP._loading;
  MP._loading = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = function () { resolve(); };
    s.onerror = function () {
      reject(new Error("Couldn't load the online library. Are you opening this over http(s)?"));
    };
    document.head.appendChild(s);
  });
  return MP._loading;
};

MP.peerError = function (err) {
  var type = err && err.type;
  if (type === 'peer-unavailable') return 'No room with that code. Check it and try again.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') {
    return "Can't reach the matchmaking server. It's a free service — try again in a minute.";
  }
  if (type === 'browser-incompatible') return "This browser can't do peer-to-peer play.";
  if (type === 'unavailable-id') return 'That room code is taken.';
  return 'Connection problem' + (type ? ' (' + type + ')' : '') + '.';
};

/* ------------------------------------------------------- serialisation -- */

/* Only the moving parts travel. The board layout and the card decks are
   identical in every copy of the game, so they never go over the wire. */
MP.snapshot = function (game) {
  if (!game) return null;
  return {
    players: game.players.map(function (p) {
      return {
        id: p.id, name: p.name, token: p.token, color: p.color,
        money: p.money, position: p.position,
        inJail: p.inJail, jailTurns: p.jailTurns,
        getOutOfJailCards: p.getOutOfJailCards,
        bankrupt: p.bankrupt, isAI: p.isAI
      };
    }),
    properties: game.state.properties.map(function (pr) {
      return pr && {
        owner: pr.owner, houses: pr.houses, mortgaged: pr.mortgaged
      };
    }),
    freeParkingPot: game.state.freeParkingPot,
    housesAvailable: game.state.housesAvailable,
    hotelsAvailable: game.state.hotelsAvailable,
    currentPlayer: game.currentPlayer,
    phase: game.phase,
    lastRoll: game.lastRoll,
    log: (game.log || []).slice(-40)
  };
};

/* The guest's stand-in. UI.updateAll only reads players, state.properties,
   currentPlayer, phase, canRoll() and canEndTurn(), so this is all it needs.
   Its canRoll/canEndTurn also gate on whether this browser owns the turn, so a
   spectating guest sees the buttons disabled. */
MP.buildMirror = function (snap) {
  var mirror = {
    players: snap.players,
    state: {
      properties: snap.properties,
      freeParkingPot: snap.freeParkingPot,
      housesAvailable: snap.housesAvailable,
      hotelsAvailable: snap.hotelsAvailable
    },
    currentPlayer: snap.currentPlayer,
    phase: snap.phase,
    lastRoll: snap.lastRoll,
    log: snap.log,
    mine: function () { return MP.controls(snap.currentPlayer); },
    canRoll: function () {
      return mirror.mine() && snap.phase === 'roll' &&
             !snap.players[snap.currentPlayer].bankrupt;
    },
    canEndTurn: function () {
      return mirror.mine() && (snap.phase === 'action' || snap.phase === 'rolled');
    },
    getAI: function () { return null; },
    /* Anything a guest tries to do locally becomes an intent instead. */
    purchaseProperty: function () { MP.send({ kind: 'buy' }); },
    buildHouse:       function (pid, sid) { MP.send({ kind: 'build', spaceId: sid }); },
    sellHouse:        function (pid, sid) { MP.send({ kind: 'sell', spaceId: sid }); },
    mortgageProperty: function (pid, sid) { MP.send({ kind: 'mortgage', spaceId: sid }); },
    unmortgageProperty: function (pid, sid) { MP.send({ kind: 'unmortgage', spaceId: sid }); },
    endLandAction: function () {},
    resolveDebt: function () {},
    forceSettleDebt: function () {},
    executeTrade: function () {}
  };
  mirror.ui = new UI(mirror);
  return mirror;
};

MP.applySnapshot = function (snap) {
  if (!snap) return;
  MP.mirror = MP.buildMirror(snap);
  mpEl('setup-screen').style.display = 'none';
  mpEl('lobby-screen').style.display = 'none';
  mpEl('game-screen').style.display = '';
  try {
    renderBoard(mpEl('board-grid'));
  } catch (e) { /* board only needs drawing once */ }
  try {
    MP.mirror.ui.updateAll();
  } catch (e) {
    console.error('mirror render failed', e);
  }
};

/* ------------------------------------------------------------- intents -- */

MP.send = function (intent) {
  if (MP.mode === 'guest' && MP.guest) MP.guest.sendIntent(intent);
};

/* Host side: is this intent allowed, and what does it do? Returning false
   tells the sync layer to reject it, which the guest sees as a refusal. */
MP.applyIntent = function (seatId, intent, game) {
  if (!game || !intent) return false;
  if (seatId !== game.currentPlayer) return false;

  switch (intent.kind) {
    case 'roll':
      if (game.phase !== 'roll') return false;
      game.handleRoll();
      return true;
    case 'endTurn':
      if (game.phase !== 'action' && game.phase !== 'rolled') return false;
      game.endTurn();
      return true;
    case 'build':
      game.buildHouse(seatId, intent.spaceId);
      return true;
    case 'sell':
      game.sellHouse(seatId, intent.spaceId);
      return true;
    case 'mortgage':
      game.mortgageProperty(seatId, intent.spaceId);
      return true;
    case 'unmortgage':
      game.unmortgageProperty(seatId, intent.spaceId);
      return true;
    default:
      return false;
  }
};

/* ------------------------------------------------------------- prompts -- */

/* One chokepoint for "ask a player a question". Offline, or when the player is
   sitting at this screen, it just shows the modal as before. When they are
   somewhere else, the question is sent to them, they answer on their own
   screen, and the reply runs the same callback here. */
MP.prompt = function (playerId, kind, payload, opts) {
  if (!MP.isOnline() || MP.controls(playerId)) return opts.local();

  var peerId = MP.host && MP.host.peerForSeat ? MP.host.peerForSeat(playerId) : null;
  if (!peerId) return opts.local();      // nobody there — host answers for them

  var id = ++MP._promptSeq;
  MP._pending[id] = opts.onReply;
  MP.host.askPeer(peerId, { id: id, kind: kind, payload: payload });
};

MP.onReply = function (msg) {
  var fn = MP._pending[msg.id];
  if (!fn) return;
  delete MP._pending[msg.id];
  try { fn(msg.answer); } catch (e) { console.error('prompt reply failed', e); }
};

/* Guest side: a question arrived, show it and send the answer back. */
MP.handleAsk = function (msg) {
  var reply = function (answer) {
    if (MP.guest) MP.guest.replyToAsk({ id: msg.id, answer: answer });
  };
  var ui = MP.mirror && MP.mirror.ui;
  if (!ui) return reply(null);

  var player = MP.mirror && MP.mirror.players[msg.payload.playerId];

  if (msg.kind === 'buy') {
    ui.showBuyModal(msg.payload.spaceId, function () { reply('buy'); },
                                          function () { reply('auction'); });
  } else if (msg.kind === 'jail') {
    ui.showJailModal(player,
      function () { reply('pay'); }, function () { reply('card'); },
      function () { reply('roll'); });
  } else if (msg.kind === 'card') {
    ui.showCardModal(msg.payload.card, msg.payload.type, function () { reply('ok'); });
  } else {
    reply(null);
  }
};

/* Marks a decision that still happens on the host. Kept as a call so the
   remaining work is greppable rather than invisible. */
MP.hostOnlyPrompt = function (what) {
  if (MP.mode === 'host') {
    console.info('[online] ' + what + ' is resolved on the host in this version');
  }
};

/* --------------------------------------------------------- broadcasting -- */

MP.publish = function (game) {
  if (MP.mode === 'host' && MP.host) MP.host.pushSnapshot();
};

MP.startHeartbeat = function () {
  if (MP.beat) clearInterval(MP.beat);
  MP.beat = setInterval(function () {
    if (MP.host) MP.host.tick(Date.now());
    else if (MP.guest) MP.guest.tick(Date.now());
  }, 2000);
};
