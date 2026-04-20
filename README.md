# ♟ SQL Chess

> Play chess — and watch every move translated into real SQL queries in real time.

[![Deploy to GitHub Pages](https://github.com/Devn913/SQL_Chess/actions/workflows/deploy.yml/badge.svg)](https://github.com/Devn913/SQL_Chess/actions/workflows/deploy.yml)

**Live demo:** https://devn913.github.io/SQL_Chess/

---

## Features

| Feature | Details |
|---|---|
| ♟ **Fully playable chess** | All rules enforced via [chess.js](https://github.com/jhlywa/chess.js) — en passant, castling, pawn promotion, check/checkmate/stalemate |
| ⬡ **SQL Panel** | Every move generates real `INSERT`, `UPDATE`, `DELETE` SQL statements with syntax highlighting |
| □ **Toggle SQL** | Hide the SQL panel to play as a traditional chess board |
| 👤 **Guest mode** | No login required — just open the page and play |
| ⇗ **Invite link** | Click "Invite" to generate a shareable URL that encodes the full game state — anyone who opens it continues the same game |
| ⇅ **Flip board** | Swap perspective between white and black |
| ↩ **Undo** | Take back the last move |

## How the SQL works

Each game gets its own `game_id`. Three tables are used:

```sql
chess_game   -- one row per game (id, players, status, winner)
chess_piece  -- one row per piece (position updated on every move)
chess_move   -- one row per move (full audit log)
```

Example — white pawn e2 → e4:

```sql
INSERT INTO chess_move (game_id, move_number, color, piece_type, from_square, to_square, san)
VALUES ('a1b2-c3d4-e5f6-g7h8', 1, 'white', 'pawn', 'e2', 'e4', 'e4');

UPDATE chess_piece
SET    position = 'e4'
WHERE  game_id  = 'a1b2-c3d4-e5f6-g7h8'
  AND  position = 'e2'
  AND  color    = 'white';
```

## CI/CD

The repository uses **GitHub Actions** (`.github/workflows/deploy.yml`):

1. **Validate** — runs `html-validate` on every push/PR to `main`
2. **Deploy** — automatically publishes the site to **GitHub Pages** on every push to `main`

## Local development

No build step required — it's a plain HTML/CSS/JS site.

```bash
# Clone and open
git clone https://github.com/Devn913/SQL_Chess.git
cd SQL_Chess
# Open index.html in your browser, or serve with any static server:
npx serve .
```

## License

[MIT](LICENSE)
