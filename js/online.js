/* Monopolyish online play.
 *
 * Host-authoritative, over the same peer-to-peer layer Chowka-Bhara uses. The
 * host's browser runs the one real Game; guests receive a snapshot of it after
 * every change and render a read-only mirror, then send intents for their own
 * turn. Two boards therefore cannot drift apart.
 *
 * Everything a player is asked is routed the same way, through MP.prompt: the
 * turn loop, buy or auction, jail, cards, one round of an auction, a trade
 * offer, the choice of square after a triple, and raising funds against a
 * debt. The flows that are conversations rather than single questions —
 * auctions and debts — are broken into a question per round, which is what
 * lets them cross the wire at all.
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
/* initProperties() returns an object keyed by space id, not an array, so this
   walks the ids rather than calling .map on it — which threw, and took the
   host's first snapshot with it, leaving every guest on a blank board. The
   result is indexed by space id either way, which is how the mirror reads it. */
MP.propertyList = function (props) {
  if (!props) return [];
  var ids = Object.keys(props).map(Number).filter(function (n) { return n === n; });
  var max = -1;
  ids.forEach(function (i) { if (i > max) max = i; });
  var out = [];
  for (var i = 0; i <= max; i++) {
    var pr = props[i];
    out[i] = pr ? { owner: pr.owner, houses: pr.houses, mortgaged: pr.mortgaged } : null;
  }
  return out;
};

MP.snapshot = function (game) {
  if (!game) return null;
  return {
    players: game.players.map(function (p) {
      return {
        id: p.id, name: p.name, token: p.token, color: p.color,
        money: p.money, position: p.position,
        inJail: p.inJail, jailTurns: p.jailTurns,
        /* Players keep these in `jailCards`; reading a field nobody sets sent
           `undefined` and no guest ever saw a jail card. The array travels
           rather than a count so the panels and the trade builder, which both
           read .length, work off the mirror unchanged. */
        jailCards: (p.jailCards || []).map(function (c) { return { deckType: c.deckType }; }),
        /* Which spaces they hold: the player panels, the trade builder and the
           raise-funds modal all list them, and a guest has none of that
           without it. */
        properties: (p.properties || []).slice(),
        bankrupt: p.bankrupt, isAI: p.isAI, aiDifficulty: p.aiDifficulty,
        aiPersonality: p.aiPersonality || null,
        conceded: !!p.conceded
      };
    }),
    properties: MP.propertyList(game.state.properties),
    freeParkingPot: game.state.freeParkingPot,
    housesAvailable: game.state.housesAvailable,
    hotelsAvailable: game.state.hotelsAvailable,
    currentPlayer: game.currentPlayer,
    phase: game.phase,
    lastRoll: game.lastRoll,
    turnNumber: game.turnNumber || 0,
    /* The end-of-game table is built from these, and a guest has no game of
       its own to count them in. */
    stats: game.stats || null,
    theme: (game.options && game.options.theme) || 'classic',
    rules: MP.ruleSummary(game),
    over: !!game.over,
    log: (game.log || []).slice(-40)
  };
};

/* The house rules in force, so a guest's quick reference matches the game they
   are actually in rather than the defaults. */
MP.ruleSummary = function (game) {
  var o = game.options || {};
  return {
    freeParkingPot: game.useFreeParkingPot !== false,
    noAuctions: !!o.noAuctions,
    exactGoBonus: !!o.exactGoBonus,
    noRentInJail: !!o.noRentInJail,
    speedDie: !!o.speedDie,
    turnLimit: o.turnLimit || 0,
    timeLimit: o.timeLimit || 0
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
    turnNumber: snap.turnNumber,
    options: snap.rules || {},
    over: !!snap.over,
    stats: snap.stats || null,
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
    elapsedMs: function () { return 0; },

    /* Anything a guest tries to do locally becomes an intent instead. The
       signatures match the real Game's, because the same UI code calls both. */
    purchaseProperty: function () { MP.send({ kind: 'buy' }); },
    buildHouse:       function (sid) { MP.send({ kind: 'build', spaceId: sid }); },
    sellHouse:        function (sid) { MP.send({ kind: 'sell', spaceId: sid }); },
    mortgageProperty: function (sid) { MP.send({ kind: 'mortgage', spaceId: sid }); },
    unmortgageProperty: function (sid) { MP.send({ kind: 'unmortgage', spaceId: sid }); },
    endLandAction: function () {},

    /* Settling a debt is the answer to a question the host asked, not a move
       of its own, so it goes back down the same channel. */
    resolveDebt: function () { MP.answerRaiseFunds('pay'); },
    forceSettleDebt: function () { MP.answerRaiseFunds('bankrupt'); },

    requestTrade: function (deal) { MP.send({ kind: 'trade', deal: deal }); },
    concede: function (playerId) { MP.send({ kind: 'concede', playerId: playerId }); },
    executeTrade: function () {}
  };

  /* The rules for what makes a legal deal, and when a deal may be struck, are
     the game's. A guest checks against its mirror before sending so a bad
     offer is refused where it is being built, not one round trip later. */
  if (typeof Game === 'function') {
    mirror.validateDeal = Game.prototype.validateDeal.bind(mirror);
    mirror.canTrade = Game.prototype.canTrade.bind(mirror);
    mirror.standings = Game.prototype.standings.bind(mirror);
    /* The build menu is a list of what the rules allow, drawn from state the
       mirror has; every button on it ends in one of the intents above. */
    mirror.showBuildMenu = Game.prototype.showBuildMenu.bind(mirror);
  }

  mirror.ui = new UI(mirror);
  return mirror;
};

MP.applySnapshot = function (snap) {
  if (!snap) return;
  var sticky = MP.mirror && MP.mirror.ui ? MP.mirror.ui.sticky : null;

  MP.mirror = MP.buildMirror(snap);
  mpEl('setup-screen').style.display = 'none';
  mpEl('lobby-screen').style.display = 'none';
  /* The game screen is display:none until it is marked active — clearing the
     inline style only hands it back to that rule, so a guest's board was in
     the page but never on the screen. */
  mpEl('game-screen').classList.add('active');
  mpEl('game-screen').style.display = '';

  if (!MP._boardDrawn) {
    try {
      if (typeof applyBoardTheme === 'function') applyBoardTheme(snap.theme);
      renderBoard(mpEl('board-grid'));
      MP._boardDrawn = true;
    } catch (e) { /* board only needs drawing once */ }
  }

  MP.bindGuestControls();

  try {
    MP.mirror.ui.updateAll();
    MP.mirror.ui.replaceGameLog(snap.log);
    MP.mirror.ui.renderRulesInForce();   // the host's house rules, not the defaults
    /* A modal that is a conversation rather than a question — raising funds
       against a debt — has to follow the board it is arguing with. */
    if (sticky) {
      MP.mirror.ui.sticky = sticky;
      MP.mirror.ui.redrawSticky();   // redrawn against the new mirror, not the old
    }
    if (snap.over && !MP._shownGameOver) {
      MP._shownGameOver = true;
      var standings = MP.mirror.standings ? MP.mirror.standings() : [];
      if (standings.length) {
        MP.mirror.ui.showGameOverModal(standings[0].player, { standings: standings });
      }
    }
  } catch (e) {
    console.error('mirror render failed', e);
  }
};

/* The buttons down the side of the board are wired up by Game.init, which a
   guest never runs — it has no Game, only a mirror of one. So every one of
   them did nothing at all on a guest. These bind once, to the same mirror
   methods that turn an action into an intent. */
MP.bindGuestControls = function () {
  if (MP._controlsBound || MP.mode !== 'guest') return;
  MP._controlsBound = true;

  var on = function (id, fn) {
    var node = mpEl(id);
    if (node) node.addEventListener('click', fn);
  };
  var mirror = function () { return MP.mirror; };

  on('btn-roll', function () { MP.send({ kind: 'roll' }); });
  on('btn-end-turn', function () { MP.send({ kind: 'endTurn' }); });
  on('btn-build', function () {
    if (mirror() && mirror().showBuildMenu) mirror().showBuildMenu();
  });
  on('btn-trade', function () {
    if (mirror()) mirror().ui.showTradeModal();
  });
  on('btn-concede', function () {
    if (mirror()) mirror().ui.showConcedeModal();
  });

  var board = mpEl('board-grid');
  if (board) {
    var openDeed = function (el) {
      if (!el || !mirror()) return;
      var type = el.dataset.type;
      if (['property', 'railroad', 'utility'].indexOf(type) < 0) return;
      mirror().ui.showPropertyModal(parseInt(el.dataset.space, 10));
    };
    board.addEventListener('click', function (e) {
      openDeed(e.target.closest('[data-space]'));
    });
    board.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest ? e.target.closest('[data-space]') : null;
      if (!el) return;
      e.preventDefault();
      openDeed(el);
    });
  }
};

/* ------------------------------------------------------------- intents -- */

MP.send = function (intent) {
  if (MP.mode === 'guest' && MP.guest) MP.guest.sendIntent(intent);
};

/* Host side: is this intent allowed, and what does it do? Returning false
   tells the sync layer to reject it, which the guest sees as a refusal.

   Turn ownership is not quite the whole story. Managing property is also
   allowed to whoever currently owes money, because a card can bill a player
   on somebody else's turn and they have to be able to raise it. Trading is
   allowed to anyone: deals are struck across the table. */
MP.applyIntent = function (seatId, intent, game) {
  if (!game || !intent) return false;
  if (game.over) return false;

  var theirTurn = seatId === game.currentPlayer;
  var owesMoney = !!(game._pendingDebt && game._pendingDebt.playerId === seatId);

  switch (intent.kind) {
    case 'roll':
      if (!theirTurn || game.phase !== 'roll') return false;
      game.handleRoll();
      return true;
    case 'endTurn':
      if (!theirTurn) return false;
      if (game.phase !== 'action' && game.phase !== 'rolled') return false;
      game.endTurn();
      return true;
    case 'build':
      if (!theirTurn) return false;
      game.buildHouse(intent.spaceId, seatId);
      return true;
    case 'sell':
      if (!theirTurn && !owesMoney) return false;
      game.sellHouse(intent.spaceId, seatId);
      return true;
    case 'mortgage':
      if (!theirTurn && !owesMoney) return false;
      game.mortgageProperty(intent.spaceId, seatId);
      return true;
    case 'unmortgage':
      if (!theirTurn && !owesMoney) return false;
      game.unmortgageProperty(intent.spaceId, seatId);
      return true;

    /* A deal may be proposed at any time, by anyone still in the game — but
       only ever in your own name. */
    case 'trade': {
      var deal = intent.deal;
      if (!deal || deal.fromId !== seatId) return false;
      return game.requestTrade(deal) !== false;
    }
    case 'concede':
      if (intent.playerId !== undefined && intent.playerId !== seatId) return false;
      game.concede(seatId);
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
  /* The question is kept, not just its callback: a player who drops mid-answer
     comes back on a new connection, and the question they were asked has to be
     asked again. Without it the auction, trade or debt waiting on them waited
     for ever, and the game never moved again. */
  MP._pending[id] = { seat: playerId, kind: kind, payload: payload, onReply: opts.onReply };
  /* The question is about a board that has just changed — a rent that emptied
     someone's pocket, a bid that moved. Send the state first so the modal is
     drawn from what is true now rather than whatever arrived last. */
  if (MP.host.pushSnapshot) MP.host.pushSnapshot();
  MP.host.askPeer(peerId, { id: id, kind: kind, payload: payload });
};

MP.onReply = function (msg) {
  var pending = MP._pending[msg.id];
  if (!pending) return;
  delete MP._pending[msg.id];
  try { pending.onReply(msg.answer); } catch (e) { console.error('prompt reply failed', e); }
};

/* Someone has taken a seat again — put any question that seat still owes an
   answer to back in front of them. */
MP.resendPrompts = function (seatId) {
  if (MP.mode !== 'host' || !MP.host) return 0;
  var peerId = MP.host.peerForSeat ? MP.host.peerForSeat(seatId) : null;
  if (!peerId) return 0;

  var sent = 0;
  Object.keys(MP._pending).forEach(function (id) {
    var pending = MP._pending[id];
    if (!pending || pending.seat !== seatId) return;
    MP.host.askPeer(peerId, { id: Number(id), kind: pending.kind, payload: pending.payload });
    sent++;
  });
  return sent;
};

/* Nobody is coming back for these: answer them the way a player who says
   nothing would be treated, so whatever was waiting can finish. */
MP.abandonPrompts = function (seatId) {
  var defaults = { bid: 'pass', trade: 'decline', buy: 'auction', jail: 'roll',
                   card: 'ok', anywhere: 0, raiseFunds: 'bankrupt' };
  Object.keys(MP._pending).forEach(function (id) {
    var pending = MP._pending[id];
    if (!pending || pending.seat !== seatId) return;
    delete MP._pending[id];
    try { pending.onReply(defaults[pending.kind]); }
    catch (e) { console.error('abandoned prompt failed', e); }
  });
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

  } else if (msg.kind === 'bid') {
    // One round of an auction: everything it needs is in the question.
    ui.showBidModal(msg.payload, reply);

  } else if (msg.kind === 'trade') {
    ui.showTradeOfferModal(msg.payload.deal,
      function () { reply('accept'); },
      function () { reply('decline'); });

  } else if (msg.kind === 'raiseFunds') {
    /* Raising funds is a conversation: the sells and mortgages go back as
       ordinary intents, and only the last word — paid, or bankrupt — is the
       answer to this question. */
    MP._answerRaise = reply;
    ui.showRaiseFundsModal(msg.payload.playerId, msg.payload.amount,
                           msg.payload.creditorId, msg.payload.reason);

  } else if (msg.kind === 'anywhere') {
    ui.showChooseSpaceModal(msg.payload.playerId, reply);

  } else {
    reply(null);
  }
};

/* The one word that closes a raise-funds conversation. */
MP.answerRaiseFunds = function (answer) {
  var reply = MP._answerRaise;
  MP._answerRaise = null;
  if (reply) reply(answer);
};

/* ------------------------------------------------------- table talk ----- */

/* A line for everyone: auction bids, trades, whatever the host wants the rest
   of the table to see. Guests render it as a toast and a log entry. */
MP.note = function (text) {
  if (MP.mode === 'host' && MP.host && MP.host.note) MP.host.note('line', { text: text });
};

MP.escapeHtml = function (text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

MP.onNote = function (key, params) {
  var ui = MP.mirror && MP.mirror.ui;
  if (!ui || !params || !params.text) return;
  /* The log is rendered as HTML — the game's own lines use it for emphasis —
     and this line came off the wire from another machine. */
  ui.addGameLog(MP.escapeHtml(params.text));
};

/* Chat. The data channel is already open and already carrying the game, so a
   chat box costs one message kind. */
MP.sendChat = function (text) {
  text = String(text || '').slice(0, 200).trim();
  if (!text) return;
  if (MP.mode === 'host') {
    MP.receiveChat('Host', text);
    if (MP.host && MP.host.chat) MP.host.chat('Host', text);
  } else if (MP.mode === 'guest' && MP.guest && MP.guest.chat) {
    MP.guest.chat(text);
  }
};

MP.receiveChat = function (who, text) {
  var ui = (MP.mirror && MP.mirror.ui) || (window._game && window._game.ui);
  var box = mpEl('chat-log');
  if (box) {
    var line = document.createElement('div');
    line.className = 'chat-line';
    var name = document.createElement('span');
    name.className = 'chat-who';
    name.textContent = who + ': ';
    line.appendChild(name);
    line.appendChild(document.createTextNode(text));
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 80) box.removeChild(box.firstChild);
  }
  if (typeof SFX !== 'undefined') SFX.play('chat');
  if (ui && !box) ui.showToast(who + ': ' + text, 'info');
};

/* A name for this browser that survives a reload, so a player who drops can
   walk back into the seat they were in rather than any seat going. */
MP.clientId = function () {
  if (MP._clientId) return MP._clientId;
  var id = null;
  try { id = localStorage.getItem('monopolyish.clientId'); } catch (e) {}
  if (!id) {
    id = 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem('monopolyish.clientId', id); } catch (e) {}
  }
  MP._clientId = id;
  return id;
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
