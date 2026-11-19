// The Solmar Bay Police: a 1-5 star wanted level, patrol cars that hunt the player
// down the road grid, a helicopter from 3 stars up, and busted / escape rules.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_XS, ROAD_ZS, clamp, angleDiff } from './config.js';
import { spawnCar, syncCarMesh, damageCar } from './vehicles.js';
import { resolveCollisions } from './city.js';

export function createPolice(G) {
  const heliGroup = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22344d, roughness: 0.4, metalness: 0.5 });
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 4.2), bodyMat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 3.4), bodyMat);
  tail.position.set(0, 0.2, -3.4);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 0.8;
  const spot = new THREE.SpotLight(0xfff2b0, 900, 90, 0.45, 0.5, 1.2);
  spot.position.set(0, -0.5, 0);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -20;
  cone.rotation.x = Math.PI;
  heliGroup.add(heliBody, tail, rotor, cone, spot);
  heliGroup.visible = false;
  G.scene.add(heliGroup);
  spot.target.position.set(0, 0, 0);
  G.scene.add(spot.target);

  const police = {
    wanted: 0,
    cops: [],
    heliOn: false,
    heliAngle: 0,
    heliRadius: 26,
    heliHeight: 42,
    unseenT: 0,
    bustT: 0,
    seenT: 0,

    addWanted(n, reason) {
      if (G.screen !== 'play') return;
      const before = this.wanted;
      this.wanted = clamp(this.wanted + n, 0, 5);
      if (this.wanted > before) {
        G.hud.notify('★'.repeat(this.wanted) + ' WANTED', reason || 'The police are after you');
        G.audio.blip();
      }
      this.unseenT = 0;
    },
    setWanted(n) {
      this.wanted = clamp(n, 0, 5);
      this.unseenT = 0;
      if (n > 0) G.hud.notify('★'.repeat(n) + ' WANTED', 'Lose the cops!');
    },
    clearWanted() {
      this.wanted = 0;
      this.unseenT = 0;
      this.bustT = 0;
      for (const c of this.cops) { G.scene.remove(c.mesh); G.cars.splice(G.cars.indexOf(c), 1); }
      this.cops = [];
      this.heliOn = false;
      heliGroup.visible = false;
      G.audio.setSiren(false);
    },
    nearestCopDist() {
      let best = Infinity;
      for (const c of this.cops) best = Math.min(best, Math.hypot(c.x - G.player.x, c.z - G.player.z));
      return best;
    },
    shotFired(x, z) {
      // A shot near police, or in the open with any heat, draws attention.
      if (this.nearestCopDist() < 60 || this.wanted > 0) this.addWanted(1, 'Shots fired');
      G.scarePeds(x, z, 45);
    },

    spawnCop() {
      // Spawn on a road behind the player's direction of travel, out of sight.
      const p = G.player;
      const angle = Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) + Math.PI + G.rng.range(-0.6, 0.6);
      const d = G.rng.range(55, 80);
      const near = G.city.nearestRoadPoint(p.x + Math.sin(angle) * d, p.z + Math.cos(angle) * d);
      const car = spawnCar(G, {
        x: clamp(near.x, -255, 255), z: clamp(near.z, -255, 255),
        heading: Math.atan2(p.x - near.x, p.z - near.z), role: 'police',
      });
      car.cruise = 20;
      this.cops.push(car);
      return car;
    },

    update(dt) {
      const p = G.player;
      const wantCops = this.wanted === 0 ? 0 : this.wanted + 1;
      while (this.cops.length < wantCops) this.spawnCop();
      while (this.cops.length > wantCops) {
        const c = this.cops.pop();
        G.scene.remove(c.mesh);
        G.cars.splice(G.cars.indexOf(c), 1);
      }
      // Helicopter from 3 stars.
      this.heliOn = this.wanted >= 3;
      heliGroup.visible = this.heliOn;
      G.audio.setSiren(this.cops.length > 0);
      if (this.heliOn) {
        this.heliAngle += dt * 0.35;
        const hx = p.x + Math.cos(this.heliAngle) * this.heliRadius;
        const hz = p.z + Math.sin(this.heliAngle) * this.heliRadius;
        heliGroup.position.set(hx, this.heliHeight, hz);
        heliGroup.lookAt(p.x, 0, p.z);
        rotor.rotation.y += dt * 22;
        spot.target.position.set(p.x, 0, p.z);
      }

      let anySeen = false;
      // Closest live cop: only it closes in on an on-foot player.
      let nearD = Infinity;
      for (const c of this.cops) if (!c.dead) nearD = Math.min(nearD, Math.hypot(c.x - p.x, c.z - p.z));
      for (const cop of this.cops) {
        if (cop.dead) continue;
        const dx = p.x - cop.x, dz = p.z - cop.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 55) anySeen = true;
        // Chase: steer at the player, ramming speed when close.
        const want = Math.atan2(dx, dz);
        const d = angleDiff(want, cop.heading);
        const top = p.onFoot ? 17 : 26 + this.wanted * 1.5;
        let target = dist < 6 ? top * 0.6 : top;
        let holding = false;
        if (p.onFoot) {
          // On foot the player is arrested, not run down: ease off as the
          // cop closes in and stop beside the player, so the bust timer
          // can run instead of the player dying under the wheels. Only
          // the nearest cop closes in; the rest hold a ~15m perimeter
          // instead of piling onto the player and blocking the road.
          if (dist > nearD + 0.01 && dist < 15) { target = 0; holding = true; }
          else if (dist <= 3.5) target = 0;
          else if (dist < 12) target = Math.min(target, 5);
          // Fresh out of a wreck, the player gets a moment to get up: the
          // cops crawl in instead of arriving at full chase speed.
          if (p.ejectGrace > 0) target = Math.min(target, 4);
        }
        cop.speed += clamp(target - cop.speed, -22 * dt, 14 * dt);
        cop.heading += clamp(d, -2.6 * dt, 2.6 * dt);
        cop.steer = clamp(d * 1.4, -0.6, 0.6);
        cop.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.z += Math.cos(cop.heading) * cop.speed * dt;
        cop.crashCd = Math.max(0, cop.crashCd - dt);
        cop.ramCd = Math.max(0, cop.ramCd - dt);
        const c = resolveCollisions(cop.x, cop.z, 2.3, G.city.colliders);
        if (c.hit && Math.abs(cop.speed) > 6 && cop.crashCd <= 0) {
          damageCar(G, cop, Math.abs(cop.speed) * 0.7);
          cop.crashCd = 0.8;
        }
        cop.x = c.x; cop.z = c.z;
        cop.x = clamp(cop.x, -262, 262);
        cop.z = clamp(cop.z, -262, 262);
        // Ram the player's car.
        const pc = G.playerCar;
        if (pc && !pc.dead) {
          const rx = cop.x - pc.x, rz = cop.z - pc.z;
          const rd2 = rx * rx + rz * rz;
          if (rd2 < 20 && rd2 > 0.01) {
            const rd = Math.sqrt(rd2);
            // The cop bounces off the player's car; the player's car is
            // never pushed, so a swarm cannot pin it from all sides and
            // stall the game (each cop's shove alone outweighs the car's
            // own motion while it is slow).
            const push = 4.5 - rd;
            cop.x += (rx / rd) * push; cop.z += (rz / rd) * push;
            // A ram lands at most once a second per cop: without a cooldown
            // the damage ticks every step, and two cops shred a healthy car
            // in under two seconds of contact.
            if (Math.abs(cop.speed) > 8 && cop.ramCd <= 0) {
              // A ram's bite scales with the COP's speed, so at chase
              // speeds — cops doing 28 m/s to keep up with a fleeing
              // player — each hit dealt 7 HP and two cops shredded the
              // car before it could finish the chase, even when the
              // player outran them on every straight. 0.15 keeps the
              // ram a real threat (4.2 HP at 28 m/s; a stopped car at
              // 1 star still dies in ~35s) without making a fast chase
              // unwinnable by itself.
              damageCar(G, pc, Math.abs(cop.speed) * 0.15);
              G.audio.crash();
              G.shake = Math.min(1, Math.abs(cop.speed) / 22);
              cop.speed *= 0.5;
              cop.ramCd = 1.0;
            }
            syncCarMesh(pc);
          }
        }
        // Stuck against a building? Reverse out, or respawn near the player.
        // (A cop holding the on-foot perimeter is parked on purpose, not stuck.)
        if (Math.abs(cop.speed) < 1.5 && dist > 12 && !holding) cop.stuck += dt; else cop.stuck = 0;
        if (cop.stuck > 2.5) {
          cop.speed = -6;
          cop.heading += Math.PI * 0.5;
          cop.stuck = 0;
        }
        if (dist > 190) { // lost the player: reposition closer
          const near = G.city.nearestRoadPoint(p.x + G.rng.range(-40, 40), p.z + G.rng.range(-40, 40));
          cop.x = clamp(near.x, -255, 255); cop.z = clamp(near.z, -255, 255);
          cop.heading = Math.atan2(p.x - cop.x, p.z - cop.z);
        }
        // Flashing light bar.
        if (cop.bar) {
          const on = Math.floor(performance.now() / 180 + cop.sirenPhase) % 2 === 0;
          cop.bar.userData.red.visible = on;
          cop.bar.userData.blue.visible = !on;
        }
        cop.wheels.forEach((w, i) => {
          w.rotation.x += (cop.speed * dt) / 0.36;
          if (i < 2) w.rotation.y = cop.steer;
        });
        syncCarMesh(cop);
      }
      // Remove wrecks.
      this.cops = this.cops.filter((c) => {
        if (c.dead) { G.scene.remove(c.mesh); G.cars.splice(G.cars.indexOf(c), 1); return false; }
        return true;
      });

      // Busted: on foot, a cop sitting on top of the player. Not while the
      // player is still getting up from a wreck (see ejectGrace).
      if (this.wanted > 0 && p.onFoot && p.ejectGrace <= 0) {
        if (this.nearestCopDist() < 3.5 && p.speed < 2) {
          this.bustT += dt;
          if (this.bustT > 0.8) G.hud.hint('RUN! The police are grabbing you!', 0.5);
          if (this.bustT > 2.2) G.gameOver('busted');
        } else this.bustT = 0;
      } else this.bustT = 0;

      // Escape: unseen for a while, stars drop one at a time (heli keeps you seen).
      if (this.wanted > 0) {
        if (anySeen || this.heliOn) { this.unseenT = 0; this.seenT += dt; }
        else {
          this.unseenT += dt;
          if (this.unseenT > 14) {
            this.wanted -= 1;
            this.unseenT = 0;
            G.hud.notify(this.wanted > 0 ? '★'.repeat(this.wanted) : 'YOU LOST THEM', this.wanted > 0 ? 'Heat cooling down' : 'Clean getaway');
            if (this.wanted === 0) this.clearWanted();
          }
        }
      }
    },
  };
  return police;
}
