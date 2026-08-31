/* Monopolyish — Rolling and the dice face rendering. */

// === dice.js ===
// ============================================================
//  DICE SYSTEM
// ============================================================

let diceAnimating = false;

/* The speed die's six faces: three numbers, two Mr. Monopolys and a bus. Only
   the two white dice decide doubles — the speed die never sends anyone to jail
   for rolling the same number three times, but matching all three is its own
   thing, handled by the caller. */
const SPEED_FACES = [
  { kind: 'number', value: 1, label: '1' },
  { kind: 'number', value: 2, label: '2' },
  { kind: 'number', value: 3, label: '3' },
  { kind: 'monopoly', value: 0, label: '🎩' },
  { kind: 'monopoly', value: 0, label: '🎩' },
  { kind: 'bus', value: 0, label: '🚌' },
];

function rollDice(useSpeedDie) {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const result = { d1, d2, total: d1 + d2, doubles: d1 === d2 };

  if (useSpeedDie) {
    const face = SPEED_FACES[Math.floor(Math.random() * SPEED_FACES.length)];
    result.speed = face;
    result.total += face.value;
    // Three of a kind — the white dice and a numbered speed die all matching —
    // is the variant's "go wherever you like".
    result.triples = face.kind === 'number' && d1 === d2 && d2 === face.value;
  }
  return result;
}

const FACES = {
  1: [[1,1]],
  2: [[0,0],[2,2]],
  3: [[0,0],[1,1],[2,2]],
  4: [[0,0],[0,2],[2,0],[2,2]],
  5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
  6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]],
};

function renderDiceFace(canvas, value) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);

  // Die face background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#f8f8f8');
  grad.addColorStop(1, '#ddd');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(2, 2, size - 4, size - 4, 12);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots
  const dotR = size * 0.1;
  const padding = size * 0.18;
  const step = (size - padding * 2) / 2;

  ctx.fillStyle = '#1a1a2e';
  (FACES[value] || []).forEach(([row, col]) => {
    const x = padding + col * step;
    const y = padding + row * step;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* The speed die is drawn as a label rather than pips, because two of its six
   faces are not numbers at all. */
function renderSpeedFace(el, face) {
  if (!el) return;
  el.textContent = face ? face.label : '';
  el.classList.toggle('speed-symbol', !!face && face.kind !== 'number');
}

async function animateDice(d1El, d2El, result, speedEl) {
  if (diceAnimating) return;
  diceAnimating = true;

  const reduced = typeof matchMedia === 'function' &&
                  matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 120 : 800;
  const interval = 80;
  const steps = Math.max(1, Math.round(duration / interval));

  let step = 0;
  return new Promise(resolve => {
    const timer = setInterval(() => {
      renderDiceFace(d1El, Math.floor(Math.random() * 6) + 1);
      renderDiceFace(d2El, Math.floor(Math.random() * 6) + 1);
      if (speedEl && result.speed) {
        renderSpeedFace(speedEl, SPEED_FACES[Math.floor(Math.random() * SPEED_FACES.length)]);
      }
      step++;
      if (step >= steps) {
        clearInterval(timer);
        renderDiceFace(d1El, result.d1);
        renderDiceFace(d2El, result.d2);
        if (speedEl) renderSpeedFace(speedEl, result.speed || null);
        diceAnimating = false;
        resolve();
      }
    }, interval);
  });
}
