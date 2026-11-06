/* Metropolis — a tiny city management game. Pure JS, no dependencies. */
'use strict';

/* ================= Config ================= */
const GRID_W = 20;
const GRID_H = 14;
const START_MONEY = 25000;
const START_YEAR = 2026;
const BULLDOZE_COST = 5;
const TAX_PER_RESIDENT = 3;   // $/month per resident
const REVENUE_PER_JOB = 2;    // $/month per filled job
const WORKFORCE_RATE = 0.6;   // share of residents that work
const SAVE_KEY = 'metropolis-save-v1';

const BUILDINGS = {
  road:       { name: 'Road',         icon: '',    cost: 10,   upkeep: 0,  group: 'Infrastructure', desc: 'Buildings need road access.' },
  house:      { name: 'House',        icon: '🏠', cost: 120,  upkeep: 1,  capacity: 10, power: 2,  group: 'Residential', desc: 'Houses 10 residents.' },
  apartment:  { name: 'Apartment',    icon: '🏢', cost: 500,  upkeep: 4,  capacity: 50, power: 8,  group: 'Residential', desc: 'Houses 50 residents.' },
  shop:       { name: 'Shop',         icon: '🏪', cost: 250,  upkeep: 2,  jobs: 12, power: 4,        group: 'Jobs', desc: '12 jobs. Needs power.' },
  office:     { name: 'Office',       icon: '🏬', cost: 700,  upkeep: 6,  jobs: 35, power: 8,        group: 'Jobs', desc: '35 jobs. Needs power.' },
  factory:    { name: 'Factory',      icon: '🏭', cost: 400,  upkeep: 3,  jobs: 30, power: 10, pollution: { radius: 2 }, group: 'Jobs', desc: '30 jobs. Pollutes nearby homes.' },
  powerplant: { name: 'Power Plant',  icon: '🔋', cost: 1200, upkeep: 18, powerGen: 120, pollution: { radius: 3 }, group: 'Power', desc: '+120 power. Pollutes nearby homes.' },
  turbine:    { name: 'Wind Turbine', icon: '🌬️', cost: 700,  upkeep: 4,  powerGen: 25, noRoad: true, group: 'Power', desc: '+25 power. Clean, no road needed.' },
  park:       { name: 'Park',         icon: '🌳', cost: 180,  upkeep: 2,  coverage: { radius: 3, happy: 6 }, noRoad: true, group: 'Services', desc: '+happiness for homes nearby.' },
  school:     { name: 'School',       icon: '🏫', cost: 600,  upkeep: 8,  power: 6, coverage: { radius: 5, happy: 8 }, group: 'Services', desc: '+happiness nearby. Needs power + road.' },
  hospital:   { name: 'Hospital',     icon: '🏥', cost: 900,  upkeep: 12, power: 10, coverage: { radius: 6, happy: 8 }, group: 'Services', desc: '+happiness nearby. Needs power + road.' },
  police:     { name: 'Police',       icon: '🚓', cost: 500,  upkeep: 7,  power: 6, coverage: { radius: 6, happy: 6 }, group: 'Services', desc: '+safety nearby. Needs power + road.' },
  fire:       { name: 'Fire dept.',   icon: '🚒', cost: 500,  upkeep: 7,  power: 6, coverage: { radius: 6, happy: 6 }, group: 'Services', desc: '+safety nearby. Needs power + road.' },
};
const BULLDOZE = { key: 'bulldoze', name: 'Bulldoze', icon: '🧨', cost: BULLDOZE_COST, group: 'Tools', desc: 'Demolish a tile.' };
const SERVICE_TYPES = ['park', 'school', 'hospital', 'police', 'fire'];
const POLLUTERS = ['factory', 'powerplant'];

const MILESTONES = [
  { pop: 0, title: 'Outpost' },
  { pop: 50, title: 'Village' },
  { pop: 200, title: 'Town' },
  { pop: 500, title: 'City' },
  { pop: 1200, title: 'Metropolis' },
  { pop: 2500, title: 'Megalopolis' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ================= State ================= */
let grid = [];            // grid[y][x] = 'house' | null
let money = START_MONEY;
let population = 0;
let happiness = 55;
let month = 0;
let year = START_YEAR;
let lastIncome = 0;
let rankIndex = 0;

let selectedTool = 'road'; // building key or 'bulldoze'
let speed = 1;             // 0 paused, 1 normal, 2 fast
let tickMs = 3000;
let tickTimer = null;
let mouseDown = false;
let sim = null;            // cached simulation results for UI

/* ================= Helpers ================= */
const $ = (id) => document.getElementById(id);
const idx = (x, y) => y * GRID_W + x;
const inBounds = (x, y) => x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
const chebyshev = (x1, y1, x2, y2) => Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function hasRoadAdj(x, y) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return inBounds(nx, ny) && grid[ny][nx] === 'road';
  });
}

function isOnline(x, y, type) {
  const b = BUILDINGS[type];
  if (!b) return false;
  if (!b.noRoad && !hasRoadAdj(x, y)) return false;
  return true;
}

/* ================= Simulation ================= */
function simulate() {
  const resTiles = [];   // residential tiles
  const svcBuildings = []; // {type, x, y, online}
  const polluters = [];  // {radius, x, y, online}
  let powerSupply = 0, powerDemand = 0, jobs = 0, capacity = 0, upkeep = 0;

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const type = grid[y][x];
      if (!type || type === 'road') continue;
      const b = BUILDINGS[type];
      upkeep += b.upkeep;
      const online = isOnline(x, y, type);

      if (b.powerGen && (b.noRoad || online)) powerSupply += b.powerGen;
      if (online) {
        if (b.power) powerDemand += b.power;
        if (b.capacity) resTiles.push({ x, y, capacity: b.capacity, type });
        if (b.jobs) jobs += b.jobs;
        if (b.coverage) svcBuildings.push({ type, x, y, radius: b.coverage.radius, happy: b.coverage.happy });
        if (b.pollution) polluters.push({ x, y, radius: b.pollution.radius });
      }
    }
  }

  const powerRatio = powerDemand <= powerSupply ? 1 : (powerSupply / powerDemand);
  capacity = resTiles.reduce((s, t) => s + t.capacity, 0) * powerRatio;
  jobs *= powerRatio;

  // Service coverage: per home, best happiness bonus of each service type
  let coverageSum = 0;
  let pollutedCount = 0;
  for (const home of resTiles) {
    const seen = {};
    for (const svc of svcBuildings) {
      if (chebyshev(home.x, home.y, svc.x, svc.y) <= svc.radius) {
        seen[svc.type] = Math.max(seen[svc.type] || 0, svc.happy);
      }
    }
    coverageSum += Object.values(seen).reduce((s, v) => s + v, 0);
    if (polluters.some(p => chebyshev(home.x, home.y, p.x, p.y) <= p.radius)) pollutedCount++;
  }
  const avgCoverage = resTiles.length ? coverageSum / resTiles.length : 0;
  const pollutedFrac = resTiles.length ? pollutedCount / resTiles.length : 0;

  const workforce = population * WORKFORCE_RATE;
  const filledJobs = Math.min(jobs, workforce);
  const unemployment = workforce > 0 ? Math.max(0, workforce - jobs) / workforce : 0;
  const jobsFree = Math.max(0, jobs - workforce);

  let target = 55
    + Math.min(30, avgCoverage)
    - pollutedFrac * 25
    - unemployment * 30
    - (powerRatio < 1 ? (1 - powerRatio) * 25 : 0)
    - (population > capacity ? 20 : 0);
  target = Math.max(5, Math.min(100, target));
  happiness = Math.round(happiness + (target - happiness) * 0.3);

  // Population movement
  const free = capacity - population;
  if (happiness >= 45 && free > 0 && (jobsFree > 0 || population < 12)) {
    const base = Math.max(2, jobsFree);
    const growth = Math.floor(Math.min(free, base, 1 + Math.round(happiness / 25)));
    population += growth;
  } else if (happiness < 35 || population > capacity) {
    const decline = Math.max(1, Math.ceil(population * 0.04));
    population = Math.max(0, Math.min(population - decline, Math.max(0, Math.floor(capacity))));
  }
  population = Math.round(population);

  // Economy
  const income = population * TAX_PER_RESIDENT + filledJobs * REVENUE_PER_JOB - upkeep;
  money += income;
  lastIncome = income;

  // Date
  month++;
  if (month > 11) { month = 0; year++; }

  // Milestones
  while (rankIndex + 1 < MILESTONES.length && population >= MILESTONES[rankIndex + 1].pop) {
    rankIndex++;
    log(`🏅 Your settlement is now a ${MILESTONES[rankIndex].title}! (${fmt(population)} residents)`, 'good');
  }

  // Recurring warnings
  if (powerRatio < 1) log('⚡ Brownout! Power demand exceeds supply — build power.', 'bad');
  if (money < 0) log('💸 The city is in debt — income must improve.', 'bad');

  return {
    powerSupply, powerDemand, powerRatio, capacity, jobs: Math.round(jobs),
    workforce: Math.round(workforce), unemployment,
  };
}

/* ================= Actions ================= */
function place(x, y) {
  if (!inBounds(x, y)) return;
  const existing = grid[y][x];

  if (selectedTool === 'bulldoze') {
    if (!existing) return;
    if (money < BULLDOZE_COST) { log('Not enough money to bulldoze.', 'warn'); return; }
    money -= BULLDOZE_COST;
    grid[y][x] = null;
    renderTile(x, y);
    return;
  }

  const b = BUILDINGS[selectedTool];
  if (!b) return;
  if (existing) return; // tile occupied
  if (money < b.cost) { log(`Not enough money for ${b.name} ($${fmt(b.cost)}).`, 'warn'); return; }
  if (selectedTool !== 'road' && !b.noRoad && !hasRoadAdj(x, y)) { log(`${b.name} needs a road next to it.`, 'warn'); return; }

  money -= b.cost;
  grid[y][x] = selectedTool;
  renderTile(x, y);
}

/* ================= Rendering ================= */
function buildMap() {
  const map = $('map');
  map.style.gridTemplateColumns = `repeat(${GRID_W}, 34px)`;
  map.innerHTML = '';
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const tile = document.createElement('div');
      tile.className = 'tile' + ((x + y) % 2 ? ' alt' : '');
      tile.dataset.x = x;
      tile.dataset.y = y;
      tile.addEventListener('mousedown', (e) => { e.preventDefault(); mouseDown = true; place(x, y); });
      tile.addEventListener('mouseenter', () => { if (mouseDown && (selectedTool === 'road' || selectedTool === 'bulldoze')) place(x, y); showTileInfo(x, y); });
      tile.addEventListener('mouseleave', () => { if (mouseDown && !(selectedTool === 'road' || selectedTool === 'bulldoze')) mouseDown = false; });
      map.appendChild(tile);
    }
  }
  document.addEventListener('mouseup', () => { mouseDown = false; });
  map.addEventListener('contextmenu', (e) => e.preventDefault());
}

function tileEl(x, y) {
  return $('map').children[idx(x, y)];
}

function renderTile(x, y) {
  const el = tileEl(x, y);
  const type = grid[y][x];
  el.className = 'tile' + ((x + y) % 2 ? ' alt' : '');
  el.innerHTML = '';
  if (!type) return;
  const b = BUILDINGS[type];
  if (type === 'road') {
    el.classList.add('road');
    if (inBounds(x + 1, y) && grid[y][x + 1] === 'road') el.classList.add('e');
    if (inBounds(x, y + 1) && grid[y + 1][x] === 'road') el.classList.add('n');
  } else {
    el.textContent = b.icon;
    const online = isOnline(x, y, type);
    if (!online) el.classList.add('offline');
    if (b.power && sim && sim.powerRatio < 1) el.classList.add('brownout');
  }
}

function renderAll() {
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) renderTile(x, y);
  renderStats();
}

function renderStats() {
  $('money').textContent = fmt(money);
  $('income').textContent = (lastIncome >= 0 ? '+$' : '−$') + fmt(Math.abs(lastIncome));
  $('stat-money').classList.toggle('bad', money < 0);
  $('income').style.color = lastIncome >= 0 ? 'var(--good)' : 'var(--bad)';
  $('population').textContent = fmt(population);
  $('capacity').textContent = sim ? fmt(sim.capacity) : '0';
  $('jobs').textContent = sim ? fmt(sim.jobs) : '0';
  $('workforce').textContent = sim ? fmt(sim.workforce) : '0';
  $('power').textContent = sim ? `${fmt(sim.powerSupply)}/${fmt(sim.powerDemand)}` : '0/0';
  $('stat-power').classList.toggle('bad', sim ? sim.powerRatio < 1 : false);
  $('happiness').textContent = Math.round(happiness);
  $('rank').textContent = MILESTONES[rankIndex].title;
  $('date').textContent = `${MONTHS[month]} ${year}`;
}

function showTileInfo(x, y) {
  const el = $('tile-info-body');
  const type = grid[y][x];
  if (!type) {
    el.innerHTML = '<span class="t-name">Empty land</span><br><span class="t-line">Select a building and click here.</span>';
    return;
  }
  if (type === 'road') {
    el.innerHTML = '<span class="t-name">🛣️ Road</span><br><span class="t-line">Connects buildings to the city.</span>';
    return;
  }
  const b = BUILDINGS[type];
  const online = isOnline(x, y, type);
  let html = `<span class="t-name">${b.icon} ${b.name}</span><br><span class="t-line">${b.desc}</span><br>`;
  html += `<span class="t-line">Upkeep $${b.upkeep}/mo · Power ${b.power || 0}</span><br>`;
  if (!online) html += '<span class="t-warn">⚠ Offline — no road access</span>';
  else if (b.power && sim && sim.powerRatio < 1) html += '<span class="t-warn">⚠ Brownout — not enough power</span>';
  el.innerHTML = html;
}

/* ================= Toolbar ================= */
function buildToolbar() {
  const tools = $('tools');
  tools.innerHTML = '';
  const groups = {};
  const all = [...Object.entries(BUILDINGS).map(([key, b]) => ({ key, ...b })), BULLDOZE];
  for (const t of all) (groups[t.group] = groups[t.group] || []).push(t);
  for (const [group, items] of Object.entries(groups)) {
    const label = document.createElement('div');
    label.className = 'tool-group-label';
    label.textContent = group;
    tools.appendChild(label);
    for (const t of items) {
      const btn = document.createElement('button');
      btn.className = 'tool' + (t.key === selectedTool ? ' selected' : '');
      btn.innerHTML = `<span class="tool-icon">${t.icon || '🛣️'}</span><span class="tool-name">${t.name}</span><span class="tool-cost">$${fmt(t.cost)}</span>`;
      btn.title = t.desc;
      btn.addEventListener('click', () => {
        selectedTool = t.key;
        document.querySelectorAll('.tool').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
      });
      tools.appendChild(btn);
    }
  }
}

/* ================= Log ================= */
function log(msg, kind = '') {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + kind;
  entry.textContent = msg;
  const logEl = $('log');
  logEl.prepend(entry);
  while (logEl.children.length > 25) logEl.removeChild(logEl.lastChild);
}

/* ================= Save / Load ================= */
function save() {
  const data = { v: 1, grid: grid.flat(), money, population, happiness, month, year, rankIndex, lastIncome };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage unavailable */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (d.v !== 1 || !Array.isArray(d.grid) || d.grid.length !== GRID_W * GRID_H) return false;
    grid = [];
    for (let y = 0; y < GRID_H; y++) grid.push(d.grid.slice(y * GRID_W, (y + 1) * GRID_W));
    money = d.money; population = d.population; happiness = d.happiness;
    month = d.month; year = d.year; rankIndex = d.rankIndex || 0; lastIncome = d.lastIncome || 0;
    return true;
  } catch (e) { return false; }
}

function newGame() {
  stopTick();
  grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
  money = START_MONEY; population = 0; happiness = 55;
  month = 0; year = START_YEAR; lastIncome = 0; rankIndex = 0;
  sim = null;
  $('log').innerHTML = '';
  log('🏗️ Welcome, mayor! Zone some roads and houses to get started.', 'good');
  log('💡 Tip: houses need a road; shops bring jobs; power plants keep the lights on.');
  save();
  renderAll();
  startTick();
}

/* ================= Game loop ================= */
function doTick() {
  sim = simulate();
  renderAll();
  save();
}

function startTick() {
  stopTick();
  if (speed === 0) return;
  tickTimer = setInterval(doTick, speed === 2 ? 1200 : tickMs);
}
function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

function setSpeed(s) {
  speed = s;
  $('btn-pause').classList.toggle('active', s === 0);
  $('btn-play').classList.toggle('active', s === 1);
  $('btn-fast').classList.toggle('active', s === 2);
  startTick();
}

/* ================= Init ================= */
function init() {
  buildMap();
  buildToolbar();

  $('btn-pause').addEventListener('click', () => setSpeed(0));
  $('btn-play').addEventListener('click', () => setSpeed(1));
  $('btn-fast').addEventListener('click', () => setSpeed(2));
  $('btn-save').addEventListener('click', () => { save(); log('💾 City saved.', 'good'); });
  $('btn-new').addEventListener('click', () => {
    if (confirm('Start a new city? Your current city will be erased.')) newGame();
  });

  if (load()) {
    log('📂 Loaded your saved city.', 'good');
    sim = null;
    // run a dry pass for UI stats without advancing time
    renderAll();
  } else {
    newGame();
    return;
  }
  startTick();
}

init();
