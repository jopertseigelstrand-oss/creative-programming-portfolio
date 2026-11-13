// =========================================================
// Liam Seigelstrand (adapted from Austin Franklins) :: main.js
//
// One PixiJS canvas sits behind the page and draws two things:
//   1. A grid of interactive dots that react to pointer movement and clicks
//   2. Generative geometric animations inside each project tile
//
// Structure:
//   setup -> colours -> input -> dot field -> motifs -> frame loop
// =========================================================


// ---------- Setup ----------
// Create and asynchronously initialize the PixiJS application
const app = new PIXI.Application();
await app.init({
  resizeTo: window,
  backgroundAlpha: 0,           // transparent, the page colour shows through
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
// Attach the generated <canvas> element inside the #stage container
document.getElementById("stage").appendChild(app.canvas);

// Create two separate Graphics layers: fieldLayer draws first (bottom), artLayer draws second (top)
const fieldLayer = new PIXI.Graphics();
const artLayer = new PIXI.Graphics();
app.stage.addChild(fieldLayer, artLayer);
// Detect if the user has enabled "Reduce Motion" in their OS accessibility settings
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;


// ---------- Colours ----------
// Reads CSS custom properties from :root so the PixiJS canvas automatically syncs with light/dark mode.

const colours = {};

function readColours() {
  const css = getComputedStyle(document.documentElement);
  // Convert CSS hex strings (e.g., "#2b44d6") into numeric hex values (0x2b44d6) for PixiJS
  for (const name of ["ink", "muted", "accent", "tile"]) {
    colours[name] = new PIXI.Color(css.getPropertyValue(`--${name}`).trim()).toNumber();
  }
}
// Read initial colors on load, and re-read whenever the OS theme switches between light and dark
readColours();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColours);


// ---------- Input ----------
// Store pointer coordinates off-screen initially so dots aren't pushed before the user moves the mouse
const pointer = { x: -9999, y: -9999 };
// Array storing active click ripples: each object holds { x, y, born (timestamp) }
const ripples = [];   // every click adds one: { x, y, born }
// Update pointer position on mouse/touch move
window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
});
// Spawn a new expanding ripple ring whenever the user clicks or taps
window.addEventListener("pointerdown", (e) => {
  ripples.push({ x: e.clientX, y: e.clientY, born: performance.now() });
});

// Map every tile DOM element to a state object tracking its bounding element, motif name, and hover easing
const tiles = [...document.querySelectorAll(".tile")].map((el) => {
  const tile = {
    box: el.querySelector(".art"),
    motif: el.querySelector(".art").dataset.motif,
    hover: 0,
    target: 0,
  };
  el.addEventListener("pointerenter", () => { tile.target = 1; });
  el.addEventListener("pointerleave", () => { tile.target = 0; });
  return tile;
});


// ---------- Dot field ----------
// Physics grid: each dot has an anchor (homeX, homeY) and current position/velocity (x, y, vx, vy).

const SPACING = 28;
const PUSH_RADIUS = 150;
const RIPPLE_SPEED = 500;     // pixels per second
const RIPPLE_LIFE = 2000;     // milliseconds

let dots = [];
// Populates the screen with a uniform grid of dot objects
function buildField() {
  dots = [];
  for (let x = SPACING / 2; x < window.innerWidth; x += SPACING) {
    for (let y = SPACING / 2; y < window.innerHeight; y += SPACING) {
      dots.push({ homeX: x, homeY: y, x, y, vx: 0, vy: 0 });
    }
  }
}

// Applies a radial repulsive force to a dot if it lies within `radius` of (fromX, fromY)function pushAway(dot, fromX, fromY, radius, strength) 
{
  const dx = dot.x - fromX;
  const dy = dot.y - fromY;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance < radius) {
    // Force falls off linearly from `strength` at center to 0 at edge of radius
    const force = (1 - distance / radius) * strength;
    dot.vx += (dx / distance) * force;
    dot.vy += (dy / distance) * force;
  }
}
// Updates physics for every dot each frame
function updateField(now) {
  // Remove expired ripples from the front of the queue
  while (ripples.length && now - ripples[0].born > RIPPLE_LIFE) ripples.shift();

  for (const dot of dots) {
    // repel dots near the active pointer
    pushAway(dot, pointer.x, pointer.y, PUSH_RADIUS, 1.2);

// Repel dots along the expanding perimeter of each active click ripple  
for (const ripple of ripples) 
{
      const age = now - ripple.born;
      const ringRadius = (age / 1000) * RIPPLE_SPEED;
      const fromRing = Math.abs(Math.hypot(dot.x - ripple.x, dot.y - ripple.y) - ringRadius);
      // Only push dots within 20px of the ripple's wave front; fade force as ripple ages
      if (fromRing < 20) pushAway(dot, ripple.x, ripple.y, ringRadius + 20, 3 * (1 - age / RIPPLE_LIFE));
    }

    // Spring home, with friction so it settles
    dot.vx = (dot.vx + (dot.homeX - dot.x) * 0.06) * 0.82;
    dot.vy = (dot.vy + (dot.homeY - dot.y) * 0.06) * 0.82;
    dot.x += dot.vx;
    dot.y += dot.vy;
  }
}
// Renders all dots onto fieldLayer
function drawField() {
  fieldLayer.clear();

// Separate displaced dots from stationary dots so they can be batch-filled in different colors  
const moving = [];
  for (const dot of dots) {
    const offset = Math.abs(dot.x - dot.homeX) + Math.abs(dot.y - dot.homeY);
    if (offset > 3) moving.push(dot);
    else fieldLayer.rect(dot.x - 1, dot.y - 1, 2, 2);
  }
  fieldLayer.fill({ color: colours.muted, alpha: 0.4 });
// Displaced dots: slightly larger (3x3px) and highlighted in the accent color
  for (const dot of moving) fieldLayer.rect(dot.x - 1.5, dot.y - 1.5, 3, 3);
  fieldLayer.fill(colours.accent);
}
// Initialize the dot grid and rebuild it whenever the window is resized
buildField();
window.addEventListener("resize", buildField);


// ---------- Motifs ----------
// One drawing function per project. They all take the same arguments:
//   g      the Graphics layer to draw into
//   x, y   top-left corner of the tile on screen
//   w, h   tile size
//   t      time in seconds
//   hover  0 (resting) to 1 (pointer on the tile)

// A small seeded random, so the scatter looks the same on every visit
function seededRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}
// Pre-generate 48 normalized coordinates and phase offsets for the 'scatter' motif
const random = seededRandom(7);
const scatterPoints = Array.from({ length: 48 }, () => ({ x: random(), y: random(), phase: random() * 6.28 }));

const motifs = {
  // Bloom: petals that open on hover
  bloom(g, x, y, w, h, t, hover) {
    const cx = x + w / 2, cy = y + h / 2;
    const petals = 14;
    const open = 0.35 + 0.15 * Math.sin(t * 0.8) + hover * 0.5;
    const length = Math.min(w, h) * 0.4 * open;

    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2 + t * 0.1;
      const side = 0.18;
      g.poly([
        cx, cy,
        cx + Math.cos(angle - side) * length * 0.6, cy + Math.sin(angle - side) * length * 0.6,
        cx + Math.cos(angle) * length, cy + Math.sin(angle) * length,
        cx + Math.cos(angle + side) * length * 0.6, cy + Math.sin(angle + side) * length * 0.6,
      ]);
    }
    g.fill({ color: colours.accent, alpha: hover * 0.25 });
    g.stroke({ width: 1.25, color: colours.ink });
  },

  // Four Idols: four figures built from stacked bars; hover makes them stand still
  idols(g, x, y, w, h, t, hover) {
    const columns = 4, rows = 12;
    const columnWidth = (w * 0.8) / columns;
    const rowHeight = (h * 0.7) / rows;
    const sway = 1 - hover;

    for (let c = 0; c < columns; c++) {
      const centre = x + w * 0.1 + columnWidth * (c + 0.5);
      for (let r = 0; r < rows; r++) {
        const barWidth = columnWidth * (0.25 + 0.5 * Math.abs(Math.sin(r * 0.7 + c * 1.3)));
        const shift = Math.sin(t * 1.2 + r * 0.4 + c) * columnWidth * 0.15 * sway;
        g.rect(centre - barWidth / 2 + shift, y + h * 0.15 + r * rowHeight, barWidth, rowHeight * 0.6);
      }
    }
    g.fill(hover > 0.5 ? colours.accent : colours.ink);
  },

  // The Unfinder: drifting points that find each other on hover
  scatter(g, x, y, w, h, t, hover) {
    const points = scatterPoints.map((p) => ({
      x: x + w * (0.1 + 0.8 * p.x) + Math.sin(t * 0.7 + p.phase) * 10,
      y: y + h * (0.1 + 0.8 * p.y) + Math.cos(t * 0.5 + p.phase) * 10,
    }));
  // Draw connecting lines between nearby points when hovered
    if (hover > 0.01) {
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < w * 0.16) {
            g.moveTo(points[i].x, points[i].y).lineTo(points[j].x, points[j].y);
          }
        }
      }
      g.stroke({ width: 1, color: colours.accent, alpha: hover * 0.8 });
    }

    for (const p of points) g.circle(p.x, p.y, 2.5);
    g.fill(colours.ink);
  },

  // Bounded: cells that grow and shrink inside a fixed frame
  grid(g, x, y, w, h, t, hover) {
    const columns = 8, rows = 6;
    const cellW = (w * 0.8) / columns, cellH = (h * 0.8) / rows;

    for (let i = 0; i < columns; i++) {
      for (let j = 0; j < rows; j++) {
        const size = 0.5 + 0.5 * Math.sin(t * (1 + hover * 2) + i * 0.6 + j * 0.9);
        const cx = x + w * 0.1 + cellW * (i + 0.5);
        const cy = y + h * 0.1 + cellH * (j + 0.5);
        g.rect(cx - (cellW * size) / 2.4, cy - (cellH * size) / 2.4, (cellW * size) / 1.2, (cellH * size) / 1.2);
      }
    }
    g.fill(hover > 0.5 ? colours.accent : colours.ink);
    g.rect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8).stroke({ width: 1.5, color: colours.ink });
  },

  // Lightmotif: rings spreading out, like a note going into a microphone
  rings(g, x, y, w, h, t, hover) {
    const cx = x + w / 2, cy = y + h / 2;
    const maxRadius = Math.min(w, h) * 0.45;
    const count = 7;

    for (let k = 0; k < count; k++) {
      const radius = (t * (18 + hover * 40) + (k * maxRadius) / count) % maxRadius;
      g.circle(cx, cy, radius).stroke({
        width: 1.5,
        color: hover > 0.5 ? colours.accent : colours.ink,
        alpha: 1 - radius / maxRadius,
      });
    }
    g.circle(cx, cy, 5 + hover * 4).fill(colours.ink);
  },

  // xan / pool: nodes and the links between them
  links(g, x, y, w, h, t, hover) {
    const count = 7;
    const cx = x + w / 2, cy = y + h / 2;
    const nodes = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + t * 0.15;
      const radius = Math.min(w, h) * (0.28 + 0.08 * Math.sin(t + i * 2));
      nodes.push({ x: cx + Math.cos(angle) * radius * 1.3, y: cy + Math.sin(angle) * radius });
    }

    // Every node links to two others, so nothing is left on its own
    for (let i = 0; i < count; i++) {
      for (const step of [2, 3]) {
        const other = nodes[(i + step) % count];
        g.moveTo(nodes[i].x, nodes[i].y).lineTo(other.x, other.y);
      }
    }
    g.stroke({ width: 1.25, color: hover > 0.5 ? colours.accent : colours.ink, alpha: 0.6 + hover * 0.4 });

    for (const node of nodes) g.rect(node.x - 5, node.y - 5, 10, 10);
    g.fill(colours.ink);
  },
};
// Syncs PixiJS tile drawings with the HTML DOM layout positions
function drawTiles(time) {
  artLayer.clear();

  for (const tile of tiles) {
    // Smoothly interpolate hover value toward target (0 or 1)
    tile.hover += (tile.target - tile.hover) * 0.1;

    // Where is the tile on screen right now? Skip it if scrolled away.
    const r = tile.box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    // Draw the solid tile background rectangle, then invoke its matching motif function
    artLayer.rect(r.left, r.top, r.width, r.height).fill(colours.tile);
    motifs[tile.motif](artLayer, r.left, r.top, r.width, r.height, time, tile.hover);
  }
}


// ---------- Frame loop ----------

let time = 0;
// Runs every animation frame
app.ticker.add((ticker) => {
  // Pause ambient motion if the user prefers reduced motion, unless actively hovering over a tile
  const anyHover = tiles.some((tile) => tile.target > 0);
  if (!reduceMotion || anyHover) time += ticker.deltaMS / 1000;

  const now = performance.now();
  updateField(now);
  drawField();
  drawTiles(time);
});
