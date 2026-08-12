/* Monopolyish — the online lobby: room codes, seats, ready checks, and the
 * wiring between the sync layer and the running game.
 *
 * Kept apart from online.js so that file stays about the protocol and this one
 * stays about the screen.
 */
"use strict";

(function () {

  function el(id) { return document.getElementById(id); }
  /* 'person' or 'online', and within online, 'host' or 'join'. */
  var tab = 'person';
  var onlineChoice = 'host';
  function mode() {
    if (tab === 'person') return 'local';
    return onlineChoice;
  }

  /* A running account of what the connection is doing. Silence was the worst
     part of a failed join — you could not tell a wrong code from a network
     that would not route. */
  var diagLines = [];
  function diag(line) {
    diagLines.push(line);
    if (diagLines.length > 6) diagLines.shift();
    var n = el('lobby-diag');
    if (n) n.textContent = diagLines.join('  ·  ');
  }

  function status(text, isError) {
    var n = el('lobby-status');
    if (!n) return;
    n.textContent = text;
    n.classList.toggle('error', !!isError);
  }

  function showScreen(which) {
    ['setup-screen', 'lobby-screen', 'game-screen'].forEach(function (id) {
      var n = el(id);
      if (n) n.style.display = (id === which) ? '' : 'none';
    });
  }

  /* ------------------------------------------------------------- seats -- */

  function seatColour(i) {
    return (typeof PLAYER_COLORS !== 'undefined' && PLAYER_COLORS[i]) || '#888';
  }
  function seatName(i) {
    return (typeof ALL_TOKENS !== 'undefined' && ALL_TOKENS[i])
      ? (ALL_TOKENS[i].name || ALL_TOKENS[i].icon || ('Player ' + (i + 1)))
      : 'Player ' + (i + 1);
  }

  function renderSeats(seats) {
    var list = el('seat-list');
    if (!list) return;
    list.innerHTML = '';

    (seats || []).forEach(function (seat) {
      var row = document.createElement('div');
      var mine = (MP.mode === 'guest' && MP.mySeat === seat.id) ||
                 (MP.mode === 'host' && seat.kind === 'local');
      row.className = 'seat-row' + (mine ? ' mine' : '');

      var dot = document.createElement('span');
      dot.className = 'seat-dot';
      dot.style.background = seatColour(seat.id);
      row.appendChild(dot);

      var name = document.createElement('span');
      name.textContent = seatName(seat.id);
      row.appendChild(name);

      var who = document.createElement('span');
      who.className = 'seat-who';

      if (seat.kind === 'local') {
        who.textContent = MP.mode === 'host' ? 'You (host)' : 'Host';
        row.appendChild(who);

      } else if (seat.takenBy) {
        who.textContent = seat.takenBy + (mine ? ' (you)' : '');
        row.appendChild(who);

        if (mine) {
          var ready = document.createElement('button');
          ready.className = 'seat-btn' + (seat.ready ? '' : ' ghost');
          ready.textContent = seat.ready ? 'Ready ✓' : "I'm ready";
          ready.onclick = function () {
            MP.myReady = !seat.ready;
            MP.guest.setReady(MP.myReady);
          };
          row.appendChild(ready);
        } else {
          var tag = document.createElement('span');
          tag.className = 'seat-tag' + (seat.ready ? ' yes' : '');
          tag.textContent = seat.ready ? 'ready' : 'not ready';
          row.appendChild(tag);
        }

      } else if (MP.mode === 'host') {
        who.textContent = MP.config.seatKinds[seat.id] === 'cpu' ? '' : 'Waiting…';
        row.appendChild(who);
        var sel = document.createElement('select');
        [['open', 'Open to a friend'], ['cpu', 'Computer']].forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o[0]; opt.textContent = o[1];
          if (MP.config.seatKinds[seat.id] === o[0]) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.onchange = function () {
          MP.config.seatKinds[seat.id] = sel.value;
          MP.host.pushSeats();
        };
        row.appendChild(sel);

      } else {
        who.textContent = 'Open';
        row.appendChild(who);
        var sit = document.createElement('button');
        sit.className = 'seat-btn';
        sit.textContent = 'Sit here';
        sit.onclick = function () {
          MP.mySeat = seat.id;
          MP.myReady = false;
          MP.guest.claim(seat.id);
        };
        row.appendChild(sit);
      }

      list.appendChild(row);
    });

    refreshStart();
  }

  function refreshStart() {
    if (MP.mode !== 'host' || !MP.host) return;
    var btn = el('btn-start-online');
    if (!btn) return;
    var ready = MP.host.allReady();
    btn.disabled = !ready;
    btn.textContent = ready
      ? (MP.host.seatedCount() ? 'Start game' : 'Start game (empty seats go to the computer)')
      : 'Waiting for players to be ready…';
  }

  /* -------------------------------------------------------------- host -- */

  /* setup.js declares `let game`, which lives in the script scope rather than
     on window — so window.game was always undefined and every snapshot came
     back empty. Read the binding itself, guarding the temporal dead zone. */
  function liveGame() {
    try { return game; } catch (e) { return null; }
  }

  function hostAdapter() {
    return {
      getSeats: function () {
        return MP.config.seatKinds.map(function (kind, i) {
          return { id: i, nameKey: seatName(i), kind: kind };
        });
      },
      getSnapshot: function () { return MP.snapshot(liveGame()); },
      applyIntent: function (seatId, intent) {
        return MP.applyIntent(seatId, intent, liveGame());
      }
    };
  }

  function startHosting() {
    var count = (typeof playerCount !== 'undefined') ? playerCount : 3;
    MP.mode = 'host';
    MP.config = { playerCount: count, seatKinds: [], freeParking: true };
    for (var i = 0; i < count; i++) MP.config.seatKinds.push(i === 0 ? 'local' : 'open');

    showScreen('lobby-screen');
    status('Opening a room…');

    MP.loadPeerJS().then(function () {
      var code = ChowkaNet.makeRoomCode(5);
      var peer = new Peer(ChowkaNet.ROOM_PREFIX + code, { debug: 0, config: ChowkaNet.ICE });
      MP.peer = peer;
      MP.roomCode = code;
      var opened = false;      // has this room ever come up?

      peer.on('open', function () {
        opened = true;
        MP.transport = ChowkaNet.createPeerTransport({ peer: peer, onDiag: diag });
        MP.host = ChowkaNet.createHost({
          transport: MP.transport,
          game: hostAdapter(),
          onSeats: renderSeats,
          onReply: MP.onReply,
          onPaused: onDropped,
          onResumed: onReturned
        });
        el('code-box').style.display = '';
        el('room-code').textContent = code;
        el('btn-start-online').style.display = '';
        status('Room open. Share the code, then start when everyone is seated.');
        renderSeats(MP.host.seats());
        MP.startHeartbeat();
      });

      peer.on('error', function (err) {
        // A code clash before the room exists just means picking another one.
        // Afterwards the same error means the signalling server still holds
        // our old session while we reconnect — re-hosting there would mint a
        // fresh code and cut loose everybody already in the room.
        if (err && err.type === 'unavailable-id') {
          if (!opened) {
            try { peer.destroy(); } catch (e) {}
            return startHosting();
          }
          diag('signalling still holds the old session — retrying');
          return;
        }
        status(MP.peerError(err), true);
      });
    }).catch(function (e) { status(e.message, true); });
  }

  /* ------------------------------------------------------------- guest -- */

  function startJoining(code) {
    MP.mode = 'guest';
    showScreen('lobby-screen');
    status('Connecting to ' + code + '…');
    el('code-box').style.display = 'none';
    el('btn-start-online').style.display = 'none';

    MP.loadPeerJS().then(function () {
      var peer = new Peer(undefined, { debug: 0, config: ChowkaNet.ICE });
      MP.peer = peer;

      peer.on('open', function (id) {
        MP.myId = id;
        var transport = ChowkaNet.createPeerTransport({
          peer: peer, onDiag: diag,
          onIceFailed: function () {
            status('Your two networks cannot reach each other directly, and the ' +
                   'relay did not answer. Try again, or put one device on a ' +
                   'different network.', true);
          }
        });
        MP.transport = transport;
        MP.guest = ChowkaNet.createGuest({
          transport: transport,
          name: 'Guest',
          selfPeerId: id,
          onSeats: function (seats) {
            var mine = seats.filter(function (s) { return s.peerId === id; })[0];
            MP.mySeat = mine ? mine.id : null;
            MP.myReady = !!(mine && mine.ready);
            renderSeats(seats);
            status(!mine ? 'Connected to ' + code + '. Pick a seat.'
                 : mine.ready ? 'Ready. Waiting for the host to start.'
                 : 'Seat taken. Press “I’m ready” when you are.');
          },
          onSnapshot: MP.applySnapshot,
          onAsk: MP.handleAsk,
          onReject: function (reason) { status(reason, true); },
          onPaused: onDropped,
          onResumed: onReturned,
          onHostLost: function () { onDropped('host'); },
          onConnectFailed: function () {
            status("Couldn't reach that room. Check the code, and that the host " +
                   'still has the page open.', true);
          },
          onHostBack: function () { onReturned(null); }
        });
        transport.connectTo(ChowkaNet.ROOM_PREFIX + code);
        MP.startHeartbeat();
      });

      peer.on('error', function (err) { status(MP.peerError(err), true); });
    }).catch(function (e) { status(e.message, true); });
  }

  /* ---------------------------------------------------- drops and joins -- */

  function onDropped(seatId, name) {
    var hostGone = seatId === 'host';
    MP.pausedSeat = hostGone ? null : (seatId === undefined ? null : seatId);

    if (MP.mode === 'host' && !hostGone && seatId !== null && seatId !== undefined) {
      MP.config.seatKinds[seatId] = 'open';   // let them walk back into it
    }

    var note = el('mp-pause-note');
    if (note) {
      note.textContent = hostGone
        ? 'Lost contact with the host. The game cannot continue without them — ' +
          'if they come back, rejoin with the same room code.'
        : (name || seatName(seatId) || 'A player') +
          ' dropped out. They can rejoin with the same room code.';
    }
    // The host is not stuck: they can reopen the lobby and carry on without
    // whoever left, or wait for them to come back.
    var cont = el('mp-pause-continue');
    if (cont) cont.style.display = (MP.mode === 'host' && !hostGone) ? '' : 'none';
    el('mp-pause').style.display = '';
  }

  function onReturned(seatId) {
    MP.pausedSeat = null;
    if (MP.mode === 'host' && seatId !== null && seatId !== undefined && seatId !== 'host') {
      MP.config.seatKinds[seatId] = 'remote';
    }
    el('mp-pause').style.display = 'none';
  }

  /* ------------------------------------------------------------- wiring -- */

  document.addEventListener('DOMContentLoaded', function () {
    function selectTab(which) {
      tab = which;
      el('tab-person').classList.toggle('active', which === 'person');
      el('tab-online').classList.toggle('active', which === 'online');
      el('tab-person').setAttribute('aria-selected', String(which === 'person'));
      el('tab-online').setAttribute('aria-selected', String(which === 'online'));
      el('panel-person').hidden = which !== 'person';
      el('panel-online').hidden = which !== 'online';
    }
    el('tab-person').addEventListener('click', function () { selectTab('person'); });
    el('tab-online').addEventListener('click', function () { selectTab('online'); });

    function selectOnline(which) {
      onlineChoice = which;
      el('opt-host').classList.toggle('active', which === 'host');
      el('opt-join').classList.toggle('active', which === 'join');
      el('join-row').hidden = which !== 'join';
      el('online-note').textContent = which === 'host'
        ? "The settings above apply to the game you host. Seats you don't fill " +
          'are played by the computer.'
        : 'The host chooses the board and the number of players — you just take ' +
          'a seat.';
      el('btn-start-online-mode').textContent =
        which === 'host' ? '🌐 Open a room' : '🔗 Join room';
    }
    el('opt-host').addEventListener('click', function () { selectOnline('host'); });
    el('opt-join').addEventListener('click', function () { selectOnline('join'); });

    var codeInput = el('join-code');
    if (codeInput) {
      codeInput.addEventListener('input', function () {
        codeInput.value = ChowkaNet.normaliseRoomCode(codeInput.value);
      });
    }

    /* Each tab has its own button now, so nothing needs intercepting. */
    var goOnline = el('btn-start-online-mode');
    if (goOnline) {
      goOnline.addEventListener('click', function () {
        if (onlineChoice === 'host') return startHosting();
        var code = ChowkaNet.normaliseRoomCode(el('join-code').value);
        if (code.length < 4) { el('join-code').focus(); return; }
        startJoining(code);
      });
    }

    var startOnline = el('btn-start-online');
    if (startOnline) {
      startOnline.addEventListener('click', function () {
        var seats = MP.host.seats();
        MP.config.seatKinds = MP.config.seatKinds.map(function (kind, i) {
          if (kind === 'local') return 'local';
          return seats[i] && seats[i].takenBy ? 'remote' : 'cpu';
        });

        /* Remote seats are humans elsewhere, so only the leftovers are AI. */
        if (typeof playerTypes !== 'undefined') {
          MP.config.seatKinds.forEach(function (kind, i) {
            playerTypes[i] = { isAI: kind === 'cpu', difficulty: kind === 'cpu' ? 'medium' : null };
          });
        }

        showScreen('game-screen');
        startLocalGame();                 // build the game directly, no re-entry
        MP.host.pushSeats();
        MP.publish(liveGame());
      });
    }

    var back = el('btn-lobby-back');
    if (back) back.addEventListener('click', function () {
      if (MP.peer) { try { MP.peer.destroy(); } catch (e) {} }
      location.reload();
    });
    var cont = el('mp-pause-continue');
    if (cont) cont.addEventListener('click', function () {
      el('mp-pause').style.display = 'none';
      MP.pausedSeat = null;
      showScreen('lobby-screen');
      if (MP.host) {
        MP.host.pushSeats();
        renderSeats(MP.host.seats());
      }
      status('Back in the lobby. Their seat is open again — start when ready.');
    });

    var leave = el('mp-pause-leave');
    if (leave) leave.addEventListener('click', function () {
      if (MP.peer) { try { MP.peer.destroy(); } catch (e) {} }
      location.reload();
    });
  });
})();
