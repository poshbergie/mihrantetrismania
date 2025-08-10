```jsx
import React, { useEffect, useRef, useState } from "react";

// Mihran's Tetris Mania - keyboard + touch controls
// Left/Right = move, Down = soft drop, Up = rotate, Space = hard drop, R = restart.
// On touch: tap = rotate, swipe left/right = move, swipe down = soft drop, double-tap = hard drop.
// On-screen buttons provided for mobile: Left, Rotate, Right, Down, Drop.

const COLS = 10;
const ROWS = 20;
const CELL = 28;

const SHAPES = {
  I: { color: "#00BCD4", matrix: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  J: { color: "#3F51B5", matrix: [[1,0,0],[1,1,1],[0,0,0]] },
  L: { color: "#FF9800", matrix: [[0,0,1],[1,1,1],[0,0,0]] },
  O: { color: "#FFC107", matrix: [[1,1],[1,1]] },
  S: { color: "#4CAF50", matrix: [[0,1,1],[1,1,0],[0,0,0]] },
  T: { color: "#9C27B0", matrix: [[0,1,0],[1,1,1],[0,0,0]] },
  Z: { color: "#F44336", matrix: [[1,1,0],[0,1,1],[0,0,0]] }
};

const ALL_KEYS = Object.keys(SHAPES);
const LIGHTNING = "⚡";
const ICONS = ["★","◆","●","▲","♥","♣","☀","☂","⚙",LIGHTNING,"✿","◼","⬢"]; // unicode icons
const NON_LIGHTNING_ICONS = ICONS.filter((x) => x !== LIGHTNING);
const LIGHTNING_PROB = 0.03; // about 3 percent chance per filled cell

let PIECE_SEQ = 0; // monotonically increasing id per piece spawn

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function rotateMatrixCW(m) {
  const rows = m.length, cols = m[0].length;
  const res = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) res[c][rows - 1 - r] = m[r][c];
  return res;
}

function rotateIconsCW(m) {
  const rows = m.length, cols = m[0].length;
  const res = Array.from({ length: cols }, () => Array(rows).fill(null));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) res[c][rows - 1 - r] = m[r][c];
  return res;
}

function randIcon() {
  if (Math.random() < LIGHTNING_PROB) return LIGHTNING; // rare lightning
  const i = (Math.random() * NON_LIGHTNING_ICONS.length) | 0;
  return NON_LIGHTNING_ICONS[i];
}

function randomPiece() {
  const key = ALL_KEYS[(Math.random() * ALL_KEYS.length) | 0];
  const shape = SHAPES[key];
  const matrix = shape.matrix.map(row => row.slice());
  const icons = matrix.map(row => row.map(v => (v ? randIcon() : null)));
  return {
    id: ++PIECE_SEQ,
    key,
    color: shape.color,
    matrix,
    icons,
    row: 0,
    col: Math.floor((COLS - shape.matrix[0].length) / 2),
  };
}

function collides(board, piece, offR = 0, offC = 0, mat = null) {
  const m = mat || piece.matrix;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[0].length; c++) {
      if (!m[r][c]) continue;
      const nr = piece.row + r + offR;
      const nc = piece.col + c + offC;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return true;
      if (board[nr][nc]) return true;
    }
  }
  return false;
}

function merge(board, piece) {
  const newBoard = board.map(row => row.slice());
  const m = piece.matrix;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[0].length; c++) {
      if (m[r][c]) {
        const br = piece.row + r;
        const bc = piece.col + c;
        if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) newBoard[br][bc] = { color: piece.color, icon: piece.icons[r][c] };
      }
    }
  }
  return newBoard;
}

function clearLines(board) {
  const kept = board.filter(row => row.some(cell => !cell));
  const cleared = ROWS - kept.length; // number of full rows removed
  const pad = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  return { board: [...pad, ...kept], cleared };
}

function hasLightningInIcons(icons) {
  for (let r = 0; r < icons.length; r++) {
    for (let c = 0; c < icons[0].length; c++) {
      if (icons[r][c] === LIGHTNING) return true;
    }
  }
  return false;
}

export default function App() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Inject Google Font once to avoid broken URL imports
  useEffect(() => {
    const id = "press-start-2p-font";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const [board, setBoard] = useState(emptyBoard());
  const [piece, setPiece] = useState(randomPiece());
  const [score, setScore] = useState(0);
  const [high, setHigh] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = Number(localStorage.getItem("tetris_highscore") || 0);
    return Number.isFinite(saved) ? saved : 0;
  });
  const [gameOver, setGameOver] = useState(false);

  // Touch helpers
  const isTouch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const touchStart = useRef({ x: 0, y: 0, t: 0 });
  const lastTap = useRef(0);
  const holdTimer = useRef(null); // for holding Down button

  // Refs to avoid stale closures in RAF
  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  const overRef = useRef(gameOver);
  const softRef = useRef(false); // whether Down key is held
  const awardedRef = useRef(-1); // piece.id already awarded for lightning
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { pieceRef.current = piece; }, [piece]);
  useEffect(() => { overRef.current = gameOver; }, [gameOver]);

  // Focus so keys work
  useEffect(() => { containerRef.current?.focus(); }, []);

  // Award lightning bonus exactly once per spawned piece
  useEffect(() => {
    if (!piece) return;
    if (piece.id === awardedRef.current) return;
    if (hasLightningInIcons(piece.icons)) {
      setScore((s) => {
        const ns = s + 5; // +5 for any lightning in the spawned piece
        updateHighScore(ns);
        return ns;
      });
    }
    awardedRef.current = piece.id;
  }, [piece?.id]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = COLS * CELL, H = ROWS * CELL;
    canvas.width = W; canvas.height = H;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // grid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.strokeRect(c * CELL, r * CELL, CELL, CELL);
      }
    }

    // locked blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell) drawCell(ctx, c, r, cell.color, cell.icon);
      }
    }

    // active piece
    if (!gameOver) drawMatrix(ctx, piece.matrix, piece.icons, piece.col, piece.row, { color: piece.color });

    // Game over overlay
    if (gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px 'Press Start 2P', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game Over", W/2, H/2 - 14);
      ctx.font = "16px 'Press Start 2P', system-ui, sans-serif";
      ctx.fillText("Score: " + score, W/2, H/2 + 12);
      ctx.fillText("Press R to restart", W/2, H/2 + 36);
    }
  }, [board, piece, gameOver, score]);

  function updateHighScore(nextScore) {
    if (nextScore > high) {
      setHigh(nextScore);
      try { localStorage.setItem("tetris_highscore", String(nextScore)); } catch {}
    }
  }

  function resetGame() {
    const first = randomPiece();
    setBoard(emptyBoard());
    setPiece(first);
    setScore(0);
    setGameOver(false);
    awardedRef.current = -1; // allow award for new first piece via effect
    setTimeout(() => containerRef.current?.focus(), 0);
  }

  // Action helpers so both keyboard and touch can reuse them
  const canMove = (dr, dc) => !collides(boardRef.current, pieceRef.current, dr, dc);
  const moveLeft = () => { if (canMove(0, -1)) setPiece(p => ({ ...p, col: p.col - 1 })); };
  const moveRight = () => { if (canMove(0, 1)) setPiece(p => ({ ...p, col: p.col + 1 })); };
  const softDropStep = () => {
    const b = boardRef.current; const p = pieceRef.current;
    if (!collides(b, p, 1, 0)) setPiece(prev => ({ ...prev, row: prev.row + 1 }));
    else lockAndSpawn(b, p);
  };
  const rotateAction = () => {
    const b = boardRef.current; const p = pieceRef.current;
    if (p.key === "O") return;
    const rotated = rotateMatrixCW(p.matrix);
    const rotatedIcons = rotateIconsCW(p.icons);
    const kicks = [0, 1, -1, 2, -2];
    for (let k of kicks) {
      if (!collides(b, p, 0, k, rotated)) { setPiece(prev => ({ ...prev, matrix: rotated, icons: rotatedIcons, col: prev.col + k })); break; }
    }
  };
  const hardDrop = () => {
    const b = boardRef.current; const p = pieceRef.current;
    let d = 0; while (!collides(b, p, d + 1, 0)) d++;
    const landed = { ...p, row: p.row + d };
    lockAndSpawn(b, landed);
  };

  // Lock current piece and spawn a new one. End game on top-out
  function lockAndSpawn(currBoard, currPiece) {
    const merged = merge(currBoard, currPiece);
    const { board: clearedBoard, cleared } = clearLines(merged);

    if (cleared) {
      setScore((s) => {
        const ns = s + cleared; // 1 point per cleared line
        updateHighScore(ns);
        return ns;
      });
    }

    const next = randomPiece();
    next.row = 0;
    next.col = Math.floor((COLS - next.matrix[0].length) / 2);

    // If the spawn location is blocked, end game and show score
    if (collides(clearedBoard, next)) {
      updateHighScore(score);
      setBoard(clearedBoard);
      setGameOver(true);
      return;
    }

    setBoard(clearedBoard);
    setPiece(next); // lightning award handled by piece-id effect
  }

  // Animation loop - keeps RAF alive even on game over; skips updates while over
  useEffect(() => {
    let rafId;
    const baseInterval = 500; // base fall speed
    let last = 0, acc = 0;

    const loop = (t) => {
      if (!last) last = t;
      const dt = t - last; last = t; acc += dt;

      const interval = softRef.current ? Math.max(50, baseInterval / 10) : baseInterval;

      if (!overRef.current && acc >= interval) {
        acc = 0;
        if (!collides(boardRef.current, pieceRef.current, 1, 0)) {
          setPiece((prev) => ({ ...prev, row: prev.row + 1 }));
        } else {
          lockAndSpawn(boardRef.current, pieceRef.current);
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Keyboard controls
  function handleKey(e) {
    const block = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"];
    if (block.includes(e.key) || e.code === "Space") e.preventDefault();

    if (e.key === "r" || e.key === "R") { resetGame(); return; }
    if (gameOver) return; // ignore other keys while over

    if (e.key === "ArrowLeft") moveLeft();
    if (e.key === "ArrowRight") moveRight();
    if (e.key === "ArrowDown") { softRef.current = true; softDropStep(); }
    if (e.key === "ArrowUp") rotateAction();
    if (e.key === " " || e.code === "Space") hardDrop();
  }

  // Touch gestures on the playfield
  const onTouchStart = (e) => {
    if (gameOver) return;
    const t = e.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onTouchMove = (e) => {
    // prevent scrolling while interacting
    if (!e.cancelable) return;
    e.preventDefault();
  };

  const onTouchEnd = (e) => {
    if (gameOver) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const SWIPE = 24; // threshold in px
    const TAP_WINDOW = 200; // ms for double-tap

    if (adx < SWIPE && ady < SWIPE) {
      // tap or double-tap
      const now = Date.now();
      if (now - lastTap.current < TAP_WINDOW) {
        hardDrop(); // double tap -> hard drop
      } else {
        rotateAction(); // single tap -> rotate
      }
      lastTap.current = now;
      return;
    }

    if (adx > ady) {
      // horizontal swipe
      if (dx > 0) moveRight(); else moveLeft();
    } else {
      // vertical swipe down -> soft drop step
      if (dy > 0) softDropStep();
    }
  };

  // On-screen buttons for mobile users
  const startHoldDown = () => {
    softRef.current = true;
    if (!holdTimer.current) {
      holdTimer.current = setInterval(() => {
        if (!overRef.current) softDropStep();
      }, 70);
    }
  };
  const stopHoldDown = () => {
    softRef.current = false;
    if (holdTimer.current) { clearInterval(holdTimer.current); holdTimer.current = null; }
  };

  const minecraftFont = { fontFamily: "'Press Start 2P', monospace" };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKey}
      onKeyUp={(e) => { if (e.key === 'ArrowDown') softRef.current = false; }}
      style={{ color: "white", padding: 12, outline: "none", ...minecraftFont, touchAction: "none" }}
    >
      {/* Title */}
      <div style={{display:"flex", justifyContent:"center", marginBottom: 10}}>
        <div style={{
          padding: "8px 16px",
          background: "linear-gradient(#5aa862, #3e7e46)",
          border: "4px solid #2b4d2f",
          boxShadow: "0 2px 0 #1f3823, inset 0 2px 0 rgba(255,255,255,0.15)",
          textTransform: "uppercase",
          letterSpacing: 2,
          fontWeight: 900,
          fontSize: 24,
          color: "#e6f2e6",
          textShadow: "2px 2px 0 #1f3823",
          ...minecraftFont
        }}>
          Mihran's Tetris Mania
        </div>
      </div>

      <div style={{display:"flex", gap:16, justifyContent:"center", alignItems:"flex-start", flexWrap: 'wrap'}}>
        {/* Playfield */}
        <div style={{position:"relative"}}>
          <canvas
            ref={canvasRef}
            width={COLS * CELL}
            height={ROWS * CELL}
            style={{borderRadius:12, touchAction: "none"}}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>
        {/* Sidebar */}
        <aside style={{minWidth: 200, display:"grid", gap:12}}>
          <div style={{background:"#1e293b", padding:12, borderRadius:12, border:"1px solid #334155"}}>
            <div style={{opacity:0.8, fontSize:12}}>Score</div>
            <div style={{fontSize:18, fontWeight:700}}>{score}</div>
          </div>
          <div style={{background:"#1e293b", padding:12, borderRadius:12, border:"1px solid #334155"}}>
            <div style={{opacity:0.8, fontSize:12}}>High score</div>
            <div style={{fontSize:18, fontWeight:700}}>{high}</div>
          </div>
          <div style={{background:"#1e293b", padding:12, borderRadius:12, border:"1px solid #334155", fontSize:12, lineHeight:1.5}}>
            <div style={{fontWeight:600, marginBottom:6}}>Controls</div>
            <div>Left/Right: Move</div>
            <div>Down: Soft drop (hold)</div>
            <div>Up: Rotate</div>
            <div>Space: Hard drop</div>
            <div>R: Restart</div>
            <div style={{marginTop:8, opacity:0.85}}>Touch: tap=rotate, double-tap=drop, swipe L/R=move, swipe down=soft drop.</div>
          </div>
        </aside>

        {/* On-screen mobile controls (show on touch devices) */}
        {isTouch && (
          <div style={{width:"100%", display:"flex", justifyContent:"center", marginTop: 12}}>
            <div style={{display:"grid", gridTemplateColumns:"repeat(5, 64px)", gap:8}}>
              <button onClick={(e)=>{e.preventDefault(); moveLeft();}} style={btnStyle}>◀</button>
              <button onClick={(e)=>{e.preventDefault(); rotateAction();}} style={btnStyle}>⟳</button>
              <button onClick={(e)=>{e.preventDefault(); moveRight();}} style={btnStyle}>▶</button>
              <button
                onTouchStart={(e)=>{e.preventDefault(); startHoldDown();}}
                onTouchEnd={(e)=>{e.preventDefault(); stopHoldDown();}}
                onMouseDown={(e)=>{e.preventDefault(); startHoldDown();}}
                onMouseUp={(e)=>{e.preventDefault(); stopHoldDown();}}
                style={btnStyle}
              >▼</button>
              <button onClick={(e)=>{e.preventDefault(); hardDrop();}} style={btnStyle}>⤓</button>
            </div>
          </div>
        )}
      </div>

      {gameOver && (
        <div style={{textAlign:"center", marginTop:12, fontWeight:600}}>Game over. Final score: {score}. Press R or tap title to restart.</div>
      )}
    </div>
  );
}

const btnStyle = {
  fontFamily: "'Press Start 2P', monospace",
  minHeight: 56,
  borderRadius: 12,
  border: "2px solid #334155",
  background: "#1e293b",
  color: "#e5e7eb",
  fontSize: 18,
};

function drawMatrix(ctx, matrix, icons, col, row, opts = {}) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[0].length; c++) {
      if (!matrix[r][c]) continue;
      const icon = icons?.[r]?.[c] || NON_LIGHTNING_ICONS[(Math.random() * NON_LIGHTNING_ICONS.length) | 0];
      drawCell(ctx, c + col, r + row, opts.color, icon);
    }
  }
}

function drawCell(ctx, c, r, color, icon, size = CELL) {
  const x = c * size, y = r * size;
  // block base
  ctx.fillStyle = color || "#fff";
  ctx.fillRect(x, y, size, size);
  // bevel
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x, y, size, 3);
  ctx.fillRect(x, y, 3, size);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y + size - 3, size, 3);
  ctx.fillRect(x + size - 3, y, 3, size);
  // icon at 50 percent previous size
  if (icon) {
    ctx.save();
    ctx.fillStyle = "#101010";
    ctx.globalAlpha = 0.18; // subtle shadow
    ctx.font = `${Math.floor(size * 0.45)}px 'Press Start 2P', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, x + size / 2 + 1, y + size / 2 + 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.fillText(icon, x + size / 2, y + size / 2);
    ctx.restore();
  }
}

// Console tests
(function runTests() {
  try {
    const m = [[1,0,0],[1,1,1]];
    const r = rotateMatrixCW(m);
    console.assert(r.length === 3 && r[0].length === 2, "rotateMatrixCW dims");

    const i = [["a",null,null],["b","c","d"]];
    const ri = rotateIconsCW(i);
    console.assert(ri.length === 3 && ri[0].length === 2 && ri[0][1] === "a" && ri[2][0] === "d", "rotateIconsCW mapping");

    const b = emptyBoard();
    b[19] = Array(COLS).fill({ color: "#111", icon: "★" });
    const { board: b2, cleared } = clearLines(b);
    console.assert(cleared === 1, "clearLines count");
    console.assert(b2[19].every((x) => x === null), "clearLines compaction");

    const pBottom = { row: ROWS-1, col: 3, matrix: [[1]], key: "X", color: "#fff", icons: [[LIGHTNING]] };
    console.assert(collides(emptyBoard(), pBottom, 1, 0) === true, "collides bottom edge");
    const pLeftWall = { row: 0, col: 0, matrix: [[1]], key: "X", color: "#fff", icons: [["★"]] };
    console.assert(collides(emptyBoard(), pLeftWall, 0, -1) === true, "collides left wall");

    const b3 = emptyBoard();
    const p2 = { row: 18, col: 0, matrix: [[1,1]], key: "X", color: "#abc", icons: [["◇","◆"]] };
    const mrg = merge(b3, p2);
    console.assert(mrg[18][0]?.color === "#abc" && mrg[18][1]?.icon === "◆", "merge writes objects");

    console.assert(hasLightningInIcons([[null, LIGHTNING]]) === true, "hasLightning true");
    console.assert(hasLightningInIcons([[null, null]]) === false, "hasLightning false");

    let hits = 0; const N = 2000;
    for (let k = 0; k < N; k++) if (randIcon() === LIGHTNING) hits++;
    console.assert(hits > N * 0.005 && hits < N * 0.10, "lightning rarity within bounds");

    console.log("Tetris tests passed");
  } catch (e) {
    console.warn("Tetris tests error", e);
  }
})();
```
