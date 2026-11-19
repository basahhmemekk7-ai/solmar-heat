// Police roadblocks (wanted 3+) and spike strips (wanted 4+). When the heat
// is high, the police park cars across the road ahead of the player — ram
// through them or find another route — and at 4 stars they lay spike strips
// that shred tires, cut speed and damage the car. Both clear when the heat
// drops or the player leaves them behind, and re-arm after a short cooldown.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_XS, ROAD_ZS, clamp } from './config.js';
import { spawnCar, damageCar } from './vehicles.js';

const BLOCK_AHEAD = 70;   // metres ahead of the player, on their road
const STRIP_AHEAD = 55;
const BLOCK_REARM = 20;   // seconds before a new roadblock after one clears
const STRIP_REARM = 25;
const SPIKE_DAMAGE = 15;
const BLOCK_CAR_HP = 50;  // parked with the engine off: a couple of solid
                          // rams at speed push through, as the mission needs

export function createRoadblocks(G) {
  void G;
  return { blocks: [], strips: [], blockCd: 0, stripCd: 0, stripsHit: 0, blocksSpawned: 0 };
}

// The point on the player's road, `dist` metres ahead of them along their
// direction of travel, plus the road's axis ('x' = north-south road). The
// road follows the player's HEADING, not proximity: at an intersection both
// roads are equally near, but the player is driving along one of them.
function roadAhead(G, dist) {
  const p = G.player;
  if (Math.abs(Math.sin(p.heading)) > Math.abs(Math.cos(p.heading))) {
    // Travelling along X: the nearest east-west road line.
    let bz = ROAD_ZS[0];
    for (const rz of ROAD_ZS) if (Math.abs(rz - p.z) < Math.abs(bz - p.z)) bz = rz;
    const dir = Math.sin(p.heading) >= 0 ? 1 : -1;
    return { x: clamp(p.x + dir * dist, -250, 250), z: bz, axis: 'z' };
  }
  let bx = ROAD_XS[0];
  for (const rx of ROAD_XS) if (Math.abs(rx - p.x) < Math.abs(bx - p.x)) bx = rx;
  const dir = Math.cos(p.heading) >= 0 ? 1 : -1;
  return { x: bx, z: clamp(p.z + dir * dist, -250, 250), axis: 'x' };
}

function spawnRoadblock(G) {
  const RB = G.roadblocks;
  const at = roadAhead(G, BLOCK_AHEAD);
  const cars = [];
  // Three cop cars parked across the road, nose-to-tail sideways, covering
  // the 14m road with a car to spare at each edge.
  for (let i = -1; i <= 1; i++) {
    const off = i * 4.5;
    const x = at.axis === 'x' ? at.x + off : at.x;
    const z = at.axis === 'x' ? at.z : at.z + off;
    const heading = at.axis === 'x'
      ? (i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2)
      : (i % 2 === 0 ? 0 : Math.PI);
    const car = spawnCar(G, { x, z, heading, role: 'blockade', kind: 'sedan' });
    car.health = BLOCK_CAR_HP;
    car.maxHealth = BLOCK_CAR_HP;
    cars.push(car);
  }
  RB.blocks.push({ cars, x: at.x, z: at.z });
  RB.blocksSpawned += 1;
  G.hud.notify('ROADBLOCK AHEAD', 'The police blocked the road — ram it or go around');
  G.audio.blip();
}

function buildStripMesh() {
  const g = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.15, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
  );
  strip.position.y = 0.08;
  g.add(strip);
  const spikeGeo = new THREE.ConeGeometry(0.12, 0.35, 5);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(spikeGeo, spikeMat);
    s.position.set(-3 + i * 0.85, 0.25, 0);
    g.add(s);
  }
  return g;
}

function spawnSpikeStrip(G) {
  const at = roadAhead(G, STRIP_AHEAD);
  const mesh = buildStripMesh();
  mesh.position.set(at.x, 0, at.z);
  // The strip is 7m long along X: it spans a north-south road as built,
  // and rotates 90 degrees for an east-west one.
  mesh.rotation.y = at.axis === 'x' ? 0 : Math.PI / 2;
  G.scene.add(mesh);
  G.roadblocks.strips.push({ x: at.x, z: at.z, mesh, cd: 0 });
  G.hud.notify('SPIKE STRIP AHEAD', 'The police laid spikes on the road');
  G.audio.blip();
}

function removeBlock(G, block) {
  for (const car of block.cars) {
    G.scene.remove(car.mesh);
    const j = G.cars.indexOf(car);
    if (j >= 0) G.cars.splice(j, 1);
  }
}

// Remove every roadblock and spike strip (heat fully cleared).
export function clearRoadblocks(G) {
  const RB = G.roadblocks;
  if (!RB) return;
  for (const b of RB.blocks) removeBlock(G, b);
  for (const s of RB.strips) G.scene.remove(s.mesh);
  RB.blocks.length = 0;
  RB.strips.length = 0;
}

// Per-frame roadblock logic: spawn at 3+/4+ stars, flash the parked light
// bars, trigger spike strips under the player's car, and clear everything
// when the heat drops or the player leaves it behind.
export function updateRoadblocks(G, dt) {
  const RB = G.roadblocks;
  if (G.screen !== 'play') return;
  RB.blockCd = Math.max(0, RB.blockCd - dt);
  RB.stripCd = Math.max(0, RB.stripCd - dt);
  const wanted = G.police.wanted;
  const p = G.player;

  // Roadblocks at 3+ stars.
  if (wanted >= 3 && RB.blocks.length === 0 && RB.blockCd <= 0) spawnRoadblock(G);
  for (let i = RB.blocks.length - 1; i >= 0; i--) {
    const b = RB.blocks[i];
    // Wrecked blockade cars come off the road.
    b.cars = b.cars.filter((car) => {
      if (car.dead) {
        G.scene.remove(car.mesh);
        const j = G.cars.indexOf(car);
        if (j >= 0) G.cars.splice(j, 1);
        return false;
      }
      return true;
    });
    const far = Math.hypot(p.x - b.x, p.z - b.z) > 130;
    if (wanted < 3 || far || b.cars.length === 0) {
      removeBlock(G, b);
      RB.blocks.splice(i, 1);
      RB.blockCd = BLOCK_REARM;
    }
  }
  // Flash the light bars on the parked blockade cars.
  for (const b of RB.blocks) {
    for (const car of b.cars) {
      if (car.bar) {
        const on = Math.floor(performance.now() / 180 + car.sirenPhase) % 2 === 0;
        car.bar.userData.red.visible = on;
        car.bar.userData.blue.visible = !on;
      }
    }
  }

  // Spike strips at 4+ stars.
  if (wanted >= 4 && RB.strips.length === 0 && RB.stripCd <= 0) spawnSpikeStrip(G);
  for (let i = RB.strips.length - 1; i >= 0; i--) {
    const s = RB.strips[i];
    s.cd = Math.max(0, s.cd - dt);
    const car = G.playerCar;
    if (car && !car.dead && s.cd <= 0 && Math.hypot(car.x - s.x, car.z - s.z) < 4.5) {
      car.speed *= 0.35;
      damageCar(G, car, SPIKE_DAMAGE);
      s.cd = 3;
      RB.stripsHit += 1;
      G.hud.notify('SPIKE STRIP!', 'Your tires are shredded');
      G.audio.crash();
      G.shake = 0.6;
    }
    const far = Math.hypot(p.x - s.x, p.z - s.z) > 120;
    if (wanted < 4 || far) {
      G.scene.remove(s.mesh);
      RB.strips.splice(i, 1);
      RB.stripCd = STRIP_REARM;
    }
  }
}
