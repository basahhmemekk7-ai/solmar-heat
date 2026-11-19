// Shops: three kiosks around Solmar Bay where Kai spends mission money —
// Solmar Arms sells ammo, Sunset Tacos sells food that heals, Bay General
// sells a little of both. Walk up and press E; keys 1-3 buy, Esc/E closes.
// Shops show as cyan squares on the minimap (see hud.js).
import * as THREE from '../vendor/three.module.min.js';
import { addAmmo } from './weapons.js';

export const SHOPS = [
  {
    id: 'arms', name: 'Solmar Arms', blurb: 'guns & ammo', x: 60, z: -60, color: 0xff4444,
    items: [
      { id: 'pistol-ammo', name: 'Pistol Ammo ×60', price: 40, weapon: 'pistol', qty: 60 },
      { id: 'smg-ammo', name: 'SMG Ammo ×120', price: 60, weapon: 'smg', qty: 120 },
      { id: 'shotgun-ammo', name: 'Shotgun Shells ×24', price: 50, weapon: 'shotgun', qty: 24 },
    ],
  },
  {
    id: 'tacos', name: 'Sunset Tacos', blurb: 'food & first aid', x: -60, z: 120, color: 0xffb03a,
    items: [
      { id: 'taco', name: 'Taco (+25 HP)', price: 25, heal: 25 },
      { id: 'burrito', name: 'Burrito (+50 HP)', price: 45, heal: 50 },
      { id: 'medkit', name: 'Medkit (full heal)', price: 80, heal: 1000 },
    ],
  },
  {
    id: 'general', name: 'Bay General', blurb: 'ammo & snacks', x: 180, z: 60, color: 0x22d3ee,
    items: [
      { id: 'pistol-ammo', name: 'Pistol Ammo ×60', price: 40, weapon: 'pistol', qty: 60 },
      { id: 'taco', name: 'Taco (+25 HP)', price: 25, heal: 25 },
      { id: 'medkit', name: 'Medkit (full heal)', price: 80, heal: 1000 },
    ],
  },
];

function buildKiosk(G, shop) {
  // A little stall on the sidewalk corner of the intersection: a colored
  // box, a white roof, a glowing sign and a ground ring. The interaction
  // point is the intersection itself, so the player never has to squeeze
  // behind the stall.
  const g = new THREE.Group();
  const stall = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 3),
    new THREE.MeshStandardMaterial({ color: shop.color, roughness: 0.8 }),
  );
  stall.position.y = 1.5;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.3, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  );
  roof.position.y = 3.1;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(5, 1.2, 0.3),
    new THREE.MeshBasicMaterial({ color: shop.color }),
  );
  sign.position.y = 4.2;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3, 24),
    new THREE.MeshBasicMaterial({ color: shop.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(stall, roof, sign, ring);
  g.position.set(shop.x + 8, 0, shop.z + 8);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  G.scene.add(g);
}

export function createShops(G) {
  for (const shop of SHOPS) buildKiosk(G, shop);
  const menuEl = document.createElement('div');
  menuEl.id = 'shopMenu';
  menuEl.className = 'menuPanel hidden';
  document.body.appendChild(menuEl);
  return { list: SHOPS, menuOpen: false, current: null, menuEl, purchases: 0 };
}

function refreshShopMenu(G) {
  const S = G.shops;
  const shop = S.current;
  if (!shop) return;
  S.menuEl.querySelector('#shopMoney').textContent = `$${Math.floor(G.player.money)}`;
  shop.items.forEach((item, i) => {
    const btn = S.menuEl.querySelector(`#shopBtn${i}`);
    if (btn) btn.disabled = G.player.money < item.price;
  });
}

export function openShopsMenu(G, shop) {
  const S = G.shops;
  S.current = shop;
  S.menuOpen = true;
  S.menuEl.innerHTML = `
    <h3>${shop.name.toUpperCase()}</h3>
    <div class="sub">${shop.blurb} — <span id="shopMoney"></span></div>
    ${shop.items.map((item, i) => `
      <div class="menuRow"><span><b>${i + 1} · ${item.name}</b></span><span class="price">$${item.price}</span><button class="menuBtn" id="shopBtn${i}">BUY</button></div>`).join('')}
    <div class="menuRow"><span><small>Keys 1-3 buy · E / Esc closes</small></span><button class="menuBtn alt" id="shopBtnClose">CLOSE</button></div>`;
  shop.items.forEach((item, i) => {
    S.menuEl.querySelector(`#shopBtn${i}`).addEventListener('click', () => buyItem(G, shop.id, item.id));
  });
  S.menuEl.querySelector('#shopBtnClose').addEventListener('click', () => closeShopsMenu(G));
  refreshShopMenu(G);
  S.menuEl.classList.remove('hidden');
  G.input.unlock();
}

export function closeShopsMenu(G) {
  const S = G.shops;
  if (!S.menuOpen) return;
  S.menuOpen = false;
  S.current = null;
  S.menuEl.classList.add('hidden');
}

// Buy an item from a shop: ammo goes to the weapon wheel, food heals.
// Returns true when the purchase went through.
export function buyItem(G, shopId, itemId) {
  const shop = SHOPS.find((s) => s.id === shopId);
  const item = shop?.items.find((it) => it.id === itemId);
  if (!item) return false;
  const p = G.player;
  if (item.heal && p.health >= 100) { G.hud.hint('Already at full health', 1.5); return false; }
  if (p.money < item.price) { G.hud.hint('Not enough cash', 1.5); return false; }
  p.money -= item.price;
  G.shops.purchases += 1;
  if (item.weapon) {
    addAmmo(G, item.weapon, item.qty);
    G.hud.notify(shop.name.toUpperCase(), `${item.name} — ${G.weapons.ammo[item.weapon]} rounds now`);
  } else {
    p.health = Math.min(100, p.health + item.heal);
    G.hud.notify(shop.name.toUpperCase(), `${item.name} — health ${Math.round(p.health)}`);
  }
  G.audio.coin();
  refreshShopMenu(G);
  G.save();
  return true;
}

// Per-frame shop logic: E near a shop opens its menu; while open, keys 1-3 buy.
export function updateShops(G, dt) {
  const S = G.shops;
  if (G.screen !== 'play') return;
  if (S.menuOpen) {
    const input = G.input;
    const items = S.current?.items || [];
    if (input.take('Digit1') && items[0]) buyItem(G, S.current.id, items[0].id);
    else if (input.take('Digit2') && items[1]) buyItem(G, S.current.id, items[1].id);
    else if (input.take('Digit3') && items[2]) buyItem(G, S.current.id, items[2].id);
    return;
  }
  const p = G.player;
  const near = S.list.find((s) => Math.hypot(p.x - s.x, p.z - s.z) < 16);
  if (near) {
    G.hud.hint(`Press E — ${near.name}: ${near.blurb}`, 0.4);
    if (G.input.take('KeyE')) openShopsMenu(G, near);
  }
  void dt;
}
