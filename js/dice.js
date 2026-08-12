/* Monopolyish — Rolling and the dice face rendering. */

// === dice.js ===
// ============================================================
//  DICE SYSTEM
// ============================================================

let diceAnimating = false;

function rollDice() {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return { d1, d2, total: d1 + d2, doubles: d1 === d2 };
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

async function animateDice(d1El, d2El, result) {
  if (diceAnimating) return;
  diceAnimating = true;

  const duration = 800;
  const interval = 80;
  const steps = duration / interval;

  let step = 0;
  return new Promise(resolve => {
    const timer = setInterval(() => {
      renderDiceFace(d1El, Math.floor(Math.random() * 6) + 1);
      renderDiceFace(d2El, Math.floor(Math.random() * 6) + 1);
      step++;
      if (step >= steps) {
        clearInterval(timer);
        renderDiceFace(d1El, result.d1);
        renderDiceFace(d2El, result.d2);
        diceAnimating = false;
        resolve();
      }
    }, interval);
  });
}
