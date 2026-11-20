// =========================================================
// Liam Seigelstrand (adapted from Austin Franklin) :: main.js
//
// PixiJS canvas behind the page that draws a grid of dots.
// Moving the mouse pushes them away, and clicking sends a ripple.
// =========================================================


// ---------- Setup ----------
// Start PixiJS and make the canvas fill the whole window with a clear background
const app = new PIXI.Application();
await app.init({
  resizeTo: window,
  backgroundAlpha: 0,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
// Put the canvas inside the #stage div in index.html
document.getElementById("stage").appendChild(app.canvas);

// Create a layer to draw all the dots on
const fieldLayer = new PIXI.Graphics();
app.stage.addChild(fieldLayer);


// ---------- Colours ----------
// Grab the colors from style.css so the canvas matches the website theme
const colours = {};

function readColours() {
  const css = getComputedStyle(document.documentElement);
  for (const name of ["ink", "muted", "accent", "tile"]) {
    colours[name] = new PIXI.Color(css.getPropertyValue(`--${name}`).trim()).toNumber();
  }
}
readColours();


// ---------- Input ----------
// Keep track of the mouse position (starts off-screen so nothing moves at first)
const pointer = { x: -9999, y: -9999 };
// List to store active click ripples
const ripples = [];

// Update mouse position whenever it moves
window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
});

// Add a new ripple at the spot where the user clicked
window.addEventListener("pointerdown", (e) => {
  ripples.push({ x: e.clientX, y: e.clientY, born: performance.now() });
});


// ---------- Particle field ----------
const SPACING = 28;           // space between each dot
const PUSH_RADIUS = 180;      // how close the mouse needs to be to push dots
const RIPPLE_SPEED = 600;     // how fast the click ripple expands
const RIPPLE_LIFE = 1800;     // how long a ripple lasts (in ms)

let dots = [];

// Fill the screen with a grid of dots and save each dot's starting spot (homeX, homeY)
function buildField() {
  dots = [];
  for (let x = SPACING / 2; x < window.innerWidth; x += SPACING) {
    for (let y = SPACING / 2; y < window.innerHeight; y += SPACING) {
      dots.push({ homeX: x, homeY: y, x, y, vx: 0, vy: 0 });
    }
  }
}

// Push a dot away from a point (like the mouse or a ripple) if it's close enough
function pushAway(dot, fromX, fromY, radius, strength) {
  const dx = dot.x - fromX;
  const dy = dot.y - fromY;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance < radius) {
    // Closer dots get pushed harder
    const force = (1 - distance / radius) * strength;
    dot.vx += (dx / distance) * force;
    dot.vy += (dy / distance) * force;
  }
}

// Update the movement of every dot
function updateField(now) {
  // Delete ripples that are too old
  while (ripples.length && now - ripples[0].born > RIPPLE_LIFE) ripples.shift();

  for (const dot of dots) {
    // Push dots away from the mouse
    pushAway(dot, pointer.x, pointer.y, PUSH_RADIUS, 1.5);

    // Push dots when a click ripple passes over them
    for (const ripple of ripples) {
      const age = now - ripple.born;
      const ringRadius = (age / 1000) * RIPPLE_SPEED;
      const fromRing = Math.abs(Math.hypot(dot.x - ripple.x, dot.y - ripple.y) - ringRadius);
      if (fromRing < 24) {
        pushAway(dot, ripple.x, ripple.y, ringRadius + 24, 3.5 * (1 - age / RIPPLE_LIFE));
      }
    }

    // Pull the dot back to its home spot and slow it down over time
    dot.vx = (dot.vx + (dot.homeX - dot.x) * 0.05) * 0.84;
    dot.vy = (dot.vy + (dot.homeY - dot.y) * 0.05) * 0.84;
    dot.x += dot.vx;
    dot.y += dot.vy;
  }
}

// Clear the canvas and redraw all the dots
function drawField() {
  fieldLayer.clear();

  // Separate still dots from moving dots so they can have different styles
  const moving = [];
  for (const dot of dots) {
    const offset = Math.abs(dot.x - dot.homeX) + Math.abs(dot.y - dot.homeY);
    if (offset > 2.5) moving.push(dot);
    else fieldLayer.circle(dot.x, dot.y, 1.2);
  }
  fieldLayer.fill({ color: colours.muted, alpha: 0.35 });

  // Draw a soft glow behind moving dots
  for (const dot of moving) fieldLayer.circle(dot.x, dot.y, 5.5);
  fieldLayer.fill({ color: colours.accent, alpha: 0.16 });

  // Draw the bright center of moving dots
  for (const dot of moving) fieldLayer.circle(dot.x, dot.y, 2);
  fieldLayer.fill(colours.accent);
}

// Build the grid on load, and rebuild it if the window size changes
buildField();
window.addEventListener("resize", buildField);


// ---------- Frame loop ----------
// Runs every frame to animate the dots
app.ticker.add(() => {
  updateField(performance.now());
  drawField();
});