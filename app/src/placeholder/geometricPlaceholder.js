// Geometric placeholder — Islamic-inspired animated motifs shown in the empty
// waveform area while no audio file is loaded.
//
// Deliberately framework-free: it locates the waveform container from the outside
// (largest <canvas> inside #root) and toggles itself by watching React's DOM for
// the "Ctrl+O or drag & drop" empty-state text, so it needs no hooks into the app.
import './placeholder.css';

const TILE_SIZE = 72;
const NS = 'http://www.w3.org/2000/svg';
const COLORS = [
  '#4fc3f7',
  '#80deea',
  '#4dd0e1',
  '#26c6da',
  '#00bcd4',
  '#b2ebf2',
  '#29b6f6',
  '#03a9f4',
  '#0288d1',
  '#b2ebf2',
];

// --- SVG helpers ---

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function makeSvg(size) {
  return svgEl('svg', { width: size, height: size, viewBox: '0 0 100 100' });
}

function polygon(pts, color, sw) {
  return svgEl('polygon', {
    points: pts,
    fill: 'none',
    stroke: color,
    'stroke-width': sw || '1.5',
  });
}

function regularPoints(n, r, offset) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (((i * 360) / n + (offset || -90)) * Math.PI) / 180;
    pts.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (50 + r * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
}

// --- Three Islamic geometric motifs ---

// 8-pointed star (Rub el Hizb): two overlapping squares + inner octagon
function createStar8(size, color) {
  const svg = makeSvg(size);
  const rectAttrs = {
    x: 22,
    y: 22,
    width: 56,
    height: 56,
    fill: 'none',
    stroke: color,
    'stroke-width': '1.5',
  };
  svg.appendChild(svgEl('rect', Object.assign({}, rectAttrs, { transform: 'rotate(45 50 50)' })));
  svg.appendChild(svgEl('rect', rectAttrs));
  svg.appendChild(polygon(regularPoints(8, 22), color, '1'));
  svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 3, fill: color, opacity: '0.6' }));
  return svg;
}

// Hexagonal rosette: outer hexagon + 6 radiating triangles + inner hexagon
function createHexRosette(size, color) {
  const svg = makeSvg(size);
  svg.appendChild(polygon(regularPoints(6, 38, -30), color));
  for (let i = 0; i < 6; i++) {
    const a1 = ((i * 60 - 30) * Math.PI) / 180;
    const a2 = (((i + 1) * 60 - 30) * Math.PI) / 180;
    svg.appendChild(
      polygon(
        '50,50 ' +
          (50 + 38 * Math.cos(a1)).toFixed(1) +
          ',' +
          (50 + 38 * Math.sin(a1)).toFixed(1) +
          ' ' +
          (50 + 38 * Math.cos(a2)).toFixed(1) +
          ',' +
          (50 + 38 * Math.sin(a2)).toFixed(1),
        color,
        '0.8',
      ),
    );
  }
  svg.appendChild(polygon(regularPoints(6, 16, 0), color, '1'));
  return svg;
}

// Diamond lattice: outer diamond + cross + inner diamond
function createDiamond(size, color) {
  const svg = makeSvg(size);
  svg.appendChild(polygon('50,8 92,50 50,92 8,50', color));
  svg.appendChild(
    svgEl('line', { x1: 50, y1: 20, x2: 50, y2: 80, stroke: color, 'stroke-width': '0.8' }),
  );
  svg.appendChild(
    svgEl('line', { x1: 20, y1: 50, x2: 80, y2: 50, stroke: color, 'stroke-width': '0.8' }),
  );
  svg.appendChild(polygon('50,30 70,50 50,70 30,50', color, '1'));
  return svg;
}

const SHAPES = [createStar8, createHexRosette, createDiamond];

// --- Placeholder grid ---

function buildGrid(container) {
  const rect = container.getBoundingClientRect();
  const cols = Math.max(1, Math.ceil(rect.width / (TILE_SIZE + 2)));
  const rows = Math.max(1, Math.ceil(rect.height / (TILE_SIZE + 2)));

  const grid = document.createElement('div');
  grid.className = 'geo-grid';
  grid.style.gridTemplateColumns = 'repeat(' + cols + ', ' + TILE_SIZE + 'px)';
  grid.style.gridTemplateRows = 'repeat(' + rows + ', ' + TILE_SIZE + 'px)';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = document.createElement('div');
      tile.className = 'geo-tile';
      const svg = SHAPES[(row + col) % 3](
        TILE_SIZE - 4,
        COLORS[(row * cols + col) % COLORS.length],
      );
      svg.style.animationDelay = (Math.random() * 8).toFixed(2) + 's';
      tile.appendChild(svg);
      grid.appendChild(tile);
    }
  }
  return grid;
}

// --- Initialization & visibility detection ---

// Find the waveform container by structural layout:
// the largest canvas's parent with border-radius (waveform panel).
function findWaveformContainer() {
  let best = null;
  let bestArea = 0;
  const canvases = document.querySelectorAll('#root canvas');
  for (let i = 0; i < canvases.length; i++) {
    const c = canvases[i];
    const area = c.width * c.height;
    if (area > bestArea) {
      bestArea = area;
      best = c;
    }
  }
  return best ? best.parentElement : null;
}

// Check for empty-state indicator in the file panel.
// The React app renders a div with "No file loaded" + "Ctrl+O or drag & drop"
// when no files are open. We target this specific two-child structure.
function findEmptyStateNode() {
  const spans = document.querySelectorAll('#root span');
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].textContent === 'Ctrl+O or drag & drop') return spans[i];
  }
  return null;
}

function init() {
  const container = findWaveformContainer();
  if (!container) return false;

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const placeholder = document.createElement('div');
  placeholder.id = 'waveform-placeholder';
  placeholder.appendChild(buildGrid(container));
  container.appendChild(placeholder);

  // Set initial visibility
  placeholder.classList.toggle('hidden', !findEmptyStateNode());

  // React DOM mutations trigger instant visibility check
  const observer = new MutationObserver(function () {
    placeholder.classList.toggle('hidden', !findEmptyStateNode());
  });
  observer.observe(document.getElementById('root'), {
    childList: true,
    subtree: true,
  });

  // Rebuild grid on container resize
  const resizeObserver = new ResizeObserver(function () {
    const oldGrid = placeholder.querySelector('.geo-grid');
    if (oldGrid) placeholder.removeChild(oldGrid);
    placeholder.appendChild(buildGrid(container));
  });
  resizeObserver.observe(container);

  return true;
}

// Wait for React to render, then initialize
let elapsed = 0;
const poll = setInterval(function () {
  if (init() || (elapsed += 200) >= 10000) clearInterval(poll);
}, 200);
