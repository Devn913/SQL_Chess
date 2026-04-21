/**
 * SQL Chess — Main Application
 * A chess game where every move is translated into SQL queries in real time.
 *
 * Features:
 *  - Fully playable chess (chess.js engine)
 *  - SQL query panel showing CREATE/INSERT/UPDATE/DELETE for every move
 *  - Toggle SQL panel on/off
 *  - Play as Guest (no login required)
 *  - Invite system: generates a shareable URL with full game state
 *  - Pawn promotion dialog
 *  - Undo, flip board
 *  - Load game from invite URL on page load
 */

'use strict';

/* ─── Configuration ──────────────────────────────────────────── */
const PIECE_UNICODE = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']; // top→bottom visual

/* ─── State ───────────────────────────────────────────────────── */
const state = {
  chess: null,
  gameId: null,
  selectedSquare: null,
  validMoves: [],
  flipped: false,
  showSQL: true,
  sqlBlocks: [],
  moveCount: 0,
  whitePlayer: 'Guest White',
  blackPlayer: 'Guest Black',
  lastMove: null,
  pendingPromotion: null,   // { from, to } while waiting for user to pick
  capturedByWhite: [],      // pieces taken by white (black pieces lost)
  capturedByBlack: [],      // pieces taken by black (white pieces lost)
};

/* ─── Helpers ─────────────────────────────────────────────────── */
function generateId() {
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  ).join('-');
}

function pieceName(type) { return PIECE_NAMES[type] || type; }

function pieceSymbol(color, type) {
  return PIECE_UNICODE[(color === 'w' ? 'w' : 'b') + type.toUpperCase()] || '';
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function showToast(msg, duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), duration);
}

/* ─── Board Rendering ─────────────────────────────────────────── */
function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const rankLabels  = document.getElementById('rankLabels');
  const fileLabels  = document.getElementById('fileLabels');
  rankLabels.innerHTML = '';
  fileLabels.innerHTML = '';

  const ranks = state.flipped ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
  const files  = state.flipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];

  ranks.forEach(rank => {
    const lbl = document.createElement('div');
    lbl.className = 'rank-label';
    lbl.textContent = rank;
    rankLabels.appendChild(lbl);
  });
  files.forEach(file => {
    const lbl = document.createElement('div');
    lbl.className = 'file-label';
    lbl.textContent = file;
    fileLabels.appendChild(lbl);
  });

  ranks.forEach(rank => {
    files.forEach(file => {
      const sq = document.createElement('div');
      const sqName = file + rank;
      const isDark = (file.charCodeAt(0) + parseInt(rank)) % 2 === 0;
      sq.className = 'sq ' + (isDark ? 'dark' : 'light');
      sq.dataset.square = sqName;
      sq.addEventListener('click', () => onSquareClick(sqName));
      board.appendChild(sq);
    });
  });
}

function renderPieces() {
  const boardState = state.chess.board();
  document.querySelectorAll('.sq').forEach(sqEl => {
    sqEl.innerHTML = '';
    sqEl.classList.remove('selected', 'valid-move', 'valid-capture', 'last-from', 'last-to', 'in-check');

    const sqName = sqEl.dataset.square;
    const file   = sqName.charCodeAt(0) - 97;
    const rank   = parseInt(sqName[1]) - 1;
    const piece  = boardState[7 - rank][file];

    if (piece) {
      const span = document.createElement('span');
      span.className = 'piece';
      span.textContent = pieceSymbol(piece.color, piece.type);
      sqEl.appendChild(span);
    }

    // Highlight last move
    if (state.lastMove) {
      if (sqName === state.lastMove.from) sqEl.classList.add('last-from');
      if (sqName === state.lastMove.to)   sqEl.classList.add('last-to');
    }
  });

  // Highlight selected + valid moves
  if (state.selectedSquare) {
    const sel = document.querySelector(`.sq[data-square="${state.selectedSquare}"]`);
    if (sel) sel.classList.add('selected');
    state.validMoves.forEach(mv => {
      const target = document.querySelector(`.sq[data-square="${mv.to}"]`);
      if (target) {
        target.classList.add(mv.captured ? 'valid-capture' : 'valid-move');
      }
    });
  }

  // Highlight check
  if (state.chess.in_check()) {
    const turn = state.chess.turn();
    const kingType = 'k';
    state.chess.board().forEach((row, ri) => {
      row.forEach((cell, fi) => {
        if (cell && cell.color === turn && cell.type === kingType) {
          const sqName = FILES[fi] + (8 - ri);
          const sqEl = document.querySelector(`.sq[data-square="${sqName}"]`);
          if (sqEl) sqEl.classList.add('in-check');
        }
      });
    });
  }
}

function updateCapturedStrips() {
  const fmt = (arr) => arr.map(p => pieceSymbol(p.color, p.type)).join('');
  document.getElementById('whiteCapturedStrip').textContent = fmt(state.capturedByWhite);
  document.getElementById('blackCapturedStrip').textContent = fmt(state.capturedByBlack);
}

function updatePlayerBars() {
  const turn  = state.chess.turn();
  document.getElementById('whiteBadge').textContent = turn === 'w' ? 'Your turn' : '';
  document.getElementById('blackBadge').textContent = turn === 'b' ? 'Your turn' : '';
  document.getElementById('whiteBar').style.opacity = turn === 'w' ? '1' : '.65';
  document.getElementById('blackBar').style.opacity = turn === 'b' ? '1' : '.65';
  document.getElementById('whiteBar').classList.toggle('active-turn', turn === 'w');
  document.getElementById('blackBar').classList.toggle('active-turn', turn === 'b');
}

function updateStatus() {
  const el = document.getElementById('gameStatusText');
  const chess = state.chess;
  if (chess.in_checkmate()) {
    const winner = chess.turn() === 'w' ? state.blackPlayer : state.whitePlayer;
    el.textContent = `♛ Checkmate — ${winner} wins!`;
    el.style.color = 'var(--accent-red)';
  } else if (chess.in_stalemate()) {
    el.textContent = '½-½ Stalemate';
    el.style.color = 'var(--accent-orange)';
  } else if (chess.in_draw()) {
    el.textContent = '½-½ Draw';
    el.style.color = 'var(--accent-orange)';
  } else if (chess.in_check()) {
    const who = chess.turn() === 'w' ? state.whitePlayer : state.blackPlayer;
    el.textContent = `⚠ Check — ${who}`;
    el.style.color = 'var(--accent-red)';
  } else {
    const who = chess.turn() === 'w' ? state.whitePlayer : state.blackPlayer;
    el.textContent = `${who} to move`;
    el.style.color = 'var(--text-secondary)';
  }
}

function buildMoveHistory() {
  const list  = document.getElementById('movesList');
  const pgn   = state.chess.pgn({ max_width: 80, newline_char: ' ' });
  const moves = state.chess.history();
  list.innerHTML = '';
  for (let i = 0; i < moves.length; i += 2) {
    const num  = Math.floor(i / 2) + 1;
    const pair = document.createElement('div');
    pair.className = 'move-pair';
    pair.innerHTML =
      `<span class="move-num">${num}.</span>` +
      `<span class="move-san">${moves[i]}</span>` +
      (moves[i + 1] ? `<span class="move-san">${moves[i + 1]}</span>` : '');
    list.appendChild(pair);
  }
  list.scrollTop = list.scrollHeight;
}

function renderAll() {
  renderPieces();
  updateCapturedStrips();
  updatePlayerBars();
  updateStatus();
  buildMoveHistory();
}

/* ─── SQL Move Input ──────────────────────────────────────────── */

/**
 * Populate the SQL input textarea with a move template for the selected piece.
 */
function fillSQLInputTemplate(sqName, piece) {
  const input = document.getElementById('sqlMoveInput');
  if (!input) return;
  const color = piece.color === 'w' ? 'white' : 'black';
  input.value =
    `UPDATE chess_piece\n` +
    `SET    position = '???'\n` +
    `WHERE  position = '${sqName}'\n` +
    `  AND  color    = '${color}';`;
  // Place cursor on the ??? so the user can immediately type the destination
  const idx = input.value.indexOf('???');
  input.focus();
  input.setSelectionRange(idx, idx + 3);
  clearSQLRunError();
}

/**
 * Parse a SQL string and extract { from, to } squares.
 * Accepted formats:
 *   1. UPDATE chess_piece SET position = 'e4' WHERE ... position = 'e2' ...
 *   2. Shorthand:  e2 e4  /  e2-e4  /  e2 to e4
 */
function parseSQLMove(query) {
  const q = query.trim();

  // Shorthand: "e2 e4", "e2-e4", "e2 to e4", "e2e4"
  const shorthand = q.match(/^([a-h][1-8])\s*(?:-|to)?\s*([a-h][1-8])$/i);
  if (shorthand) {
    const from = shorthand[1].toLowerCase();
    const to   = shorthand[2].toLowerCase();
    if (from === to) return null;
    return { from, to };
  }

  // Standard UPDATE … SET position = 'to' … WHERE … position = 'from'
  const setMatch = q.match(/SET\s+position\s*=\s*'([a-h][1-8])'/i);
  if (!setMatch) return null;
  const to = setMatch[1].toLowerCase();

  const whereIdx = q.search(/WHERE/i);
  if (whereIdx === -1) return null;
  const whereClause = q.slice(whereIdx);
  const fromMatch = whereClause.match(/position\s*=\s*'([a-h][1-8])'/i);
  if (!fromMatch) return null;
  const from = fromMatch[1].toLowerCase();

  if (from === to) return null;
  return { from, to };
}

function showSQLRunError(msg) {
  const el = document.getElementById('sqlRunError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearSQLRunError() {
  const el = document.getElementById('sqlRunError');
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

function runSQLMove() {
  if (!state.chess) { showSQLRunError('No game in progress.'); return; }
  if (state.chess.game_over()) { showSQLRunError('Game is over.'); return; }
  if (state.pendingPromotion) { showSQLRunError('Finish pawn promotion first.'); return; }

  const input = document.getElementById('sqlMoveInput');
  const query = input ? input.value : '';
  if (!query.trim()) { showSQLRunError('Enter a SQL statement to move a piece.'); return; }

  const parsed = parseSQLMove(query);
  if (!parsed) {
    showSQLRunError('Could not parse move. Use: UPDATE chess_piece SET position = \'e4\' WHERE position = \'e2\';');
    return;
  }

  const { from, to } = parsed;

  // Validate that there's a piece at `from` belonging to the current player
  const piece = state.chess.get(from);
  if (!piece) { showSQLRunError(`No piece found at ${from}.`); return; }
  if (piece.color !== state.chess.turn()) {
    showSQLRunError(`It is ${state.chess.turn() === 'w' ? 'White' : 'Black'}'s turn.`);
    return;
  }

  // Check if it's a promotion
  const validMoves = state.chess.moves({ square: from, verbose: true });
  const moveObj = validMoves.find(m => m.to === to);
  if (!moveObj) {
    showSQLRunError(`Move ${from}→${to} is not legal.`);
    return;
  }

  clearSQLRunError();
  if (input) input.value = '';

  // Reset board selection
  state.selectedSquare = null;
  state.validMoves = [];

  if (moveObj.flags.includes('p')) {
    state.pendingPromotion = { from, to };
    openPromotionDialog(state.chess.turn());
    return;
  }

  executeMove(from, to, null);
}

/* ─── Square Click Logic ──────────────────────────────────────── */
function onSquareClick(sqName) {
  // Ignore clicks if game over or awaiting promotion
  if (state.chess.game_over()) return;
  if (state.pendingPromotion) return;

  const piece = state.chess.get(sqName);

  // If no square selected yet
  if (!state.selectedSquare) {
    if (!piece) return;
    if (piece.color !== state.chess.turn()) return; // not your piece
    state.selectedSquare = sqName;
    state.validMoves = state.chess.moves({ square: sqName, verbose: true });
    renderPieces();
    // Auto-fill SQL input with template
    fillSQLInputTemplate(sqName, piece);
    return;
  }

  // Already have a selected square
  if (sqName === state.selectedSquare) {
    // Deselect
    state.selectedSquare = null;
    state.validMoves = [];
    renderPieces();
    return;
  }

  // Re-select if clicking own piece
  if (piece && piece.color === state.chess.turn()) {
    state.selectedSquare = sqName;
    state.validMoves = state.chess.moves({ square: sqName, verbose: true });
    renderPieces();
    return;
  }

  // Attempt a move
  const moveObj = state.validMoves.find(m => m.to === sqName);
  if (!moveObj) {
    // Invalid target — deselect
    state.selectedSquare = null;
    state.validMoves = [];
    renderPieces();
    return;
  }

  // Pawn promotion?
  if (moveObj.flags.includes('p')) {
    state.pendingPromotion = { from: state.selectedSquare, to: sqName };
    state.selectedSquare = null;
    state.validMoves = [];
    openPromotionDialog(state.chess.turn());
    return;
  }

  executeMove(state.selectedSquare, sqName, null);
}

function executeMove(from, to, promotion) {
  const moveResult = state.chess.move({ from, to, promotion: promotion || 'q' });
  if (!moveResult) return;

  // Track captures
  if (moveResult.captured) {
    const capturedPiece = { color: moveResult.color === 'w' ? 'b' : 'w', type: moveResult.captured };
    if (moveResult.color === 'w') {
      state.capturedByWhite.push(capturedPiece);
    } else {
      state.capturedByBlack.push(capturedPiece);
    }
  }

  state.lastMove = { from, to };
  state.selectedSquare = null;
  state.validMoves = [];
  state.moveCount++;

  // Clear SQL input template after a successful board-click move
  const sqlMoveInput = document.getElementById('sqlMoveInput');
  if (sqlMoveInput && sqlMoveInput.value.includes('???')) {
    sqlMoveInput.value = '';
    clearSQLRunError();
  }

  // Generate SQL
  if (state.showSQL) {
    const sql = SQLGen.move(moveResult, state.moveCount, state.gameId);
    appendSQL(sql, `Move ${Math.ceil(state.moveCount / 2)} — ${capitalize(pieceName(moveResult.piece))} ${from}→${to}`, state.moveCount);

    // Game-end SQL
    if (state.chess.in_checkmate() || state.chess.in_stalemate() || state.chess.in_draw()) {
      const endSQL = SQLGen.gameEnd(state.chess, state.gameId);
      appendSQL(endSQL, 'Game Over', null);
    } else if (state.chess.in_check()) {
      const checkSQL = SQLGen.check(state.chess.turn(), state.gameId);
      appendSQL(checkSQL, '⚠ Check', null);
    }
  }

  renderAll();

  // Show game-end toast
  if (state.chess.in_checkmate()) {
    const winner = state.chess.turn() === 'w' ? state.blackPlayer : state.whitePlayer;
    showToast(`♛ Checkmate! ${winner} wins!`, 5000);
  } else if (state.chess.in_stalemate()) {
    showToast('½-½ Stalemate!', 4000);
  } else if (state.chess.in_draw()) {
    showToast('½-½ Draw!', 4000);
  }
}

/* ─── Promotion Dialog ────────────────────────────────────────── */
function openPromotionDialog(turn) {
  const overlay = document.getElementById('promotionOverlay');
  const choices = document.getElementById('promotionChoices');
  choices.innerHTML = '';
  const pieces = ['q', 'r', 'b', 'n'];
  const names  = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  pieces.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'promotion-btn';
    btn.title = names[p];
    btn.textContent = pieceSymbol(turn, p);
    btn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      const prom = state.pendingPromotion;
      state.pendingPromotion = null;
      executeMove(prom.from, prom.to, p);
    });
    choices.appendChild(btn);
  });
  overlay.classList.remove('hidden');
}

/* ─── SQL Generation ──────────────────────────────────────────── */
const SQLGen = {
  gameStart(gameId, whiteName, blackName) {
    return [
      `-- ══════════════════════════════════════════`,
      `-- SQL Chess  ·  New Game`,
      `-- Game ID : ${gameId}`,
      `-- ══════════════════════════════════════════`,
      ``,
      `-- Schema (run once)`,
      `CREATE TABLE IF NOT EXISTS chess_game (`,
      `    id           CHAR(36)     NOT NULL,`,
      `    white_player VARCHAR(100) NOT NULL,`,
      `    black_player VARCHAR(100) NOT NULL,`,
      `    status       VARCHAR(20)  NOT NULL DEFAULT 'active',`,
      `    winner       VARCHAR(10)           DEFAULT NULL,`,
      `    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,`,
      `    PRIMARY KEY (id)`,
      `);`,
      ``,
      `CREATE TABLE IF NOT EXISTS chess_piece (`,
      `    piece_id     VARCHAR(15)  NOT NULL,`,
      `    game_id      CHAR(36)     NOT NULL,`,
      `    color        VARCHAR(5)   NOT NULL,`,
      `    type         VARCHAR(10)  NOT NULL,`,
      `    position     CHAR(2)               DEFAULT NULL,`,
      `    is_captured  BOOLEAN      NOT NULL DEFAULT FALSE,`,
      `    PRIMARY KEY (piece_id, game_id),`,
      `    FOREIGN KEY (game_id) REFERENCES chess_game(id)`,
      `);`,
      ``,
      `CREATE TABLE IF NOT EXISTS chess_move (`,
      `    id           INT          NOT NULL AUTO_INCREMENT,`,
      `    game_id      CHAR(36)     NOT NULL,`,
      `    move_number  INT          NOT NULL,`,
      `    color        VARCHAR(5)   NOT NULL,`,
      `    piece_type   VARCHAR(10)  NOT NULL,`,
      `    from_square  CHAR(2)      NOT NULL,`,
      `    to_square    CHAR(2)      NOT NULL,`,
      `    captured     VARCHAR(10)           DEFAULT NULL,`,
      `    special      VARCHAR(20)           DEFAULT NULL,`,
      `    san          VARCHAR(10)  NOT NULL,`,
      `    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,`,
      `    PRIMARY KEY (id),`,
      `    FOREIGN KEY (game_id) REFERENCES chess_game(id)`,
      `);`,
      ``,
      `-- Start new game`,
      `INSERT INTO chess_game (id, white_player, black_player)`,
      `VALUES ('${gameId}', '${whiteName}', '${blackName}');`,
      ``,
      `-- Set up all 32 pieces`,
      `INSERT INTO chess_piece (piece_id, game_id, color, type, position) VALUES`,
      `    ('wR_a1','${gameId}','white','rook',  'a1'),`,
      `    ('wN_b1','${gameId}','white','knight','b1'),`,
      `    ('wB_c1','${gameId}','white','bishop','c1'),`,
      `    ('wQ_d1','${gameId}','white','queen', 'd1'),`,
      `    ('wK_e1','${gameId}','white','king',  'e1'),`,
      `    ('wB_f1','${gameId}','white','bishop','f1'),`,
      `    ('wN_g1','${gameId}','white','knight','g1'),`,
      `    ('wR_h1','${gameId}','white','rook',  'h1'),`,
      `    ('wP_a2','${gameId}','white','pawn',  'a2'),`,
      `    ('wP_b2','${gameId}','white','pawn',  'b2'),`,
      `    ('wP_c2','${gameId}','white','pawn',  'c2'),`,
      `    ('wP_d2','${gameId}','white','pawn',  'd2'),`,
      `    ('wP_e2','${gameId}','white','pawn',  'e2'),`,
      `    ('wP_f2','${gameId}','white','pawn',  'f2'),`,
      `    ('wP_g2','${gameId}','white','pawn',  'g2'),`,
      `    ('wP_h2','${gameId}','white','pawn',  'h2'),`,
      `    ('bR_a8','${gameId}','black','rook',  'a8'),`,
      `    ('bN_b8','${gameId}','black','knight','b8'),`,
      `    ('bB_c8','${gameId}','black','bishop','c8'),`,
      `    ('bQ_d8','${gameId}','black','queen', 'd8'),`,
      `    ('bK_e8','${gameId}','black','king',  'e8'),`,
      `    ('bB_f8','${gameId}','black','bishop','f8'),`,
      `    ('bN_g8','${gameId}','black','knight','g8'),`,
      `    ('bR_h8','${gameId}','black','rook',  'h8'),`,
      `    ('bP_a7','${gameId}','black','pawn',  'a7'),`,
      `    ('bP_b7','${gameId}','black','pawn',  'b7'),`,
      `    ('bP_c7','${gameId}','black','pawn',  'c7'),`,
      `    ('bP_d7','${gameId}','black','pawn',  'd7'),`,
      `    ('bP_e7','${gameId}','black','pawn',  'e7'),`,
      `    ('bP_f7','${gameId}','black','pawn',  'f7'),`,
      `    ('bP_g7','${gameId}','black','pawn',  'g7'),`,
      `    ('bP_h7','${gameId}','black','pawn',  'h7');`,
    ].join('\n');
  },

  move(mv, moveNum, gameId) {
    const color      = mv.color === 'w' ? 'white' : 'black';
    const oppColor   = color === 'white' ? 'black' : 'white';
    const piece      = pieceName(mv.piece);
    const isCapture  = !!mv.captured;
    const isEP       = mv.flags.includes('e');
    const isKCastle  = mv.flags.includes('k');
    const isQCastle  = mv.flags.includes('q');
    const isCastle   = isKCastle || isQCastle;
    const isPromo    = mv.flags.includes('p');

    let comment = `-- Move #${moveNum}: ${capitalize(color)} ${piece} ${mv.from} → ${mv.to}`;
    if (isCapture && !isEP) comment = `-- Move #${moveNum}: ${capitalize(color)} ${piece} ${mv.from} ✕ ${mv.to} (captures ${pieceName(mv.captured)})`;
    if (isEP)      comment = `-- Move #${moveNum}: ${capitalize(color)} pawn ${mv.from} ✕ ${mv.to} (en passant)`;
    if (isCastle)  comment = `-- Move #${moveNum}: ${capitalize(color)} castles ${isKCastle ? 'kingside' : 'queenside'}`;
    if (isPromo)   comment += ` → promotes to ${pieceName(mv.promotion)}`;

    const capturedVal = (isCapture && !isEP) ? `'${pieceName(mv.captured)}'` : isEP ? `'pawn'` : 'NULL';
    const specialVal  = isCastle ? `'${isKCastle ? 'kingside-castle' : 'queenside-castle'}'`
                      : isEP     ? `'en-passant'`
                      : isPromo  ? `'promotion-${pieceName(mv.promotion)}'`
                      : 'NULL';

    const lines = [
      comment,
      `INSERT INTO chess_move`,
      `    (game_id, move_number, color, piece_type, from_square, to_square, captured, special, san)`,
      `VALUES`,
      `    ('${gameId}', ${moveNum}, '${color}', '${piece}', '${mv.from}', '${mv.to}', ${capturedVal}, ${specialVal}, '${mv.san}');`,
      ``,
    ];

    if (isCapture && !isEP) {
      lines.push(`-- Remove captured piece`);
      lines.push(`DELETE FROM chess_piece`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${mv.to}'`);
      lines.push(`  AND  color    = '${oppColor}';`);
      lines.push(``);
      lines.push(`-- Advance the capturing piece`);
      lines.push(`UPDATE chess_piece`);
      lines.push(`SET    position = '${mv.to}'`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${mv.from}'`);
      lines.push(`  AND  color    = '${color}';`);
    } else if (isEP) {
      const capRank  = color === 'white' ? parseInt(mv.to[1]) - 1 : parseInt(mv.to[1]) + 1;
      const capSquare = mv.to[0] + capRank;
      lines.push(`-- En passant: remove captured pawn`);
      lines.push(`DELETE FROM chess_piece`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${capSquare}'`);
      lines.push(`  AND  color    = '${oppColor}';`);
      lines.push(``);
      lines.push(`-- Move capturing pawn`);
      lines.push(`UPDATE chess_piece`);
      lines.push(`SET    position = '${mv.to}'`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${mv.from}'`);
      lines.push(`  AND  color    = '${color}';`);
    } else if (isCastle) {
      const rank        = color === 'white' ? '1' : '8';
      const rookFrom    = isKCastle ? `h${rank}` : `a${rank}`;
      const rookTo      = isKCastle ? `f${rank}` : `d${rank}`;
      lines.push(`-- Move king`);
      lines.push(`UPDATE chess_piece`);
      lines.push(`SET    position = '${mv.to}'`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${mv.from}'`);
      lines.push(`  AND  color    = '${color}';`);
      lines.push(``);
      lines.push(`-- Move rook (castling)`);
      lines.push(`UPDATE chess_piece`);
      lines.push(`SET    position = '${rookTo}'`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${rookFrom}'`);
      lines.push(`  AND  color    = '${color}';`);
    } else if (isPromo) {
      const promName = pieceName(mv.promotion);
      if (isCapture) {
        lines.push(`-- Remove captured piece`);
        lines.push(`DELETE FROM chess_piece`);
        lines.push(`WHERE  game_id  = '${gameId}'`);
        lines.push(`  AND  position = '${mv.to}'`);
        lines.push(`  AND  color    = '${oppColor}';`);
        lines.push(``);
      }
      lines.push(`-- Promote pawn to ${promName}`);
      lines.push(`UPDATE chess_piece`);
      lines.push(`SET    position = '${mv.to}', type = '${promName}'`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${mv.from}'`);
      lines.push(`  AND  color    = '${color}';`);
    } else {
      lines.push(`UPDATE chess_piece`);
      lines.push(`SET    position = '${mv.to}'`);
      lines.push(`WHERE  game_id  = '${gameId}'`);
      lines.push(`  AND  position = '${mv.from}'`);
      lines.push(`  AND  color    = '${color}';`);
    }

    return lines.join('\n');
  },

  check(turnAfterMove, gameId) {
    const inCheck = turnAfterMove === 'w' ? 'white' : 'black';
    return [
      `-- ⚠  CHECK! The ${inCheck} king is now in check.`,
      `UPDATE chess_game`,
      `SET    status = 'check'`,
      `WHERE  id     = '${gameId}';`,
    ].join('\n');
  },

  gameEnd(chess, gameId) {
    if (chess.in_checkmate()) {
      const winner = chess.turn() === 'w' ? 'black' : 'white';
      return [
        `-- ♛  CHECKMATE! ${capitalize(winner)} wins!`,
        `UPDATE chess_game`,
        `SET    status = 'checkmate',`,
        `       winner = '${winner}'`,
        `WHERE  id     = '${gameId}';`,
      ].join('\n');
    }
    if (chess.in_stalemate()) {
      return [
        `-- ½-½  STALEMATE — the game is a draw.`,
        `UPDATE chess_game`,
        `SET    status = 'stalemate'`,
        `WHERE  id     = '${gameId}';`,
      ].join('\n');
    }
    return [
      `-- ½-½  DRAW`,
      `UPDATE chess_game`,
      `SET    status = 'draw'`,
      `WHERE  id     = '${gameId}';`,
    ].join('\n');
  },
};

/* ─── SQL Rendering ───────────────────────────────────────────── */
function highlightSQL(code) {
  // Simple keyword highlighting — no external lib needed
  const keywords = [
    'SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET',
    'DELETE','CREATE','TABLE','IF','NOT','EXISTS','PRIMARY','KEY',
    'FOREIGN','REFERENCES','DEFAULT','NULL','BOOLEAN','AUTO_INCREMENT',
    'CHAR','VARCHAR','TIMESTAMP','INT','AND','OR','IN','AS',
  ];
  const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');

  return code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Comments (-- …)
    .replace(/(--[^\n]*)/g, '<span class="sql-cmt">$1</span>')
    // Strings
    .replace(/'([^']*)'/g, "<span class=\"sql-str\">'$1'</span>")
    // Numbers (standalone)
    .replace(/\b(\d+)\b/g, '<span class="sql-num">$1</span>')
    // Keywords
    .replace(kwRegex, '<span class="sql-kw">$1</span>');
}

function appendSQL(code, label, moveNum) {
  const placeholder = document.getElementById('sqlPlaceholder');
  if (placeholder) placeholder.remove();

  const content = document.getElementById('sqlContent');

  const block = document.createElement('div');
  block.className = 'sql-block';

  const labelEl = document.createElement('div');
  labelEl.className = 'sql-block-label';
  if (moveNum !== null) {
    const badge = document.createElement('span');
    badge.className = 'sql-block-badge';
    badge.textContent = '#' + moveNum;
    labelEl.appendChild(badge);
  }
  labelEl.append(' ' + label);

  // Per-block copy button
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'sql-copy-btn';
  copyBtn.textContent = '⎘ Copy';
  copyBtn.title = 'Copy this SQL block';
  copyBtn.addEventListener('click', () => copyToClipboard(code, 'SQL copied!'));
  labelEl.appendChild(copyBtn);

  const codeEl = document.createElement('div');
  codeEl.className = 'sql-code';
  codeEl.innerHTML = highlightSQL(code);

  block.appendChild(labelEl);
  block.appendChild(codeEl);
  content.appendChild(block);

  state.sqlBlocks.push({ code, label, moveNum });

  if (document.getElementById('chkAutoScroll').checked) {
    content.scrollTop = content.scrollHeight;
  }
}

/* ─── Game Lifecycle ──────────────────────────────────────────── */
function startGame(whiteName, blackName, showSQL, existingPGN) {
  state.chess           = new Chess();
  state.gameId          = generateId();
  state.selectedSquare  = null;
  state.validMoves      = [];
  state.lastMove        = null;
  state.moveCount       = 0;
  state.whitePlayer     = whiteName  || 'Guest White';
  state.blackPlayer     = blackName  || 'Guest Black';
  state.showSQL         = showSQL !== false;
  state.sqlBlocks       = [];
  state.capturedByWhite = [];
  state.capturedByBlack = [];
  state.pendingPromotion = null;

  // Names in UI
  document.getElementById('whitePlayerName').textContent = state.whitePlayer;
  document.getElementById('blackPlayerName').textContent = state.blackPlayer;

  // Clear SQL input
  const sqlMoveInput = document.getElementById('sqlMoveInput');
  if (sqlMoveInput) sqlMoveInput.value = '';
  clearSQLRunError();

  // SQL panel visibility
  const sqlPanel = document.getElementById('sqlPanel');
  const lblEl    = document.getElementById('sqlToggleLabel');
  const iconEl   = document.getElementById('sqlToggleIcon');
  if (state.showSQL) {
    sqlPanel.classList.remove('hidden-panel');
    lblEl.textContent  = 'Hide SQL';
    iconEl.textContent = '◧';
  } else {
    sqlPanel.classList.add('hidden-panel');
    lblEl.textContent  = 'Show SQL';
    iconEl.textContent = '□';
  }

  // Clear SQL content
  const sqlContent = document.getElementById('sqlContent');
  sqlContent.innerHTML = '';
  if (state.showSQL) {
    const placeholder = document.createElement('div');
    placeholder.id = 'sqlPlaceholder';
    placeholder.className = 'sql-placeholder';
    placeholder.innerHTML =
      `<span class="placeholder-icon">⬡</span>` +
      `<p>SQL queries will appear here as you play.</p>` +
      `<p class="placeholder-hint">Each chess move is translated into<br/>real SQL statements in real time.</p>`;
    sqlContent.appendChild(placeholder);

    // Emit game-start SQL
    const initSQL = SQLGen.gameStart(state.gameId, state.whitePlayer, state.blackPlayer);
    appendSQL(initSQL, 'Game Initialized', null);
  }

  // Load from PGN if provided (invite link)
  if (existingPGN && existingPGN.trim()) {
    try {
      state.chess.load_pgn(existingPGN);
      // Replay SQL for every move
      if (state.showSQL) {
        const history = state.chess.history({ verbose: true });
        // Reset and replay
        const tempChess = new Chess();
        history.forEach(mv => {
          tempChess.move(mv);
          state.moveCount++;
          const sql = SQLGen.move(mv, state.moveCount, state.gameId);
          appendSQL(sql, `Move ${Math.ceil(state.moveCount / 2)} — ${capitalize(pieceName(mv.piece))} ${mv.from}→${mv.to}`, state.moveCount);
          if (mv.captured) {
            const capturedPiece = { color: mv.color === 'w' ? 'b' : 'w', type: mv.captured };
            if (mv.color === 'w') state.capturedByWhite.push(capturedPiece);
            else state.capturedByBlack.push(capturedPiece);
          }
        });
        // Set last move
        if (history.length > 0) {
          const last = history[history.length - 1];
          state.lastMove = { from: last.from, to: last.to };
        }
      }
    } catch (e) {
      console.warn('Could not load PGN from invite link:', e);
    }
  }

  buildBoard();
  renderAll();
}

/* ─── Invite URL ──────────────────────────────────────────────── */
function generateInviteURL() {
  const pgn = state.chess.pgn() || '';
  const params = new URLSearchParams({
    w: state.whitePlayer,
    b: state.blackPlayer,
    sql: state.showSQL ? '1' : '0',
    pgn: btoa(pgn),
  });
  const base = window.location.origin + window.location.pathname;
  return `${base}?${params.toString()}`;
}

function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('pgn')) return false;
  const whiteName = params.get('w') || 'Guest White';
  const blackName = params.get('b') || 'Guest Black';
  const showSQL   = params.get('sql') !== '0';
  let pgn = '';
  try { pgn = atob(params.get('pgn') || ''); } catch (e) { /* ignore */ }
  startGame(whiteName, blackName, showSQL, pgn);
  return true;
}

/* ─── Event Wiring ────────────────────────────────────────────── */
function init() {
  // Always start with setup modal hidden; show it only when needed
  document.getElementById('setupModalOverlay').classList.add('hidden');

  // Try loading from invite URL first
  const loadedFromURL = loadFromURL();

  // Show setup modal unless loaded from invite
  if (!loadedFromURL) {
    document.getElementById('setupModalOverlay').classList.remove('hidden');
  }

  // New Game button → open setup modal
  document.getElementById('btnNewGame').addEventListener('click', () => {
    document.getElementById('setupModalOverlay').classList.remove('hidden');
  });

  // Start Game
  document.getElementById('btnStartGame').addEventListener('click', () => {
    const wName   = document.getElementById('inputWhiteName').value.trim() || 'Guest White';
    const bName   = document.getElementById('inputBlackName').value.trim() || 'Guest Black';
    const showSql = document.getElementById('chkShowSQL').checked;
    document.getElementById('setupModalOverlay').classList.add('hidden');
    startGame(wName, bName, showSql, null);
  });

  // Play as Guest (skip name entry)
  document.getElementById('btnPlayAsGuest').addEventListener('click', () => {
    document.getElementById('setupModalOverlay').classList.add('hidden');
    startGame('Guest White', 'Guest Black', true, null);
  });

  // Toggle SQL Panel
  document.getElementById('btnToggleSQL').addEventListener('click', () => {
    state.showSQL = !state.showSQL;
    const sqlPanel = document.getElementById('sqlPanel');
    const lblEl    = document.getElementById('sqlToggleLabel');
    const iconEl   = document.getElementById('sqlToggleIcon');
    if (state.showSQL) {
      sqlPanel.classList.remove('hidden-panel');
      lblEl.textContent  = 'Hide SQL';
      iconEl.textContent = '◧';
    } else {
      sqlPanel.classList.add('hidden-panel');
      lblEl.textContent  = 'Show SQL';
      iconEl.textContent = '□';
    }
  });

  // Undo
  document.getElementById('btnUndo').addEventListener('click', () => {
    if (!state.chess) return;
    const undone = state.chess.undo();
    if (!undone) return;
    state.moveCount = Math.max(0, state.moveCount - 1);
    state.lastMove = null;
    // Fix captures
    if (undone.captured) {
      if (undone.color === 'w') state.capturedByWhite.pop();
      else state.capturedByBlack.pop();
    }
    // Remove last SQL block from UI
    const content = document.getElementById('sqlContent');
    if (content.lastChild && !content.lastChild.id) {
      content.removeChild(content.lastChild);
      state.sqlBlocks.pop();
    }
    state.selectedSquare = null;
    state.validMoves = [];
    renderAll();
  });

  // Flip board
  document.getElementById('btnFlip').addEventListener('click', () => {
    state.flipped = !state.flipped;
    buildBoard();
    renderPieces();
  });

  // Clear SQL
  document.getElementById('btnClearSQL').addEventListener('click', () => {
    const content = document.getElementById('sqlContent');
    content.innerHTML = '';
    state.sqlBlocks = [];
  });

  // Copy all SQL
  document.getElementById('btnCopySQL').addEventListener('click', () => {
    const allSQL = state.sqlBlocks.map(b => '-- ' + b.label + '\n' + b.code).join('\n\n');
    copyToClipboard(allSQL, 'All SQL copied!');
  });

  // Invite button
  document.getElementById('btnInvite').addEventListener('click', () => {
    if (!state.chess) {
      showToast('Start a game first!');
      return;
    }
    const url = generateInviteURL();
    document.getElementById('inviteUrlInput').value = url;
    document.getElementById('inviteTurn').textContent =
      state.chess.turn() === 'w' ? state.whitePlayer : state.blackPlayer;
    document.getElementById('inviteMoves').textContent = state.moveCount;
    document.getElementById('inviteModalOverlay').classList.remove('hidden');
    document.getElementById('copyFeedback').classList.add('hidden');
  });

  document.getElementById('btnCloseInvite').addEventListener('click', () => {
    document.getElementById('inviteModalOverlay').classList.add('hidden');
  });
  document.getElementById('inviteModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('inviteModalOverlay')) {
      document.getElementById('inviteModalOverlay').classList.add('hidden');
    }
  });

  document.getElementById('btnCopyInvite').addEventListener('click', () => {
    const url = document.getElementById('inviteUrlInput').value;
    copyToClipboard(url, null);
    document.getElementById('copyFeedback').classList.remove('hidden');
    setTimeout(() => document.getElementById('copyFeedback').classList.add('hidden'), 2500);
  });

  // Close invite on overlay click already wired above

  // SQL Move Input
  document.getElementById('btnRunSQL').addEventListener('click', runSQLMove);
  document.getElementById('btnClearInput').addEventListener('click', () => {
    const input = document.getElementById('sqlMoveInput');
    if (input) input.value = '';
    clearSQLRunError();
  });
  document.getElementById('sqlMoveInput').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runSQLMove();
    }
  });
}

function copyToClipboard(text, toastMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (toastMsg) showToast(toastMsg);
    }).catch(() => fallbackCopy(text, toastMsg));
  } else {
    fallbackCopy(text, toastMsg);
  }
}

function fallbackCopy(text, toastMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (toastMsg) showToast(toastMsg);
  } catch (e) {
    showToast('Copy failed — please copy manually');
  }
  document.body.removeChild(ta);
}

/* ─── Bootstrap ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
