# Monopolyish

A full game of Monopoly that runs in the browser. One HTML file, no build step,
no install.

```sh
open index.html
```

## What's in it

- The complete board, with property groups, railroads and utilities
- **AI opponents** at easy, medium and hard
- **Auctions** when a property is declined
- **Trading** between players
- **Mortgaging** and unmortgaging
- Houses and hotels, with the usual building rules
- Jail, Chance and Community Chest
- Bankruptcy, and net-worth tracking to settle who is actually winning
- Free Parking pot as an optional house rule

## Structure

```
index.html        markup only, ~150 lines
css/style.css     the whole stylesheet
js/
  property.js     board layout, colour groups, rent and building rules
  player.js       player creation, tokens, colours, net worth
  cards.js        Chance and Community Chest decks
  dice.js         rolling and dice faces
  board.js        drawing the board
  ai.js           the computer opponent
  ui.js           panels, toasts and modals
  game.js         the Game class: turn flow
  setup.js        the setup screen
test/             headless smoke test, run with ./test/run.sh
```

The module boundaries are the ones the original author marked in comments
(`// === property.js ===`), so this is the structure the file was already
written to have. Scripts load in that order as plain `<script>` tags, so the
game still opens by double-clicking `index.html` — no server, no build step.

The only thing it fetches from the network is a Google Fonts stylesheet, so it
runs offline too, just with fallback typefaces.

## Tests

```sh
./test/run.sh
```

A headless harness stubs enough DOM for the game to load under JavaScriptCore,
then checks the board is 40 spaces with 22 properties, that every property has a
price and a rising six-step rent table in a known colour group, that both card
decks are intact, that the shuffle preserves and actually shuffles the deck, and
that the AI, UI and Game classes all load.

It reads whichever layout `index.html` points at, so the same numbers before and
after a refactor mean the refactor was clean.

## Versions

`v1` is the game as first written. See the
[releases](https://github.com/Just-Rice/Monopolyish/releases).

---

Monopoly is a trademark of Hasbro. This is a personal, non-commercial project
made for fun and is not affiliated with or endorsed by them.
