// The Pay 'n Spray garage: repair, engine tunes, armor plating and paint
// jobs, bought with mission money. Upgrades belong to Kai's garage tune:
// they persist in the save and apply to every car he drives (see
// applyUpgrades, called when entering a car). Press E at Pay 'n Spray to
// open the menu; keys 1-4 buy, Esc/E closes.
import { PLACES, REPAIR_COST } from './config.js';

export const UPGRADES = {
  engine: { name: 'Engine Tune', prices: [300, 500, 800], desc: '+12% top speed per level' },
  armor: { name: 'Armor Plating', prices: [250, 400, 600], desc: '+50 max HP per level' },
};
export const PAINT_PRICE = 150;
export const PAINT_COLORS = [
  { name: 'Sunset Orange', color: 0xff7a29 },
  { name: 'Ocean Blue', color: 0x2e6fd8 },
  { name: 'Cherry Red', color: 0xd23c3c },
  { name: 'Mint Green', color: 0x3ca86b },
  { name: 'Royal Purple', color: 0x8a4fd8 },
  { name: 'Pearl White', color: 0xe8e8e8 },
];
const hexCss = (c) => `#${c.toString(16).padStart(6, '0')}`;

export function createGarage(G) {
  const menuEl = document.createElement('div');
  menuEl.id = 'garageMenu';
  menuEl.className = 'menuPanel hidden';
  menuEl.innerHTML = `
    <h3>PAY 'N SPRAY</h3>
    <div class="sub">Repair &amp; upgrades — <span id="garageMoney"></span></div>
    <div class="menuRow"><span><b>1 · Repair</b><br><small>Full repair &amp; lose the cops</small></span><span class="price">$${REPAIR_COST}</span><button class="menuBtn" id="garageBtnRepair">REPAIR</button></div>
    <div class="menuRow"><span><b>2 · Engine Tune</b> <span id="garageEngineLv"></span><br><small>+12% top speed per level</small></span><span class="price" id="garageEnginePrice"></span><button class="menuBtn" id="garageBtnEngine">BUY</button></div>
    <div class="menuRow"><span><b>3 · Armor Plating</b> <span id="garageArmorLv"></span><br><small>+50 max HP per level</small></span><span class="price" id="garageArmorPrice"></span><button class="menuBtn" id="garageBtnArmor">BUY</button></div>
    <div class="menuRow"><span><b>4 · Paint Job</b><br><small id="garagePaintName"></small></span><span class="price">$${PAINT_PRICE}</span><span id="garagePaintRow"></span></div>
    <div class="menuRow"><span><small>Keys 1-4 buy · E / Esc closes</small></span><button class="menuBtn alt" id="garageBtnClose">CLOSE</button></div>`;
  document.body.appendChild(menuEl);
  const paintRow = menuEl.querySelector('#garagePaintRow');
  for (const pc of PAINT_COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.id = `garagePaint-${pc.color.toString(16)}`;
    b.title = `${pc.name} — $${PAINT_PRICE}`;
    b.style.background = hexCss(pc.color);
    b.addEventListener('click', () => buyUpgrade(G, 'paint', pc.color));
    paintRow.appendChild(b);
  }
  menuEl.querySelector('#garageBtnRepair').addEventListener('click', () => repairCar(G));
  menuEl.querySelector('#garageBtnEngine').addEventListener('click', () => buyUpgrade(G, 'engine'));
  menuEl.querySelector('#garageBtnArmor').addEventListener('click', () => buyUpgrade(G, 'armor'));
  menuEl.querySelector('#garageBtnClose').addEventListener('click', () => closeGarageMenu(G));
  return { owned: { engine: 0, armor: 0, paint: null }, menuOpen: false, menuEl };
}

function refreshGarageMenu(G) {
  const gr = G.garage;
  const el = gr.menuEl;
  const o = gr.owned;
  el.querySelector('#garageMoney').textContent = `$${Math.floor(G.player.money)}`;
  el.querySelector('#garageEngineLv').textContent = `Lv ${o.engine}/3`;
  el.querySelector('#garageArmorLv').textContent = `Lv ${o.armor}/3`;
  const engBtn = el.querySelector('#garageBtnEngine');
  const armBtn = el.querySelector('#garageBtnArmor');
  el.querySelector('#garageEnginePrice').textContent = o.engine >= 3 ? 'MAXED' : `$${UPGRADES.engine.prices[o.engine]}`;
  el.querySelector('#garageArmorPrice').textContent = o.armor >= 3 ? 'MAXED' : `$${UPGRADES.armor.prices[o.armor]}`;
  engBtn.disabled = o.engine >= 3;
  armBtn.disabled = o.armor >= 3;
  const cur = PAINT_COLORS.find((pc) => pc.color === o.paint);
  el.querySelector('#garagePaintName').textContent = cur ? `Current: ${cur.name}` : 'Pick a color';
  for (const s of el.querySelectorAll('.swatch')) {
    s.classList.toggle('current', Number.parseInt(s.id.split('-')[1], 16) === o.paint);
  }
}

export function openGarageMenu(G) {
  const gr = G.garage;
  if (gr.menuOpen) return;
  gr.menuOpen = true;
  refreshGarageMenu(G);
  gr.menuEl.classList.remove('hidden');
  G.input.unlock();
}

export function closeGarageMenu(G) {
  const gr = G.garage;
  if (!gr.menuOpen) return;
  gr.menuOpen = false;
  gr.menuEl.classList.add('hidden');
}

// Stamp Kai's owned garage tune onto a car: top speed, max HP, paint.
// Called when entering a car and right after every purchase.
export function applyUpgrades(G, car) {
  if (!car) return;
  const o = G.garage.owned;
  car.topSpeedMul = 1 + 0.12 * o.engine;
  const max = 100 + 50 * o.armor;
  if (max > (car.maxHealth || 100)) {
    // New plating adds HP with it.
    car.health = Math.min(max, car.health + (max - (car.maxHealth || 100)));
  }
  car.maxHealth = max;
  car.health = Math.min(car.health, car.maxHealth);
  if (o.paint !== null && o.paint !== undefined) {
    car.color = o.paint;
    if (car.bodyMat) car.bodyMat.color.setHex(o.paint);
  }
}

// Buy an upgrade: 'engine' | 'armor' | 'paint' (paint takes a color hex,
// or cycles to the next color when none is given).
export function buyUpgrade(G, kind, arg) {
  const gr = G.garage;
  const p = G.player;
  if (kind === 'paint') {
    const idx = PAINT_COLORS.findIndex((pc) => pc.color === gr.owned.paint);
    const pc = arg !== undefined
      ? PAINT_COLORS.find((c) => c.color === arg)
      : PAINT_COLORS[(idx + 1) % PAINT_COLORS.length];
    if (!pc) return false;
    if (gr.owned.paint === pc.color) { G.hud.hint('Already this color', 1.5); return false; }
    if (p.money < PAINT_PRICE) { G.hud.hint('Not enough cash', 1.5); return false; }
    p.money -= PAINT_PRICE;
    gr.owned.paint = pc.color;
    applyUpgrades(G, G.playerCar);
    G.audio.coin();
    G.hud.notify('PAINT JOB', pc.name);
  } else {
    const def = UPGRADES[kind];
    if (!def) return false;
    const lv = gr.owned[kind];
    if (lv >= def.prices.length) { G.hud.hint(`${def.name} already maxed`, 1.5); return false; }
    const price = def.prices[lv];
    if (p.money < price) { G.hud.hint('Not enough cash', 1.5); return false; }
    p.money -= price;
    gr.owned[kind] = lv + 1;
    applyUpgrades(G, G.playerCar);
    G.audio.coin();
    G.hud.notify(def.name.toUpperCase(), `Level ${lv + 1}/3 — ${def.desc}`);
  }
  refreshGarageMenu(G);
  G.save();
  return true;
}

// Repair + lose the cops, as before ($100, only when the car needs it).
export function repairCar(G) {
  const car = G.playerCar;
  if (!car) { G.hud.hint('No car to repair', 1.5); return false; }
  const p = G.player;
  if (p.money < REPAIR_COST) { G.hud.hint('Not enough cash', 1.5); return false; }
  if (car.health >= (car.maxHealth || 100) && G.police.wanted === 0) {
    G.hud.hint('Car is already in perfect shape', 1.5);
    return false;
  }
  p.money -= REPAIR_COST;
  car.health = car.maxHealth || 100;
  G.police.clearWanted();
  G.audio.coin();
  G.hud.notify("PAY 'N SPRAY", 'Good as new — and the cops lost your trail');
  refreshGarageMenu(G);
  G.save();
  return true;
}

// Per-frame garage logic: E near Pay 'n Spray (in a car) opens the menu;
// while it is open, keys 1-4 buy.
export function updateGarage(G, dt) {
  const gr = G.garage;
  if (G.screen !== 'play') return;
  if (gr.menuOpen) {
    const input = G.input;
    if (input.take('Digit1')) repairCar(G);
    else if (input.take('Digit2')) buyUpgrade(G, 'engine');
    else if (input.take('Digit3')) buyUpgrade(G, 'armor');
    else if (input.take('Digit4')) buyUpgrade(G, 'paint');
    return;
  }
  const p = G.player;
  if (!G.playerCar) return;
  const near = Math.hypot(p.x - PLACES.garage.x, p.z - PLACES.garage.z) < 14;
  if (near) {
    G.hud.hint(`Press E — Pay 'n Spray: repair & upgrades`, 0.4);
    if (G.input.take('KeyE')) openGarageMenu(G);
  }
  void dt;
}
