// The weapon wheel: pistol, SMG and shotgun with distinct damage, fire rate,
// range and ammo. Keys 1-3 pick a weapon, Q cycles; the wheel flashes on
// screen when switching and the HUD always shows the current weapon + ammo.
// The punch stays as the close-range fallback (see player.js) — these weapons
// only handle ranged shots. Ammo is bought at Solmar Arms (see shops.js).
// (No config import: every weapon number lives in WEAPONS above, so the
// dossier shows the whole arsenal in this one file.)

// Pistol numbers are the ones entry 1 shipped with (50 damage drops a Viper
// in two hits, 20 to a car, 0.28s between shots): the new weapons are tuned
// around it, not by changing it.
export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 50, carDamage: 20, rate: 0.28, range: 45, pellets: 1, spread: 0, startAmmo: 60 },
  smg: { name: 'SMG', damage: 20, carDamage: 8, rate: 0.09, range: 40, pellets: 1, spread: 0.03, startAmmo: 120 },
  shotgun: { name: 'Shotgun', damage: 15, carDamage: 8, rate: 0.8, range: 30, pellets: 5, spread: 0.09, startAmmo: 24 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun'];
// The gun mesh in the player's hand stretches per weapon, so the 3D view
// shows which weapon Kai is holding.
const GUN_SCALE = { pistol: [1, 1, 1], smg: [1, 1, 1.8], shotgun: [1.4, 1.4, 2.4] };

export function createWeapons(G) {
  const W = {
    current: 'pistol',
    ammo: { pistol: WEAPONS.pistol.startAmmo, smg: WEAPONS.smg.startAmmo, shotgun: WEAPONS.shotgun.startAmmo },
    wheelT: 0,
    wheelEl: document.getElementById('weaponWheel'),
  };
  // Build the wheel slots once; switchWeapon highlights the current one.
  if (W.wheelEl) {
    W.wheelEl.innerHTML = WEAPON_ORDER.map((id) => `<div class="wheelSlot" data-weapon="${id}"><b>${WEAPONS[id].name}</b><span></span></div>`).join('');
  }
  return W;
}

function refreshWheel(G) {
  const W = G.weapons;
  if (!W.wheelEl) return;
  for (const slot of W.wheelEl.querySelectorAll('.wheelSlot')) {
    const id = slot.dataset.weapon;
    slot.classList.toggle('current', id === W.current);
    slot.querySelector('span').textContent = `${W.ammo[id]} rounds`;
  }
}

// Flash the wheel on screen for a moment (on switch, or when ammo is bought).
function showWheel(G) {
  const W = G.weapons;
  if (!W.wheelEl) return;
  refreshWheel(G);
  W.wheelEl.classList.remove('hidden');
  W.wheelT = 1.2;
}

// Switch to a weapon by id ('pistol' | 'smg' | 'shotgun').
export function switchWeapon(G, id) {
  const W = G.weapons;
  if (!WEAPONS[id] || W.current === id) return false;
  W.current = id;
  const gun = G.player?.gun;
  if (gun) gun.scale.set(...GUN_SCALE[id]);
  showWheel(G);
  G.audio.blip();
  return true;
}

// Cycle to the next weapon (Q key).
export function cycleWeapon(G) {
  const i = WEAPON_ORDER.indexOf(G.weapons.current);
  return switchWeapon(G, WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]);
}

// Add ammo (bought at a shop). Returns how many rounds were added.
export function addAmmo(G, id, n) {
  if (!WEAPONS[id]) return 0;
  G.weapons.ammo[id] += n;
  showWheel(G);
  return n;
}

// Fire the current weapon at the aim point: hitscan along the player's
// heading, one ray per pellet (the shotgun sprays five). Sets the player's
// shot cooldown from the weapon's fire rate. Returns true if a shot went off.
export function fireWeapon(G, target) {
  const W = G.weapons;
  const p = G.player;
  const def = WEAPONS[W.current];
  if (W.ammo[W.current] <= 0) {
    G.hud.hint(`Out of ammo — buy more at Solmar Arms`, 1.5);
    p.shootCd = 0.3;
    return false;
  }
  W.ammo[W.current] -= 1;
  p.shootCd = def.rate;
  G.audio.shot();
  G.effects.muzzle(G, p.x + Math.sin(p.heading) * 0.6, p.z + Math.cos(p.heading) * 0.6, target.x, target.z);
  G.police.shotFired(p.x, p.z);
  for (let i = 0; i < def.pellets; i++) {
    const h = p.heading + (def.pellets > 1 ? G.rng.range(-def.spread, def.spread) : G.rng.range(-def.spread, def.spread));
    const fx = Math.sin(h), fz = Math.cos(h);
    let best = null, bd = def.range;
    const test = (o, r) => {
      const dx = o.x - p.x, dz = o.z - p.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < bd && side < r + along * 0.06) { bd = along; best = o; }
    };
    for (const e of G.enemies) if (!e.dead) test(e, 1.2);
    for (const q of G.peds) if (!q.dead) test(q, 1);
    for (const car of G.cars) if (!car.dead && car !== p.car) test(car, 2);
    if (best) {
      G.effects.burst(G, best.x, best.z, 0xffcc66, 6);
      if (best.health !== undefined && best.role === undefined) G.missions.damageEnemy(best, def.damage);
      else if (best.role !== undefined) G.damageCar(best, def.carDamage);
      else G.pedsHit(best, false);
    }
  }
  return true;
}

// Per-frame weapon keys: 1-3 switch, Q cycles. Skipped while a shop or
// garage menu is open — there the number keys buy things instead.
export function updateWeapons(G, dt) {
  const W = G.weapons;
  if (W.wheelT > 0) {
    W.wheelT -= dt;
    if (W.wheelT <= 0 && W.wheelEl) W.wheelEl.classList.add('hidden');
  }
  if (G.screen !== 'play') return;
  if (G.garage?.menuOpen || G.shops?.menuOpen) return;
  const input = G.input;
  if (input.take('Digit1')) switchWeapon(G, 'pistol');
  else if (input.take('Digit2')) switchWeapon(G, 'smg');
  else if (input.take('Digit3')) switchWeapon(G, 'shotgun');
  else if (input.take('KeyQ')) cycleWeapon(G);
  // Keep the wheel's ammo counts fresh while it is showing.
  if (W.wheelT > 0) refreshWheel(G);
}
