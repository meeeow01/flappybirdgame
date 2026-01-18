// Flappy Canvas - improved textured grass (plus previous features)
// Beginner-friendly and well commented.
// To run: open index.html in a browser.

// -------------------------------
// Canvas setup and global state
// -------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const OVERLAY = document.getElementById('overlay');
const OVERLAY_TITLE = document.getElementById('overlay-title');
const OVERLAY_SUB = document.getElementById('overlay-sub');
const RESTART_BTN = document.getElementById('restart-btn');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Game constants
const GRAVITY = 1100;       // px/s^2
const JUMP_SPEED = -350;    // initial jump velocity px/s
const BIRD_RADIUS = 18;     // bird radius in pixels
const GROUND_HEIGHT = 90;
const PIPE_WIDTH = 78;
const PIPE_GAP_MIN = 140;
const PIPE_GAP_MAX = 190;
const PIPE_INTERVAL = 1500; // ms between pipes
const PIPE_SPEED = 200;     // px/s
const PIPE_CAP = 18;        // pipe rounded cap height

// Cloud constants
const CLOUD_COUNT = 6;
const CLOUD_MIN_SPEED = 15;
const CLOUD_MAX_SPEED = 45;
const CLOUD_MIN_SCALE = 0.6;
const CLOUD_MAX_SCALE = 1.3;

// Grass constants
const GRASS_BLADE_COUNT = 80;       // animated blades
const GRASS_TEXTURE_WIDTH = 280;    // width of offscreen texture tile
const GRASS_TEXTURE_HEIGHT = 140;   // height of offscreen texture tile
const GRASS_TOP_OVERLAP = 18;       // how much grass overlaps above the ground

// Game state
let lastTime = 0;
let running = false;
let started = false;
let gameOver = false;
let time = 0; // global time for animations

let bird = {
  x: WIDTH * 0.28,
  y: HEIGHT * 0.45,
  vy: 0,
  radius: BIRD_RADIUS
};

let pipes = []; // pipe pairs
let timeSinceLastPipe = 0;
let score = 0;
let best = parseInt(localStorage.getItem('flappyBest')) || 0;

// Clouds array
let clouds = [];
// Grass positions for animated blades
let grassPositions = [];

// Offscreen grass texture
let grassPattern = null;
let grassTextureCanvas = null;

// -------------------------------
// Utility functions
// -------------------------------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Circle-rectangle collision: returns true if circle intersects rect
function circleRectCollision(circle, rect) {
  const cx = circle.x;
  const cy = circle.y;
  const closestX = clamp(cx, rect.left, rect.right);
  const closestY = clamp(cy, rect.top, rect.bottom);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) <= (circle.radius * circle.radius);
}

// -------------------------------
// Pipe factory (returns object representing top & bottom pipe)
// -------------------------------
function createPipePair() {
  const gap = Math.random() * (PIPE_GAP_MAX - PIPE_GAP_MIN) + PIPE_GAP_MIN;
  const margin = 40;
  const maxTop = HEIGHT - GROUND_HEIGHT - gap - margin;
  const gapTop = Math.random() * (Math.max(maxTop, margin) - margin) + margin;
  const pipeX = WIDTH + 20;
  return {
    x: pipeX,
    width: PIPE_WIDTH,
    gapTop,
    gapBottom: gapTop + gap,
    passed: false
  };
}

// -------------------------------
// Clouds creation and drawing
// -------------------------------
function createClouds() {
  clouds = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const scale = Math.random() * (CLOUD_MAX_SCALE - CLOUD_MIN_SCALE) + CLOUD_MIN_SCALE;
    clouds.push({
      x: Math.random() * WIDTH,
      y: Math.random() * (HEIGHT * 0.45),
      speed: Math.random() * (CLOUD_MAX_SPEED - CLOUD_MIN_SPEED) + CLOUD_MIN_SPEED,
      scale,
      alpha: Math.random() * 0.6 + 0.3
    });
  }
}

// Draw a simple cloud made of overlapping ellipses
function drawCloud(cloud) {
  ctx.save();
  ctx.translate(cloud.x, cloud.y);
  ctx.scale(cloud.scale, cloud.scale);
  ctx.globalAlpha = cloud.alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 22, 0, 0, Math.PI * 2);
  ctx.ellipse(-28, 6, 26, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(30, 6, 26, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// -------------------------------
// Textured grass generation (offscreen) and animated blades
// -------------------------------

// Create an offscreen canvas that contains a tiled grass texture.
// This is drawn once and used as a repeating pattern to add "texture"
// behind the animated blades. The texture includes many small blades,
// highlights and tiny flowers for visual richness.
function createGrassTexture() {
  grassTextureCanvas = document.createElement('canvas');
  grassTextureCanvas.width = GRASS_TEXTURE_WIDTH;
  grassTextureCanvas.height = GRASS_TEXTURE_HEIGHT;
  const gctx = grassTextureCanvas.getContext('2d');

  // Clear
  gctx.clearRect(0, 0, GRASS_TEXTURE_WIDTH, GRASS_TEXTURE_HEIGHT);

  // Background: a subtle darker base strip so blades read better
  const baseGrad = gctx.createLinearGradient(0, 0, 0, GRASS_TEXTURE_HEIGHT);
  baseGrad.addColorStop(0, '#1f8e3a');
  baseGrad.addColorStop(1, '#1a7a33');
  gctx.fillStyle = baseGrad;
  gctx.fillRect(0, 0, GRASS_TEXTURE_WIDTH, GRASS_TEXTURE_HEIGHT);

  // Draw many small blades with random heights and colors
  const bladeCount = 220; // many small blades create texture
  for (let i = 0; i < bladeCount; i++) {
    const px = Math.random() * GRASS_TEXTURE_WIDTH;
    const bladeHeight = 6 + Math.random() * 40;
    const sway = (Math.random() - 0.5) * 10;
    const hue = 100 + Math.random() * 35; // green hues
    const light = 40 + Math.random() * 30;
    gctx.beginPath();
    gctx.moveTo(px, GRASS_TEXTURE_HEIGHT);
    // quadratic control point makes blade curved
    gctx.quadraticCurveTo(px + sway * 0.6, GRASS_TEXTURE_HEIGHT - bladeHeight / 2, px + sway, GRASS_TEXTURE_HEIGHT - bladeHeight);
    gctx.strokeStyle = `hsl(${hue}, 60%, ${light}%)`;
    gctx.lineWidth = 1.4;
    gctx.stroke();

    // small darker base to add depth
    gctx.beginPath();
    gctx.moveTo(px - 1, GRASS_TEXTURE_HEIGHT);
    gctx.lineTo(px + 1, GRASS_TEXTURE_HEIGHT);
    gctx.strokeStyle = `rgba(0,0,0,0.06)`;
    gctx.lineWidth = 2;
    gctx.stroke();
  }

  // Add highlights: a few lighter strokes to simulate sun catching blades
  for (let i = 0; i < 24; i++) {
    const px = Math.random() * GRASS_TEXTURE_WIDTH;
    const bladeHeight = 12 + Math.random() * 24;
    gctx.beginPath();
    gctx.moveTo(px, GRASS_TEXTURE_HEIGHT);
    gctx.quadraticCurveTo(px + 3, GRASS_TEXTURE_HEIGHT - bladeHeight * 0.5, px + 6, GRASS_TEXTURE_HEIGHT - bladeHeight);
    gctx.strokeStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.06})`;
    gctx.lineWidth = 1;
    gctx.stroke();
  }

  // Tiny flowers (colored dots) sprinkled occasionally
  for (let i = 0; i < 16; i++) {
    const px = Math.random() * GRASS_TEXTURE_WIDTH;
    const py = GRASS_TEXTURE_HEIGHT - (4 + Math.random() * 36);
    gctx.beginPath();
    const r = 1 + Math.random() * 2;
    gctx.fillStyle = (Math.random() > 0.75) ? '#ffd3ea' : '#fff1a8';
    gctx.arc(px, py, r, 0, Math.PI * 2);
    gctx.fill();
  }

  // Soft vignette at the top so the pattern blends into the sky
  const vignette = gctx.createLinearGradient(0, 0, 0, GRASS_TEXTURE_HEIGHT);
  vignette.addColorStop(0, 'rgba(0,0,0,0.06)');
  vignette.addColorStop(0.6, 'rgba(0,0,0,0.02)');
  vignette.addColorStop(1, 'rgba(0,0,0,0)');
  gctx.fillStyle = vignette;
  gctx.fillRect(0, 0, GRASS_TEXTURE_WIDTH, GRASS_TEXTURE_HEIGHT);

  // Create pattern for use on main canvas
  grassPattern = ctx.createPattern(grassTextureCanvas, 'repeat-x');
}

// Create animated blade base positions (these are drawn every frame with sway)
function createGrassPositions() {
  grassPositions = [];
  for (let i = 0; i < GRASS_BLADE_COUNT; i++) {
    const x = (i / GRASS_BLADE_COUNT) * (WIDTH + 40) + (Math.random() * (WIDTH / GRASS_BLADE_COUNT));
    const height = 12 + Math.random() * 36;
    const sway = Math.random() * 0.9 + 0.18; // sway factor
    const colorShift = Math.random() * 18 - 8; // small hue variation
    grassPositions.push({ x, height, sway, colorShift });
  }
}

// Draw textured grass: first the repeating texture, then animate blades in front
function drawGrass(dt) {
  const grassTopY = HEIGHT - GROUND_HEIGHT - GRASS_TOP_OVERLAP; // where grass begins above ground
  const grassHeight = GRASS_TEXTURE_HEIGHT * 0.66; // how tall the texture area we show

  ctx.save();

  // Draw the texture tiled across width for a rich base
  if (grassPattern) {
    ctx.fillStyle = grassPattern;
    // Slight vertical offset so the texture "sits" nicely into the ground
    ctx.translate(0, grassTopY - (grassHeight * 0.35));
    ctx.fillRect(0, 0, WIDTH, grassHeight);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
  }

  // Foreground animated blades (swaying, layered for depth)
  // We'll draw two layers: back subtle blades and front pronounced blades.
  // Back layer: thin, slightly darker, less sway
  ctx.globalCompositeOperation = 'source-over';

  // BACK LAYER
  for (let i = 0; i < grassPositions.length; i++) {
    const g = grassPositions[i];
    const swayX = Math.sin(time * 1.8 * g.sway + i * 0.7) * (1.6 + g.sway * 1.2);
    const baseX = (g.x + swayX) % (WIDTH + 80);
    const bladeHeight = g.height * 0.6;

    // blade path
    ctx.beginPath();
    ctx.moveTo(baseX, HEIGHT - GROUND_HEIGHT + 6);
    ctx.quadraticCurveTo(baseX - 2, HEIGHT - GROUND_HEIGHT - bladeHeight / 2, baseX, HEIGHT - GROUND_HEIGHT - bladeHeight);
    ctx.strokeStyle = `rgba(14,${100 + g.colorShift},30,0.55)`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // FRONT LAYER (brighter, more sway)
  for (let i = 0; i < grassPositions.length; i += 2) {
    const g = grassPositions[i];
    const swayX = Math.sin(time * 2.6 * g.sway + i * 0.5) * (2.4 + g.sway * 2.0);
    const baseX = (g.x + swayX) % (WIDTH + 80);
    const bladeHeight = g.height;

    // blade path
    ctx.beginPath();
    ctx.moveTo(baseX, HEIGHT - GROUND_HEIGHT + 6);
    ctx.quadraticCurveTo(baseX - 4, HEIGHT - GROUND_HEIGHT - bladeHeight / 2, baseX + 2, HEIGHT - GROUND_HEIGHT - bladeHeight);
    // color varies slightly for natural look
    ctx.strokeStyle = `rgba(28,${120 + g.colorShift},40,0.95)`;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // small leaf highlight
    ctx.beginPath();
    ctx.moveTo(baseX - 1, HEIGHT - GROUND_HEIGHT - bladeHeight / 2.6);
    ctx.quadraticCurveTo(baseX - 12, HEIGHT - GROUND_HEIGHT - bladeHeight / 1.9, baseX - 2, HEIGHT - GROUND_HEIGHT - bladeHeight / 1.4);
    ctx.strokeStyle = `rgba(255,255,255,0.06)`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  // Tiny foreground flowers / dots for detail
  for (let i = 0; i < 10; i++) {
    const idx = (i * 7) % grassPositions.length;
    const g = grassPositions[idx];
    const swayX = Math.sin(time * 1.9 * g.sway + idx) * (1.8 + g.sway);
    const fx = (g.x + swayX) % (WIDTH + 80);
    const fy = HEIGHT - GROUND_HEIGHT - (g.height * 0.7) + Math.sin(time * 2 + i) * 2;
    ctx.beginPath();
    ctx.fillStyle = (i % 3 === 0) ? '#ffd3ea' : '#fff1a8';
    ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// -------------------------------
// Input handlers (jump)
// -------------------------------
function flap() {
  if (gameOver) return;
  if (!started) {
    started = true;
    showOverlay(false);
  }
  bird.vy = JUMP_SPEED;
}

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  flap();
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  flap();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    flap();
  }
});

RESTART_BTN.addEventListener('click', restartGame);
OVERLAY.addEventListener('mousedown', (e) => {
  if (!started || gameOver) {
    restartGame();
  }
});

// -------------------------------
// Game control: start / restart
// -------------------------------
function startGameLoop() {
  if (!running) {
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
}

function restartGame() {
  // Reset state
  bird.x = WIDTH * 0.28;
  bird.y = HEIGHT * 0.45;
  bird.vy = 0;
  pipes = [];
  timeSinceLastPipe = 0;
  score = 0;
  started = false;
  gameOver = false;

  OVERLAY_TITLE.textContent = 'Flappy Canvas';
  OVERLAY_SUB.textContent = 'Click / Tap or press Space to start';
  showOverlay(true);

  createClouds();
  createGrassPositions();
  createGrassTexture();
  startGameLoop();
}

// -------------------------------
// Rendering helpers (bird, pipes, HUD etc.)
// -------------------------------
function drawBackground() {
  // sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, '#87CEEB');
  grad.addColorStop(1, '#bfe9ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // draw clouds (behind everything)
  clouds.forEach(drawCloud);
}

function drawGround() {
  ctx.fillStyle = '#E7C07A';
  ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, GROUND_HEIGHT);
  // simple stripe
  ctx.fillStyle = '#d6a85a';
  ctx.fillRect(0, HEIGHT - GROUND_HEIGHT, WIDTH, 6);
}

// Improved bird drawing with wing, tail and subtle gradient
function drawBird() {
  ctx.save();
  const { x, y, radius } = bird;

  // tilt based on vertical velocity
  const tilt = clamp(bird.vy / 600, -0.6, 0.6);
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // body gradient
  const bodyGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
  bodyGrad.addColorStop(0, '#ffd84a');
  bodyGrad.addColorStop(1, '#ffce2f');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // tail (left side)
  ctx.save();
  ctx.fillStyle = '#f2b43a';
  ctx.beginPath();
  ctx.moveTo(-radius - 4, 4);
  ctx.lineTo(-radius - 14, 0);
  ctx.lineTo(-radius - 4, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // wing - animate flap with global time
  const wingSpeed = 10 + Math.max(0, -bird.vy / 60); // flap faster when ascending
  const wingFlap = Math.sin(time * wingSpeed) * 0.7; // -0.7..0.7
  ctx.save();
  ctx.rotate(wingFlap);
  ctx.fillStyle = '#ffd96f';
  ctx.beginPath();
  ctx.ellipse(-2, 4, radius * 0.6, radius * 0.35, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // eye
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(radius * 0.34, -radius * 0.22, radius * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = '#ff9500';
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(radius + 10, -6);
  ctx.lineTo(radius + 10, 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Draw pipe with rounded cap and subtle shading
function drawPipe(pipe) {
  const x = pipe.x;
  const w = pipe.width;
  const topH = pipe.gapTop;
  const bottomY = pipe.gapBottom;
  const bottomH = HEIGHT - GROUND_HEIGHT - bottomY;

  // gradient for pipe body
  const gTop = ctx.createLinearGradient(x, 0, x + w, 0);
  gTop.addColorStop(0, '#2da34a');
  gTop.addColorStop(1, '#1e8b3a');

  ctx.fillStyle = gTop;
  ctx.strokeStyle = '#196619';
  ctx.lineWidth = 3;

  // top rectangle
  ctx.fillRect(x, 0, w, topH - PIPE_CAP);
  ctx.strokeRect(x, 0, w, topH - PIPE_CAP);

  // top cap (rounded)
  ctx.beginPath();
  ctx.moveTo(x, topH - PIPE_CAP / 2);
  ctx.arc(x + w / 2, topH - PIPE_CAP / 2, w / 2 + 2, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // bottom rectangle
  const gBottom = ctx.createLinearGradient(x, 0, x + w, 0);
  gBottom.addColorStop(0, '#2aa044');
  gBottom.addColorStop(1, '#178533');

  ctx.fillStyle = gBottom;
  ctx.fillRect(x, bottomY + PIPE_CAP, w, bottomH - PIPE_CAP);
  ctx.strokeRect(x, bottomY + PIPE_CAP, w, bottomH - PIPE_CAP);

  // bottom cap (rounded at top)
  ctx.beginPath();
  ctx.moveTo(x, bottomY + PIPE_CAP / 2);
  ctx.arc(x + w / 2, bottomY + PIPE_CAP / 2, w / 2 + 2, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawPipes() {
  pipes.forEach(pipe => drawPipe(pipe));
}

function drawHUD() {
  // Score centered (large)
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = '36px system-ui, Arial';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.fillText(String(score), WIDTH / 2, 60);
  ctx.restore();

  // Best score small left
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '14px system-ui, Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Best: ${best}`, 12, 28);
  ctx.restore();
}

function drawAll(dt) {
  drawBackground();
  drawPipes();
  drawGround();
  // grass drawn above ground to appear in front
  drawGrass(dt);
  drawBird();
  drawHUD();

  if (!started && !gameOver) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '18px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Click / Tap or press Space to flap', WIDTH / 2, HEIGHT * 0.6);
    ctx.restore();
  }
}

// -------------------------------
// Game update (physics, collisions)
// -------------------------------
function update(dt) {
  time += dt; // update global time

  // update clouds (slow parallax movement)
  clouds.forEach(c => {
    c.x -= c.speed * dt * 0.35;
    if (c.x < -120 * c.scale) {
      c.x = WIDTH + 60;
      c.y = Math.random() * (HEIGHT * 0.45);
      c.scale = Math.random() * (CLOUD_MAX_SCALE - CLOUD_MIN_SCALE) + CLOUD_MIN_SCALE;
      c.speed = Math.random() * (CLOUD_MAX_SPEED - CLOUD_MIN_SPEED) + CLOUD_MIN_SPEED;
      c.alpha = Math.random() * 0.6 + 0.3;
    }
  });

  if (!started || gameOver) {
    // If not started, we don't apply full physics; return early but still animate clouds
    return;
  }

  // Bird physics
  bird.vy += GRAVITY * dt;
  bird.y += bird.vy * dt;

  // Move pipes and handle removal/score
  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    p.x -= PIPE_SPEED * dt;

    // Remove off-screen pipes
    if (p.x + p.width < -40) {
      pipes.splice(i, 1);
      continue;
    }

    // Score check
    if (!p.passed && (p.x + p.width) < bird.x) {
      p.passed = true;
      score += 1;
    }
  }

  // Generate pipes
  timeSinceLastPipe += dt * 1000;
  if (timeSinceLastPipe >= PIPE_INTERVAL) {
    pipes.push(createPipePair());
    timeSinceLastPipe = 0;
  }

  // Collisions
  // Ground collision
  if (bird.y + bird.radius > HEIGHT - GROUND_HEIGHT) {
    bird.y = HEIGHT - GROUND_HEIGHT - bird.radius;
    endGame();
    return;
  }

  // Ceiling clamp
  if (bird.y - bird.radius < 0) {
    bird.y = bird.radius;
    bird.vy = 0;
  }

  // Pipe collisions (circle-rect)
  const circle = { x: bird.x, y: bird.y, radius: bird.radius };
  for (const p of pipes) {
    const topRect = {
      left: p.x,
      right: p.x + p.width,
      top: 0,
      bottom: p.gapTop
    };
    const bottomRect = {
      left: p.x,
      right: p.x + p.width,
      top: p.gapBottom,
      bottom: HEIGHT - GROUND_HEIGHT
    };

    if (circleRectCollision(circle, topRect) || circleRectCollision(circle, bottomRect)) {
      endGame();
      break;
    }
  }
}

// -------------------------------
// Game over handling
// -------------------------------
function endGame() {
  gameOver = true;
  started = false;

  // Update best score
  if (score > best) {
    best = score;
    try {
      localStorage.setItem('flappyBest', String(best));
    } catch (e) {
      // ignore storage errors
    }
  }

  OVERLAY_TITLE.textContent = 'Game Over';
  OVERLAY_SUB.textContent = `Score: ${score} • Best: ${best} • Created and developed by Lord Meow`;
  showOverlay(true);
}

// Show or hide overlay
function showOverlay(show) {
  if (show) {
    OVERLAY.classList.remove('hidden');
    OVERLAY.setAttribute('aria-hidden', 'false');
  } else {
    OVERLAY.classList.add('hidden');
    OVERLAY.setAttribute('aria-hidden', 'true');
  }
}

// -------------------------------
// Main loop
// -------------------------------
function loop(now) {
  if (!running) return;
  const deltaTime = (now - lastTime) / 1000;
  const dt = Math.min(0.05, deltaTime);

  update(dt);

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawAll(dt);

  lastTime = now;
  requestAnimationFrame(loop);
}

// -------------------------------
// Boot the game
// -------------------------------
(function init() {
  // initial overlay
  OVERLAY_TITLE.textContent = 'Flappy Canvas';
  OVERLAY_SUB.textContent = 'Click / Tap or press Space to start';
  showOverlay(true);

  createClouds();
  createGrassPositions();
  createGrassTexture(); // prepare textured pattern
  startGameLoop();
})();