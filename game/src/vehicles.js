// Cars: low-poly meshes built from boxes, arcade driving physics, traffic AI that
// follows the road grid with lane offsets, and car-vs-car / car-vs-building hits.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_XS, ROAD_ZS, CAR_TOP_SPEED, CAR_ACCEL, CAR_BRAKE, CAR_COLORS, clamp, angleDiff } from './config.js';
import { resolveCollisions } from './city.js';

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2836, roughness: 0.2, metalness: 0.6 });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function makeCarMesh(color, kind, role) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const low = kind === 'sports';
  const body = box(1.9, low ? 0.5 : 0.62, 4.3, bodyMat, 0, low ? 0.5 : 0.62, 0);
  const cabin = box(1.7, 0.55, kind === 'van' ? 3.2 : 2.1, kind === 'van' ? bodyMat : glassMat, 0, low ? 0.95 : 1.15, kind === 'van' ? 0 : -0.25);
  g.add(body, cabin);
  g.add(box(0.3, 0.14, 0.1, lightMat, -0.65, 0.62, 2.16));
  g.add(box(0.3, 0.14, 0.1, lightMat, 0.65, 0.62, 2.16));
  g.add(box(1.9, 0.12, 0.08, new THREE.MeshBasicMaterial({ color: 0xcc2222 }), 0, 0.62, -2.16));
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.4], [0.88, 1.4], [-0.88, -1.4], [0.88, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  let bar = null;
  if (role === 'police') {
    bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    red.position.x = -0.28; blue.position.x = 0.28;
    bar.add(red, blue);
    bar.position.set(0, 1.5, -0.2);
    bar.userData.red = red; bar.userData.blue = blue;
    g.add(bar);
  }
  if (kind === 'taxi') g.add(box(0.9, 0.22, 0.4, new THREE.MeshBasicMaterial({ color: 0xffd23f }), 0, 1.52, -0.2));
  return { group: g, wheels, bar };
}

export function spawnCar(G, opts) {
  const kind = opts.kind || G.rng.pick(['sedan', 'sedan', 'sedan', 'sports', 'van', 'taxi']);
  const color = opts.color ?? (opts.role === 'police' ? 0xf2f4f6 : G.rng.pick(CAR_COLORS));
  const { group, wheels, bar } = makeCarMesh(color, kind, opts.role);
  group.position.set(opts.x, 0, opts.z);
  group.rotation.y = opts.heading || 0;
  G.scene.add(group);
  const car = {
    mesh: group, wheels, bar, kind, role: opts.role || 'traffic',
    x: opts.x, z: opts.z, heading: opts.heading || 0, speed: 0, steer: 0,
    health: 100, cruise: G.rng.range(9, 13), wpX: opts.x, wpZ: opts.z,
    stuck: 0, dead: false, color, sirenPhase: G.rng.range(0, 6), crashCd: 0, ramCd: 0,
  };
  G.cars.push(car);
  syncCarMesh(car);
  return car;
}

export function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

function nearestRoadLine(v, lines) {
  let best = lines[0];
  for (const l of lines) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
  return best;
}

// Pick the next waypoint for a traffic car: at an intersection, go straight or turn.
function pickWaypoint(G, car) {
  const h = car.heading;
  const card = Math.round(h / (Math.PI / 2)) % 4; // 0:+Z 1:+X 2:-Z 3:-X (mod 4)
  const dx = [0, 1, 0, -1][((card % 4) + 4) % 4];
  const dz = [1, 0, -1, 0][((card % 4) + 4) % 4];
  const turn = G.rng.chance(0.4) ? (G.rng.chance(0.5) ? 1 : -1) : 0;
  let nx = dx, nz = dz;
  if (turn === 1) { nx = -dz; nz = dx; }       // left
  if (turn === -1) { nx = dz; nz = -dx; }      // right
  const lane = 3.5;
  let tx, tz;
  if (nx !== 0) { // travelling along X on an east-west road (z = road line)
    const road = nearestRoadLine(car.z, ROAD_ZS);
    tz = road + lane * nx; // right-hand lane
    tx = car.x + nx * G.rng.range(45, 70);
  } else {
    const road = nearestRoadLine(car.x, ROAD_XS);
    tx = road - lane * nz;
    tz = car.z + nz * G.rng.range(45, 70);
  }
  car.wpX = clamp(tx, -258, 258);
  car.wpZ = clamp(tz, -258, 258);
}

function carAhead(G, car, range) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  for (const o of G.cars) {
    if (o === car || o.dead) continue;
    const dx = o.x - car.x, dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    if (ahead > 0 && ahead < range && Math.abs(dx * fz - dz * fx) < 3.2) return true;
  }
  // Also stop for the player on foot in the way.
  if (G.player.onFoot) {
    const dx = G.player.x - car.x, dz = G.player.z - car.z;
    const ahead = dx * fx + dz * fz;
    if (ahead > 0 && ahead < range * 0.7 && Math.abs(dx * fz - dz * fx) < 2.5) return true;
  }
  return false;
}

function steerToward(car, tx, tz, dt, rate) {
  const want = Math.atan2(tx - car.x, tz - car.z);
  const d = angleDiff(want, car.heading);
  const maxTurn = rate * dt;
  car.heading += clamp(d, -maxTurn, maxTurn);
  car.steer = clamp(d * 1.5, -0.6, 0.6);
}

function damageCar(G, car, amount) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.dead = true;
    car.speed = 0;
    G.effects.explode(G, car.x, car.z);
    if (car === G.playerCar) G.player.ejectFromWreck();
  }
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.role !== 'traffic' || car.dead) continue;
    const dx = car.wpX - car.x, dz = car.wpZ - car.z;
    if (dx * dx + dz * dz < 64) pickWaypoint(G, car);
    const blocked = carAhead(G, car, 14);
    const target = blocked ? 0 : car.cruise;
    car.speed += clamp(target - car.speed, -18 * dt, 8 * dt);
    steerToward(car, car.wpX, car.wpZ, dt, 2.4);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const c = resolveCollisions(car.x, car.z, 2.2, G.city.colliders);
    car.x = c.x; car.z = c.z;
    car.x = clamp(car.x, -262, 262);
    car.z = clamp(car.z, -262, 262);
    spinWheels(car, dt);
    syncCarMesh(car);
  }
}

function spinWheels(car, dt) {
  const spin = (car.speed * dt) / 0.36;
  car.wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = car.steer;
  });
}

// Arcade driving for the player's car. Returns true if it crashed this step.
export function drivePlayerCar(G, car, input, dt) {
  const axes = input.axes();
  car.crashCd = Math.max(0, car.crashCd - dt);
  const top = car.kind === 'sports' ? CAR_TOP_SPEED * 1.15 : CAR_TOP_SPEED;
  if (axes.y > 0) car.speed += CAR_ACCEL * dt * (car.speed < 0 ? 2.2 : 1);
  else if (axes.y < 0) {
    if (car.speed > 0.5) car.speed -= CAR_BRAKE * dt;
    else car.speed = Math.max(car.speed - CAR_ACCEL * 0.6 * dt, -11);
  } else car.speed -= car.speed * 0.35 * dt;
  if (input.handbrake) car.speed -= car.speed * 1.4 * dt;
  car.speed = clamp(car.speed, -11, top);
  const speed01 = Math.abs(car.speed) / top;
  const maxSteer = 0.6 * (1 - speed01 * 0.55);
  const targetSteer = -axes.x * maxSteer;
  car.steer += clamp(targetSteer - car.steer, -5 * dt, 5 * dt);
  const grip = input.handbrake ? 1.7 : 1;
  car.heading += (car.steer * car.speed * dt / 2.7) * grip;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  if (input.handbrake && Math.abs(car.speed) > 8 && G.rng.chance(0.5)) {
    G.effects.smoke(G, car.x - Math.sin(car.heading) * 1.6, car.z - Math.cos(car.heading) * 1.6);
  }
  let crashed = false;
  const c = resolveCollisions(car.x, car.z, 2.3, G.city.colliders);
  if (c.hit && Math.abs(car.speed) > 4) {
    if (car.crashCd <= 0) {
      damageCar(G, car, Math.abs(car.speed) * 0.9);
      G.audio.crash();
      car.crashCd = 0.6;
    }
    G.shake = Math.min(1, Math.abs(car.speed) / 20);
    car.speed *= 0.35;
    crashed = true;
  }
  car.x = c.x; car.z = c.z;
  car.x = clamp(car.x, -262, 262);
  car.z = clamp(car.z, -262, 262);
  // Car-vs-car shoves.
  for (const o of G.cars) {
    if (o === car || o.dead) continue;
    const dx = car.x - o.x, dz = car.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 21 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (4.6 - d) / 2;
      // Police cars bounce off in the ram block (police.js); shoving the
      // player's car away from them here too would let a swarm pin it.
      if (o.role !== 'police') {
        car.x += (dx / d) * push; car.z += (dz / d) * push;
      }
      if (o.role === 'traffic' || o.role === 'parked') {
        o.x -= (dx / d) * push; o.z -= (dz / d) * push;
        syncCarMesh(o);
      }
      const impact = Math.abs(car.speed) + Math.abs(o.speed || 0);
      if (impact > 6 && car.crashCd <= 0) {
        // Police contact is not general impact damage: the ram block in
        // police.js owns cop damage (one ram a second per cop). Charging
        // it here too would double-tax the player car for every cop touch.
        if (o.role !== 'police') {
          damageCar(G, car, impact * 0.55);
          damageCar(G, o, impact * 0.7);
        }
        G.audio.crash();
        car.crashCd = 0.6;
        G.shake = Math.min(1, impact / 24);
        car.speed *= 0.55;
        crashed = true;
      }
    }
  }
  // Running over pedestrians is a crime (and a bump).
  for (const p of G.peds) {
    if (p.dead) continue;
    const dx = car.x - p.x, dz = car.z - p.z;
    if (dx * dx + dz * dz < 6.5 && Math.abs(car.speed) > 3) {
      G.pedsHit(p, car);
    }
  }
  if (car.health < 30 && car.health > 0 && G.rng.chance(0.3)) {
    G.effects.smoke(G, car.x + Math.sin(car.heading) * 1.8, car.z + Math.cos(car.heading) * 1.8, true);
  }
  spinWheels(car, dt);
  car.mesh.rotation.z = -car.steer * speed01 * 0.09;
  car.mesh.rotation.x = clamp(-axes.y * speed01 * 0.03, -0.04, 0.04);
  syncCarMesh(car);
  return crashed;
}

export function spawnTraffic(G, count) {
  for (let i = 0; i < count; i++) {
    const p = G.city.randomRoadPoint();
    const alongX = G.rng.chance(0.5);
    const dir = G.rng.chance(0.5) ? 1 : -1;
    const car = spawnCar(G, {
      x: alongX ? p.x : p.x + (dir === 1 ? -3.5 : 3.5),
      z: alongX ? p.z + (dir === 1 ? 3.5 : -3.5) : p.z,
      heading: alongX ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI),
      role: 'traffic',
    });
    car.speed = car.cruise;
    pickWaypoint(G, car);
  }
}

export function spawnParked(G, count) {
  for (let i = 0; i < count; i++) {
    const p = G.city.randomRoadPoint();
    const alongX = G.rng.chance(0.5);
    const dir = G.rng.chance(0.5) ? 1 : -1;
    spawnCar(G, {
      x: alongX ? p.x : p.x + (dir === 1 ? -6 : 6),
      z: alongX ? p.z + (dir === 1 ? 6 : -6) : p.z,
      heading: alongX ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI),
      role: 'parked',
    });
  }
}

export { damageCar };
