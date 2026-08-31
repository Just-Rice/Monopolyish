# Monopolyish

A full game of Monopoly that runs in the browser. One HTML file, no build step,
no install.

```sh
open index.html
```

## What's in it

- The complete board, with property groups, railroads and utilities
- **AI opponents** at easy, medium and hard, each with a personality
- **Trading**, including computer players who value a deal and open one
- **Auctions** when a property is declined
- **Mortgaging** and unmortgaging
- Houses and hotels, with the usual building rules and a limited supply
- Jail, Chance and Community Chest
- Bankruptcy, and net-worth tracking to settle who is actually winning
- **House rules**: Free Parking pot, no auctions, double salary for landing
  exactly on GO, no rent from jail, a short game, starting cash, and round or
  time limits
- **The speed die** from the 2007 rules: Mr. Monopoly, the bus, and triples
- **Board themes**: Atlantic City, London, world cities, the solar system
- **Save and resume**, in the browser, automatically
- **Sound** and **keyboard shortcuts**
- An **end-of-game scoreboard**: net worth, rent in and out, biggest single
  rent, buildings, jail time and what the dice actually did

## Playing

Roll with <kbd>R</kbd>, end your turn with <kbd>E</kbd>, manage property with
<kbd>B</kbd>, open a trade with <kbd>T</kbd>, mute with <kbd>M</kbd>, and press
<kbd>?</kbd> for the rest. <kbd>Esc</kbd> closes anything the game is not
waiting on an answer for.

Trading is not tied to whose turn it is — at a table the useful moment to make
a deal is usually while somebody else is rolling — so the button stays live and
the builder asks who is proposing.

The board is reachable by keyboard: tab to a square and press <kbd>Enter</kbd>
for its deed. The log is a live region, every square announces its owner and
what is built on it, the default token colours stay apart for colour-blind
players, each owned deed is marked with its owner's token as well as their
colour, and movement is instant if your system asks for reduced motion.

## Structure

```
index.html        markup only
css/style.css     the whole stylesheet
js/
  net.js          the online protocol, transport-agnostic
  online.js       snapshots, the guest mirror, intents, prompt routing
  lobby.js        room codes, seats, ready checks, reconnection, chat
  property.js     board layout, colour groups, rent and building rules
  themes.js       alternate name sets for the board
  player.js       player creation, tokens, colours, net worth
  cards.js        Chance and Community Chest decks
  dice.js         rolling, the speed die, and dice faces
  board.js        drawing the board
  ai.js           the computer opponent: difficulty, personality, trading
  ui.js           panels, toasts and modals
  storage.js      saving to and resuming from localStorage
  sound.js        synthesised effects, no audio files
  keyboard.js     shortcuts, the sound toggle, the help card
  game.js         the Game class: turn flow, house rules, endings
  setup.js        the setup screen
test/             two headless suites, run with ./test/run.sh
vendor/peerjs.min.js
```

The module boundaries are the ones the original author marked in comments
(`// === property.js ===`), so this is the structure the file was already
written to have. Scripts load in that order as plain `<script>` tags, so the
game still opens by double-clicking `index.html` — no server, no build step.

The only thing it fetches from the network is a Google Fonts stylesheet, so it
runs offline too, just with fallback typefaces. Sound is synthesised in the
browser rather than loaded, for the same reason.

## The computer players

Difficulty is how well an opponent thinks. Personality is what it wants, and
it bends the same numbers a different way: a **tycoon** builds early and often,
a **collector** overpays for railroads, a **hustler** always has an offer for
you, a **miser** sits on its cash, and a **balanced** player plays it down the
middle. Pick one at setup or let the game surprise you.

They value a deed by what it is worth in a particular pair of hands, not by its
printed price — the fourth railroad is worth more than the first, and the deed
that completes a set is worth several times its price. They weigh cash by how
close to the edge they are, they will pay over the odds for the one deed they
are missing, and a hard player will not hand over a colour group at any price.

## Saving

The game saves itself to your browser as you play — at the start of each turn
and after anything that changes what you own. Reopen the page and the setup
screen offers to resume. Finishing a game clears it.

## Tests

```sh
./test/run.sh
```

The suites run on the JavaScriptCore shell that ships with macOS, or on Node if
that is what the machine has.

`smoke-test.js` stubs enough DOM for the game to load, then checks the board and
the rules: 40 spaces with 22 properties in known colour groups, both card decks,
that the shuffle preserves and actually shuffles, and then every rent table —
railroads at one through four, utilities at four and ten times the roll, a
doubled unbuilt group, houses, hotels and mortgages. It covers even build and
even sell, the bank's supply of houses and hotels, bankruptcy to a creditor and
to the bank, all six house rules, the speed die's faces, deal validation, what
the computer will and will not trade, a save round-tripped through JSON with its
shuffled decks intact, and the board themes.

It reads whichever layout `index.html` points at, so the same numbers before and
after a refactor mean the refactor was clean.

`online-test.js` drives the online layer over an in-memory transport: snapshot
fidelity against state built by the game's own constructors, the guest mirror,
who is allowed to act and when — including the debtor who may sell out of turn
and the neighbour who may not — the newer intents and prompts, chat relayed
through the host, and a guest that drops and walks back into its own seat.

Peer discovery itself still needs two real browsers and is not covered.

## Online play

Pick **Host online** on the setup screen and you get a five-character room code.
Friends pick **Join online**, type the code, take a seat and mark themselves
ready. Any seat nobody claims is played by the computer.

The host's browser runs the one real game. Guests receive a snapshot of it after
every change and render a mirror, then send intents for their own turn — so two
boards cannot drift apart. Game traffic goes directly browser-to-browser over
WebRTC; the only outside service involved introduces the two browsers to each
other.

Everything a player can be asked is routed to whoever it belongs to: rolling and
ending a turn, buying or auctioning, jail, cards, **one round of an auction**, a
**trade offer**, the square you pick after a triple, and **raising funds against
a debt** — the flows that are conversations rather than single questions are
broken into a question per round, which is what lets them cross the wire at all.

If somebody drops, their seat is held for them: this browser identifies itself
with an id that survives a reload, so they rejoin with the same room code and
walk straight back into the seat they left, and the game carries on. There is
also a chat box, on the channel already carrying the game.

## Versions

`v1` is the game as first written. See the
[releases](https://github.com/Just-Rice/Monopolyish/releases).

---

Monopoly is a trademark of Hasbro. This is a personal, non-commercial project
made for fun and is not affiliated with or endorsed by them.
