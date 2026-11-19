// Pedestrians: low-poly walkers strolling the sidewalks who scatter when shots are
// fired or a car bears down on them. Hitting one raises the wanted level.
import * as THREE from '../vendor/three.module.min.js';
import { SHIRT_COLORS, clamp } from './config.js';
import { resolveCollisions } from './city.js';

function makePedMesh(shirt, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2c3240, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirtMat);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skinMat);
  head.position.y = 1.62;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pantsMat);
  const legR = legL.clone();
  legL.position.set(-0.15, 0.35, 0); legR.position.set(0.15, 0.35, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirtMat);
  const armR = armL.clone();
  armL.position.set(-0.38, 1.05, 0); armR.position.set(0.38, 1.05, 0);
  g.add(torso, head, legL, legR, armL, armR);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { group: g, legL, legR, armL, armR };
}

export function spawnPed(G, x, z) {
  const skin = G.rng.pick([0xf2c9a0, 0xd9a066, 0x8a5a33, 0xf7d7b5, 0x6b4423]);
  const { group, legL, legR, armL, armR } = makePedMesh(G.rng.pick(SHIRT_COLORS), skin);
  group.position.set(x, 0, z);
  G.scene.add(group);
  const ped = {
    mesh: group, legL, legR, armL, armR,
    x, z, heading: G.rng.range(0, Math.PI * 2), speed: G.rng.range(1, 1.8),
    phase: G.rng.range(0, 6), dead: false, flee: 0, wpX: x, wpZ: z, fallT: 0,
  };
  G.peds.push(ped);
  return ped;
}

export function spawnPeds(G, count) {
  for (let i = 0; i < count; i++) {
    const p = G.city.randomSidewalkPoint();
    spawnPed(G, p.x, p.z);
  }
}

// Everyone within earshot runs from a gunshot or a siren.
export function scarePeds(G, x, z, radius) {
  for (const p of G.peds) {
    if (p.dead) continue;
    const dx = p.x - x, dz = p.z - z;
    if (dx * dx + dz * dz < radius * radius) {
      p.flee = G.rng.range(3, 6);
      p.heading = Math.atan2(dx, dz);
    }
  }
}

export function hitPed(G, ped, byCar) {
  if (ped.dead) return;
  ped.dead = true;
  ped.fallT = 0;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.25;
  G.audio.punch();
  G.effects.burst(G, ped.x, ped.z, 0xcc2222, 8);
  G.police.addWanted(byCar ? 1 : 2, byCar ? 'Pedestrian run over' : 'Pedestrian down');
  scarePeds(G, ped.x, ped.z, 40);
  // A fresh walker eventually replaces the fallen one, elsewhere.
  setTimeout(() => {
    if (G.screen !== 'over') {
      const p = G.city.randomSidewalkPoint();
      if (Math.hypot(p.x - G.player.x, p.z - G.player.z) > 40) spawnPed(G, p.x, p.z);
    }
  }, 8000);
}

export function updatePeds(G, dt) {
  for (const p of G.peds) {
    if (p.dead) { p.fallT += dt; continue; }
    if (p.flee > 0) {
      p.flee -= dt;
      p.speed = 5.2;
    } else {
      p.speed = 1.4;
      const dx = p.wpX - p.x, dz = p.wpZ - p.z;
      if (dx * dx + dz * dz < 9) {
        const w = G.city.randomSidewalkPoint();
        p.wpX = w.x; p.wpZ = w.z;
      }
      const want = Math.atan2(p.wpX - p.x, p.wpZ - p.z);
      let d = want - p.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.heading += clamp(d, -2.5 * dt, 2.5 * dt);
    }
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;
    const c = resolveCollisions(p.x, p.z, 0.5, G.city.colliders);
    p.x = c.x; p.z = c.z;
    p.x = clamp(p.x, -268, 268);
    p.z = clamp(p.z, -268, 268);
    p.phase += dt * p.speed * 2.4;
    const swing = Math.sin(p.phase) * (p.flee > 0 ? 0.8 : 0.5);
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing; p.armR.rotation.x = swing;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
  }
}
