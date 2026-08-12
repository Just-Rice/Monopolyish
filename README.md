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

Everything lives in `index.html` — markup, styles and logic in one file, around
4,300 lines. There is no framework and nothing to install; the only thing it
fetches from the network is a Google Fonts stylesheet for the typefaces, so it
still runs offline, just with fallback fonts.

## Versions

`v1` is the game as first written. See the
[releases](https://github.com/Just-Rice/Monopolyish/releases).

---

Monopoly is a trademark of Hasbro. This is a personal, non-commercial project
made for fun and is not affiliated with or endorsed by them.
