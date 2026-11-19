// Street races: a checkpoint race from the checkered start line at (60, 120).
// Drive to the flag in a car, press E, and beat two AI rivals around a
// four-checkpoint loop of Solmar Bay. Winning pays $400 and +25 respect;
// second place pays $100. The HUD panel shows position, checkpoint and time,
// and the orange beacon marks the next checkpoint. The crew blocks the
// route, so the race runs on a clear road, and lookouts keep new heat off
// while racing (see police.js). Missions can require a race win (see
// missions.js 'raceWin' steps, which watch R.wins).
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_ZS, clamp } from './config.js';
import { spawnCar, syncCarMesh } from './vehicles.js';
import { resolveCollisions } from './city.js';

export const RACE_START = { x: 60, z: 120 };
export const RACE_CHECKPOINTS = [
  { x: 180, z: 120 },
  { x: 180, z: -60 },
  { x: 60, z: -60 },
  { x: 60, z: 120 }, // finish: back at the start line
];
export const RACE_PRIZE_WIN = 400;
export const RACE_PRIZE_SECOND = 100;
export const RACE_RESPECT_WIN = 25;
export const RACE_TIMEOUT = 240;
// Two rivals on sports cars: a steady one and a quicker one. Both drive a
// perfect line, so a player who brakes for the turns still has to drive
// well to beat the fast one — but a sports car at full tilt wins by seconds.
const RIVALS = [
  { color: 0x2e6fd8, cruise: 19, lane: 3.5 },
  { color: 0xe8b93c, cruise: 21.5, lane: -3.5 },
];

// The course as road segments (start line -> checkpoints), for clearing
// traffic off the route.
const COURSE_LEGS = (() => {
  const legs = [];
  let px = RACE_START.x, pz = RACE_START.z;
  for (const cp of RACE_CHECKPOINTS) {
    legs.push({ x0: px, z0: pz, x1: cp.x, z1: cp.z });
    px = cp.x; pz = cp.z;
  }
  return legs;
})();

function distToSegment(x, z, l) {
  const dx = l.x1 - l.x0, dz = l.z1 - l.z0;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((x - l.x0) * dx + (z - l.z0) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (l.x0 + dx * t), z - (l.z0 + dz * t));
}

// True when a point is on (or parked beside) the race route.
function onCourse(x, z) {
  for (const l of COURSE_LEGS) if (distToSegment(x, z, l) < 10) return true;
  return false;
}

// Move a traffic or parked car to a random road point off the course,
// placed the way spawnTraffic/spawnParked place a fresh car.
function moveOffCourse(G, car) {
  for (let tries = 0; tries < 12; tries++) {
    const p = G.city.randomRoadPoint();
    if (onCourse(p.x, p.z)) continue;
    const alongX = ROAD_ZS.includes(p.z);
    const dir = G.rng.chance(0.5) ? 1 : -1;
    if (car.role === 'traffic') {
      car.x = alongX ? p.x : p.x + (dir === 1 ? -3.5 : 3.5);
      car.z = alongX ? p.z + (dir === 1 ? 3.5 : -3.5) : p.z;
      car.heading = alongX ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI);
      car.speed = car.cruise;
      car.wpX = car.x; car.wpZ = car.z; // fresh waypoint next step
    } else {
      car.x = alongX ? p.x : p.x + (dir === 1 ? -8 : 8);
      car.z = alongX ? p.z + (dir === 1 ? 8 : -8) : p.z;
      car.heading = alongX ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI);
      car.speed = 0;
    }
    syncCarMesh(car);
    return true;
  }
  return false;
}

// The crew blocks the route: every traffic and parked car on the course
// moves elsewhere, so the race runs on a clear road and the city stays
// just as busy afterwards.
function clearCourse(G) {
  for (const c of G.cars) {
    if ((c.role === 'traffic' || c.role === 'parked') && onCourse(c.x, c.z)) moveOffCourse(G, c);
  }
}

export function createRaces(G) {
  // The start line: a checkered flag on the sidewalk corner and a magenta
  // ring on the road itself, so the line reads from down the street.
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.6 }),
  );
  pole.position.set(8, 3.5, 8);
  pole.castShadow = true;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#111111' : '#ffffff';
      g.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  const flagMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  flagMesh.position.set(9.6, 5.8, 8);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  flag.add(pole, flagMesh, ring);
  flag.position.set(RACE_START.x, 0, RACE_START.z);
  G.scene.add(flag);

  // The checkpoint beacon: an orange pillar + ring that jumps to the next
  // checkpoint while a race runs (same language as the mission beacon).
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.15;
  beacon.add(pillar, beaconRing);
  beacon.visible = false;
  G.scene.add(beacon);

  return {
    active: null,
    wins: 0,
    races: 0,
    lastResult: null,
    start: RACE_START,
    checkpoints: RACE_CHECKPOINTS,
    panelEl: document.getElementById('racePanel'),
    beacon,
    beaconRing,
    // The player's next checkpoint while a race runs (null otherwise).
    get nextCheckpoint() {
      const a = this.active;
      if (!a || a.cpIdx >= RACE_CHECKPOINTS.length) return null;
      return RACE_CHECKPOINTS[a.cpIdx];
    },
  };
}

// How far a racer has got: finished racers sort above the rest by finish
// time; the rest sort by checkpoints passed, then closeness to the next one.
function racerProgress(G, who) {
  const a = G.races.active;
  if (who === 'player') {
    if (a.finished !== null) return 1e9 - a.finished;
    const cp = RACE_CHECKPOINTS[a.cpIdx];
    return a.cpIdx * 10000 - Math.hypot(G.player.x - cp.x, G.player.z - cp.z);
  }
  if (who.finished !== null) return 1e9 - who.finished;
  const cp = RACE_CHECKPOINTS[who.cpIdx];
  return who.cpIdx * 10000 - Math.hypot(who.car.x - cp.x, who.car.z - cp.z);
}

// The player's live race position (1-3), or 0 when no race is running.
export function racePosition(G) {
  const a = G.races.active;
  if (!a) return 0;
  const mine = racerProgress(G, 'player');
  let pos = 1;
  for (const r of a.rivals) if (racerProgress(G, r) > mine) pos += 1;
  return pos;
}

function updatePanel(G) {
  const R = G.races, a = R.active;
  if (!R.panelEl || !a) return;
  R.panelEl.classList.remove('hidden');
  if (a.countdown > 0) {
    R.panelEl.innerHTML = `<b>STREET RACE</b><span>GET READY… ${Math.ceil(a.countdown)}</span>`;
    return;
  }
  const t = a.time;
  const mm = Math.floor(t / 60);
  const ss = (t % 60).toFixed(1).padStart(4, '0');
  const pos = racePosition(G);
  const suffix = pos === 1 ? 'ST' : pos === 2 ? 'ND' : 'RD';
  const cp = Math.min(a.cpIdx + 1, RACE_CHECKPOINTS.length);
  R.panelEl.innerHTML = `<b>STREET RACE</b><span>POS ${pos}${suffix}/3 · CHECKPOINT ${cp}/${RACE_CHECKPOINTS.length} · ${mm}:${ss}</span>`;
}

// Start a race from the start line. Returns false unless the player is in a
// car, on the play screen, and no race is already running.
export function startRace(G) {
  const R = G.races;
  if (R.active || !G.playerCar || G.screen !== 'play') return false;
  const rivals = RIVALS.map((def, i) => {
    // Rivals line up just behind the start line, facing the first
    // checkpoint — the player starts on pole, so nobody shunts at the gun.
    const car = spawnCar(G, {
      x: RACE_START.x - 8, z: RACE_START.z + (i === 0 ? -3.5 : 3.5),
      heading: Math.PI / 2, role: 'racer', kind: 'sports', color: def.color,
    });
    return { car, cpIdx: 0, finished: null, cruise: def.cruise, lane: def.lane };
  });
  R.active = { cpIdx: 0, rivals, time: 0, countdown: 3, finished: null };
  R.races += 1;
  R.beacon.visible = true;
  clearCourse(G);
  G.hud.notify('STREET RACE', `Beat the rivals around ${RACE_CHECKPOINTS.length} checkpoints — $${RACE_PRIZE_WIN} to the winner`);
  G.audio.jingle();
  updatePanel(G);
  return true;
}

// End the race: pay out by finishing position, record the result for the
// mission system (M7 watches R.wins), and clear the rival cars away.
function endRace(G, reason) {
  const R = G.races, a = R.active;
  if (!a) return;
  const position = racePosition(G);
  let prize = 0;
  if (reason === 'finished') {
    if (position === 1) {
      prize = RACE_PRIZE_WIN;
      G.player.money += prize;
      G.respect?.addRespect(RACE_RESPECT_WIN);
      R.wins += 1;
      G.audio.coin();
      G.hud.notify('RACE WON!', `1st place — +$${prize} and +${RACE_RESPECT_WIN} respect`);
    } else if (position === 2) {
      prize = RACE_PRIZE_SECOND;
      G.player.money += prize;
      G.audio.coin();
      G.hud.notify('2ND PLACE', `+$${prize} — so close`);
    } else {
      G.hud.notify('RACE LOST', 'The rivals took it this time');
    }
  } else if (reason === 'timeout') {
    G.hud.notify('RACE OVER', 'Out of time');
  } else {
    G.hud.notify('RACE ABANDONED', 'You left the race');
  }
  R.lastResult = { position, time: a.time, prize, reason };
  for (const r of a.rivals) {
    G.scene.remove(r.car.mesh);
    const i = G.cars.indexOf(r.car);
    if (i >= 0) G.cars.splice(i, 1);
  }
  R.active = null;
  R.beacon.visible = false;
  if (R.panelEl) R.panelEl.classList.add('hidden');
  G.save();
}

// One rival's drive step: steer at its next checkpoint at its cruise speed,
// sliding along buildings like traffic does when a turn runs wide. Each
// rival holds its own lane of the road (right-hand for one, left for the
// other), so the player can pass on either side without a head-on shunt.
function driveRival(G, r, dt) {
  const car = r.car;
  if (r.finished !== null || car.dead) {
    car.speed = Math.max(0, car.speed - 10 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    syncCarMesh(car);
    return;
  }
  const cp = RACE_CHECKPOINTS[r.cpIdx];
  // Lane offset for this leg (same rule as the traffic AI): eastbound the
  // right-hand lane is the +z side, northbound the +x side. The rival's
  // lane sign picks its side of the road.
  const prev = r.cpIdx === 0 ? RACE_START : RACE_CHECKPOINTS[r.cpIdx - 1];
  const ux = Math.sign(cp.x - prev.x), uz = Math.sign(cp.z - prev.z);
  let offX = 0, offZ = 0;
  if (ux !== 0) offZ = r.lane * ux; else offX = -r.lane * uz;
  const want = Math.atan2(cp.x + offX - car.x, cp.z + offZ - car.z);
  let d = want - car.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  car.heading += clamp(d, -2.4 * dt, 2.4 * dt);
  car.speed += clamp(r.cruise - car.speed, -12 * dt, 9 * dt);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const c = resolveCollisions(car.x, car.z, 2.3, G.city.colliders);
  car.x = c.x; car.z = c.z;
  car.wheels.forEach((w) => { w.rotation.x += (car.speed * dt) / 0.36; });
  syncCarMesh(car);
  if (Math.hypot(car.x - cp.x, car.z - cp.z) < 12) {
    r.cpIdx += 1;
    if (r.cpIdx >= RACE_CHECKPOINTS.length) r.finished = G.races.active.time;
  }
}

// Per-frame race logic: E at the start line starts a race; while one runs,
// drive the rivals, track checkpoints, and end it on a finish, a timeout,
// or the player leaving the car.
export function updateRaces(G, dt) {
  const R = G.races;
  if (G.screen !== 'play') return;
  const a = R.active;
  if (!a) {
    if (G.garage?.menuOpen || G.shops?.menuOpen) return;
    if (!G.playerCar) return;
    const p = G.player;
    if (Math.hypot(p.x - RACE_START.x, p.z - RACE_START.z) < 14) {
      G.hud.hint(`Press E — Street Race: beat 2 rivals, $${RACE_PRIZE_WIN} to the winner`, 0.4);
      if (G.input.take('KeyE')) startRace(G);
    }
    return;
  }
  // Out of the car, or the car wrecked: the race is over.
  if (!G.playerCar || G.playerCar.dead || G.player.onFoot) { endRace(G, 'abandoned'); return; }
  if (a.countdown > 0) {
    a.countdown -= dt;
    // Hold every car on the line until GO.
    G.playerCar.speed = 0;
    for (const r of a.rivals) r.car.speed = 0;
    updatePanel(G);
    if (a.countdown <= 0) {
      G.hud.notify('GO!', '');
      G.audio.blip();
    }
    return;
  }
  a.time += dt;
  for (const r of a.rivals) driveRival(G, r, dt);
  if (a.finished === null) {
    const cp = RACE_CHECKPOINTS[a.cpIdx];
    if (Math.hypot(G.player.x - cp.x, G.player.z - cp.z) < 14) {
      a.cpIdx += 1;
      G.audio.blip();
      if (a.cpIdx >= RACE_CHECKPOINTS.length) a.finished = a.time;
      else G.hud.notify(`CHECKPOINT ${a.cpIdx}/${RACE_CHECKPOINTS.length}`, '');
    }
  }
  // The beacon follows the next checkpoint.
  const next = R.nextCheckpoint;
  R.beacon.visible = !!next;
  if (next) {
    R.beacon.position.set(next.x, 0, next.z);
    const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 240);
    R.beaconRing.scale.setScalar(pulse + 0.3);
  }
  updatePanel(G);
  if (a.finished !== null) { endRace(G, 'finished'); return; }
  if (a.rivals.every((r) => r.finished !== null)) { endRace(G, 'finished'); return; }
  if (a.time > RACE_TIMEOUT) endRace(G, 'timeout');
  void dt;
}
