// Kai Marlow on foot: a low-poly character with a walk cycle, camera-relative movement,
// stealing and exiting cars, and simple combat (punch up close, pistol at range).
import * as THREE from '../vendor/three.module.min.js';
import { WALK_SPEED, SPRINT_SPEED, clamp } from './config.js';
import { resolveCollisions } from './city.js';
import { syncCarMesh } from './vehicles.js';
import { fireWeapon } from './weapons.js';
import { applyUpgrades } from './garage.js';

export function createPlayer(G, x, z) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e6fd8, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2c3240, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.36), jacket);
  torso.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
  head.position.y = 1.68;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
  cap.position.y = 1.9;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), jeans);
  const legR = legL.clone();
  legL.position.set(-0.16, 0.36, 0); legR.position.set(0.16, 0.36, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.66, 0.2), jacket);
  const armR = armL.clone();
  armL.position.set(-0.42, 1.08, 0); armR.position.set(0.42, 1.08, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.42, 0.78, 0.25);
  g.add(torso, head, cap, legL, legR, armL, armR, gun);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.position.set(x, 0, z);
  G.scene.add(g);

  const player = {
    mesh: g, legL, legR, armL, armR, gun,
    x, z, heading: 0, speed: 0, phase: 0,
    health: 100, money: 250, onFoot: true, car: null,
    shootCd: 0, punchCd: 0, jumpV: 0, y: 0, hurtT: 0, ejectGrace: 0,
  };

  player.enterCar = function (car) {
    if (!car || car.dead) return false;
    const wasTraffic = car.role === 'traffic';
    const wasParked = car.role === 'parked';
    car.role = 'player';
    player.car = car;
    player.onFoot = false;
    player.mesh.visible = false;
    G.playerCar = car;
    // Kai's garage tune (engine/armor/paint) goes onto every car he drives.
    if (G.garage) applyUpgrades(G, car);
    if (wasTraffic) {
      // The driver bails and runs.
      const p = G.city.randomSidewalkPoint();
      const driver = G.spawnPed(car.x + 2, car.z + 2);
      driver.flee = 5;
      driver.heading = Math.atan2(p.x - car.x, p.z - car.z);
      G.police.addWanted(1, 'Car stolen');
      G.hud.notify('CAR STOLEN', 'The cops noticed. Lose them!');
    } else if (wasParked) {
      // parked car: quiet theft, no heat unless police are watching
      if (G.police.nearestCopDist() < 45) G.police.addWanted(1, 'Car stolen');
    }
    G.audio.blip();
    return true;
  };

  player.exitCar = function () {
    if (!player.car) return;
    const car = player.car;
    car.role = 'parked';
    car.speed = 0;
    player.car = null;
    player.onFoot = true;
    player.mesh.visible = true;
    const side = 2.6;
    player.x = car.x + Math.cos(car.heading) * side;
    player.z = car.z - Math.sin(car.heading) * side;
    player.heading = car.heading;
    G.playerCar = null;
    syncCarMesh(car);
  };

  player.ejectFromWreck = function () {
    if (!player.car) return;
    const car = player.car;
    player.car = null;
    player.onFoot = true;
    player.mesh.visible = true;
    player.x = car.x + 3; player.z = car.z + 3;
    player.health -= 35;
    // A few seconds to get up before the cops close in: they crawl, and
    // the bust timer waits, while this grace runs out.
    player.ejectGrace = 3;
    G.playerCar = null;
    G.hud.notify('CAR DESTROYED', 'Get out and run!');
    if (player.health <= 0) G.gameOver('wasted');
  };

  player.nearestCar = function (range) {
    let best = null, bd = range * range;
    for (const c of G.cars) {
      if (c.dead || c.role === 'police') continue;
      const dx = c.x - player.x, dz = c.z - player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = c; }
    }
    return best;
  };

  player.hurt = function (amount) {
    if (G.screen !== 'play') return;
    player.health -= amount;
    player.hurtT = 0.4;
    if (player.health <= 0) {
      player.health = 0;
      G.gameOver('wasted');
    }
  };

  return player;
}

// Aim point in the world: straight ahead of the camera at ground level.
function aimPoint(G) {
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  const t = dir.y < -0.05 ? -G.camera.position.y / dir.y : 60;
  const p = G.camera.position.clone().add(dir.multiplyScalar(Math.min(t, 60)));
  return { x: p.x, z: p.z };
}

export function updatePlayer(G, dt) {
  const p = G.player;
  const input = G.input;
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.ejectGrace = Math.max(0, p.ejectGrace - dt);

  if (!p.onFoot) {
    // Driving: F steps out of the car.
    if (input.take('KeyF')) p.exitCar();
    return;
  }

  // Camera-relative movement.
  const axes = input.axes();
  const camYaw = G.cameraRig.yaw;
  const mx = Math.sin(camYaw) * axes.y + Math.cos(camYaw) * axes.x;
  const mz = Math.cos(camYaw) * axes.y - Math.sin(camYaw) * axes.x;
  const moving = Math.abs(mx) > 0.01 || Math.abs(mz) > 0.01;
  const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  if (moving) {
    const want = Math.atan2(mx, mz);
    let d = want - p.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.heading += clamp(d, -10 * dt, 10 * dt);
    p.speed = speed;
    p.x += Math.sin(p.heading) * speed * dt;
    p.z += Math.cos(p.heading) * speed * dt;
  } else p.speed = 0;

  // Jump.
  if (input.take('Space') && p.y <= 0) p.jumpV = 5.2;
  if (p.y > 0 || p.jumpV !== 0) {
    p.jumpV -= 14 * dt;
    p.y += p.jumpV * dt;
    if (p.y <= 0) { p.y = 0; p.jumpV = 0; }
  }

  const c = resolveCollisions(p.x, p.z, 0.6, G.city.colliders);
  p.x = c.x; p.z = c.z;
  p.x = clamp(p.x, -268, 268);
  p.z = clamp(p.z, -268, 268);
  // Shoved by cars.
  for (const car of G.cars) {
    if (car.dead) continue;
    const dx = p.x - car.x, dz = p.z - car.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 6.5) {
      const d = Math.sqrt(d2) || 0.01;
      p.x = car.x + (dx / d) * 2.6;
      p.z = car.z + (dz / d) * 2.6;
      // A police car never runs the player down: cops arrest, they don't kill.
      // (Fast traffic still hurts — jaywalking into it stays dangerous.)
      if (Math.abs(car.speed) > 6 && car.role !== 'player' && car.role !== 'police') {
        p.hurt(Math.abs(car.speed) * 1.5);
        G.audio.crash();
      }
    }
  }

  // Enter / exit cars.
  if (input.take('KeyF')) {
    const car = p.nearestCar(4.5);
    if (car) p.enterCar(car);
    else G.hud.hint('No car nearby', 1.2);
  }

  // Combat: punch up close, current weapon at range (see weapons.js).
  // The pistol drops a Viper in two hits: the finale is a gunfight, and
  // three hits per Viper left the player trading against five guns for too
  // long. (The punch stays at 34.)
  if (input.firing) {
    const target = aimPoint(G);
    p.heading = Math.atan2(target.x - p.x, target.z - p.z);
    if (p.punchCd <= 0) {
      const close = G.enemies.find((e) => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 2.6)
        || G.peds.find((q) => !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < 2.2);
      if (close) {
        p.punchCd = 0.45;
        p.armR.rotation.x = -2.2;
        G.audio.punch();
        G.effects.burst(G, close.x, close.z, 0xffffff, 5);
        if (close.health !== undefined) G.missions.damageEnemy(close, 34);
        else G.pedsHit(close, false);
      } else if (p.shootCd <= 0) {
        fireWeapon(G, target);
      }
    }
  }

  // Walk cycle.
  p.phase += dt * (2 + p.speed * 1.6);
  const swing = p.speed > 0.1 ? Math.sin(p.phase) * 0.65 : 0;
  p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
  p.armL.rotation.x = -swing * 0.8;
  if (p.punchCd <= 0.25) p.armR.rotation.x = swing * 0.8;
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.heading;
  // Slow health regen out of danger.
  if (G.police.wanted === 0 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 2 * dt);
}
