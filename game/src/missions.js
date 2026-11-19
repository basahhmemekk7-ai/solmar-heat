// The story: six missions for Kai Marlow, each a list of steps (drive somewhere,
// steal a car, ram a rival, survive the police, fight a gang). A beacon marks the
// current objective; finishing a mission pays out and unlocks the next. After the
// finale, timed delivery jobs keep the city paying.
import * as THREE from '../vendor/three.module.min.js';
import { PLACES, clamp } from './config.js';
import { spawnCar, syncCarMesh, damageCar } from './vehicles.js';
import { spawnPed } from './pedestrians.js';

export const MISSIONS = [
  {
    name: 'First Fare', reward: 150, start: PLACES.start,
    briefing: 'Lena needs a ride to Club Mirage, and she pays in cash. Get wheels and pick her up at Palm Park.',
    steps: [
      { type: 'enterCar', text: 'Get in a car' },
      { type: 'goto', x: PLACES.park.x, z: PLACES.park.z, r: 12, text: 'Pick up Lena at Palm Park' },
      { type: 'driveTo', x: PLACES.club.x, z: PLACES.club.z, r: 14, text: 'Drive Lena to Club Mirage' },
    ],
  },
  {
    name: 'Hot Wheels', reward: 250, start: PLACES.warehouse,
    briefing: 'The Fixer wants a Comet GT, no questions asked. One is parked at Lookout Point. Take it and bring it to his yard.',
    steps: [
      { type: 'enterTargetCar', text: 'Steal the Comet GT at Lookout Point', spawn: { x: PLACES.lookout.x, z: PLACES.lookout.z, kind: 'sports', color: 0xd23c3c } },
      { type: 'driveTo', x: PLACES.fixerYard.x, z: PLACES.fixerYard.z, r: 14, text: "Deliver the Comet GT to the Fixer's Yard" },
    ],
  },
  {
    name: 'Tail Job', reward: 300, start: PLACES.club,
    briefing: "Rico's courier is running product through your streets. Ram his car off the road — then shake the heat.",
    steps: [
      { type: 'enterCar', text: 'Get in a car — Rico is leaving the club' },
      { type: 'chase', text: "Ram Rico's car until it stops", spawn: { x: PLACES.club.x + 10, z: PLACES.club.z } },
      { type: 'escape', text: 'Lose the cops' },
    ],
  },
  {
    name: 'The Drop', reward: 400, start: PLACES.fixerYard,
    briefing: 'A package for the Marina, and the buyer will not wait. Two stars of heat are already on you. Go.',
    steps: [
      { type: 'enterCar', text: 'Get in a car — the clock is running' },
      { type: 'driveTo', x: PLACES.marina.x, z: PLACES.marina.z, r: 14, time: 150, text: 'Deliver the package to the Marina', wanted: 2 },
      { type: 'escape', text: 'Lose the cops' },
    ],
  },
  {
    name: 'Getaway', reward: 500, start: PLACES.warehouse,
    briefing: 'The job went loud. The whole Solmar Bay force is coming, helicopter and all. Survive, then get home.',
    steps: [
      { type: 'enterCar', text: 'Get in a car — they are already here' },
      { type: 'survive', seconds: 90, wanted: 3, text: 'Survive the manhunt' },
      { type: 'driveTo', x: PLACES.start.x, z: PLACES.start.z, r: 14, text: 'Get back to the Safehouse' },
    ],
  },
  {
    name: 'King of Solmar', reward: 600, start: PLACES.start,
    briefing: 'The Vipers want the city. End it at the Marina — then drive up to the Lookout and take your view.',
    steps: [
      { type: 'goto', x: PLACES.marina.x, z: PLACES.marina.z, r: 20, text: 'Meet the Vipers at the Marina' },
      { type: 'combat', x: PLACES.marina.x, z: PLACES.marina.z, count: 5, text: 'Take down the Vipers (0/5)' },
      { type: 'driveTo', x: PLACES.lookout.x, z: PLACES.lookout.z, r: 14, text: 'Drive to Lookout Point' },
    ],
  },
];

export function createMissions(G) {
  // Beacon: a glowing pillar + ground ring marking the current objective.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(pillar, ring);
  beacon.visible = false;
  G.scene.add(beacon);

  const M = {
    index: 0,
    active: null,
    job: null,
    jobTimer: 20,
    marker: { x: 0, z: 0, visible: false },

    get def() { return this.active ? this.active.def : null; },
    get step() { return this.active ? this.active.def.steps[this.active.stepIdx] : null; },

    objectiveText() {
      if (this.active) {
        const s = this.step;
        if (s.type === 'combat') {
          const left = G.enemies.filter((e) => !e.dead).length;
          return `Take down the Vipers (${s.count - left}/${s.count})`;
        }
        return s.text;
      }
      if (this.job) return `Delivery job: reach the marker ($${this.job.reward})`;
      if (this.index < MISSIONS.length) return `Go to the yellow marker: ${MISSIONS[this.index].name}`;
      return 'Free roam — explore Solmar Bay';
    },

    beginStep() {
      const s = this.step;
      if (!s) return;
      this.active.timer = s.time || s.seconds || 0;
      if (s.wanted) G.police.setWanted(s.wanted);
      if (s.type === 'enterTargetCar' && s.spawn) {
        this.active.targetCar = spawnCar(G, { x: s.spawn.x, z: s.spawn.z, heading: 0, role: 'parked', kind: s.spawn.kind, color: s.spawn.color });
        this.active.targetCar.health = 200; // the prize car is tough
      }
      if (s.type === 'chase' && s.spawn) {
        this.active.targetCar = spawnCar(G, { x: s.spawn.x, z: s.spawn.z, heading: Math.PI, role: 'target', kind: 'sports', color: 0x222831 });
        this.active.targetCar.speed = 10;
        G.police.setWanted(1);
      }
      if (s.type === 'combat') this.spawnEnemies(s.x, s.z, s.count);
      if (s.type === 'survive') G.police.setWanted(s.wanted || 3);
      G.hud.notify(this.active.def.name.toUpperCase(), s.text);
    },

    spawnEnemies(x, z, count) {
      G.enemies.length = 0;
      for (let i = 0; i < count; i++) {
        const ex = x + G.rng.range(-18, 18), ez = z + G.rng.range(-18, 18);
        const ped = spawnPed(G, ex, ez);
        // Re-skin the walker as a Viper: red shirt, armed, hostile.
        ped.mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.9 });
        ped.health = 100;
        ped.shootCd = G.rng.range(0.5, 2);
        ped.isEnemy = true;
        G.peds.splice(G.peds.indexOf(ped), 1);
        G.enemies.push(ped);
      }
    },

    damageEnemy(e, dmg) {
      if (e.dead) return;
      e.health -= dmg;
      if (e.health <= 0) {
        e.dead = true;
        e.mesh.rotation.x = -Math.PI / 2;
        e.mesh.position.y = 0.25;
        G.effects.burst(G, e.x, e.z, 0xcc2222, 10);
        G.audio.punch();
      }
    },

    startMission(i) {
      const def = MISSIONS[i];
      this.active = { def, stepIdx: 0, timer: 0, targetCar: null };
      G.hud.showBriefing(def.name, def.briefing);
      G.audio.jingle();
      this.beginStep();
    },

    completeMission() {
      const def = this.active.def;
      G.player.money += def.reward;
      G.audio.coin();
      G.hud.notify('MISSION COMPLETE', `${def.name} — +$${def.reward}`);
      this.index += 1;
      this.active = null;
      if (this.index >= MISSIONS.length) {
        G.hud.notify('STORY COMPLETE', 'You are the King of Solmar. Free roam unlocked.');
        G.audio.jingle();
      }
      G.save();
    },

    failMission(reason) {
      G.hud.notify('MISSION FAILED', reason);
      this.active = null;
      // The mission stays available: drive back to its marker to retry.
    },

    update(dt) {
      const p = G.player;
      // Update the target chase car.
      const t = this.active?.targetCar;
      if (t && !t.dead && this.step?.type === 'chase') {
        if (t.health <= 20) {
          t.speed = Math.max(0, t.speed - 20 * dt);
        } else {
          // Flee: waypoint away from the player on the road grid.
          const dx = t.x - p.x, dz = t.z - p.z;
          if (Math.hypot(t.wpX - t.x, t.wpZ - t.z) < 12) {
            const away = Math.atan2(dx, dz) + G.rng.range(-0.5, 0.5);
            const np = G.city.nearestRoadPoint(t.x + Math.sin(away) * 80, t.z + Math.cos(away) * 80);
            t.wpX = clamp(np.x, -255, 255); t.wpZ = clamp(np.z, -255, 255);
          }
          const want = Math.atan2(t.wpX - t.x, t.wpZ - t.z);
          let d = want - t.heading;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          t.heading += clamp(d, -2.2 * dt, 2.2 * dt);
          t.speed += clamp(17 - t.speed, -10 * dt, 9 * dt);
          t.x += Math.sin(t.heading) * t.speed * dt;
          t.z += Math.cos(t.heading) * t.speed * dt;
          t.wheels.forEach((w) => { w.rotation.x += (t.speed * dt) / 0.36; });
          syncCarMesh(t);
        }
      }

      // Enemies shoot and advance.
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = p.x - e.x, dz = p.z - e.z;
        const dist = Math.hypot(dx, dz);
        e.shootCd -= dt;
        if (dist > 8) {
          e.heading = Math.atan2(dx, dz);
          e.x += Math.sin(e.heading) * 2.6 * dt;
          e.z += Math.cos(e.heading) * 2.6 * dt;
          e.phase += dt * 6;
          const s = Math.sin(e.phase) * 0.6;
          e.legL.rotation.x = s; e.legR.rotation.x = -s;
          e.mesh.position.set(e.x, 0, e.z);
          e.mesh.rotation.y = e.heading;
        }
        if (dist < 38 && e.shootCd <= 0) {
          e.shootCd = G.rng.range(0.9, 1.8);
          G.audio.shot();
          G.effects.muzzle(G, e.x, e.z, p.x, p.z);
          if (G.rng.chance(0.4)) p.hurt(8);
        }
      }

      // Beacon + marker follow the current objective.
      let mx = 0, mz = 0, show = false;
      if (this.active) {
        const s = this.step;
        if (s.x !== undefined) { mx = s.x; mz = s.z; show = true; }
        else if (s.type === 'enterTargetCar' && this.active.targetCar) { mx = this.active.targetCar.x; mz = this.active.targetCar.z; show = true; }
        else if (s.type === 'chase' && t) { mx = t.x; mz = t.z; show = true; }
        else if (s.type === 'combat') { const alive = G.enemies.find((e) => !e.dead); if (alive) { mx = alive.x; mz = alive.z; show = true; } }
      } else if (this.job) {
        mx = this.job.x; mz = this.job.z; show = true;
      } else if (this.index < MISSIONS.length) {
        mx = MISSIONS[this.index].start.x; mz = MISSIONS[this.index].start.z; show = true;
      }
      this.marker = { x: mx, z: mz, visible: show };
      beacon.visible = show;
      if (show) {
        beacon.position.set(mx, 0, mz);
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 240);
        ring.scale.setScalar(pulse + 0.3);
      }

      // Start the next mission by reaching its marker.
      if (!this.active && this.index < MISSIONS.length) {
        const s = MISSIONS[this.index].start;
        if (Math.hypot(p.x - s.x, p.z - s.z) < 10) this.startMission(this.index);
      }

      // Free-roam delivery jobs after the story.
      if (!this.active && this.index >= MISSIONS.length) {
        if (!this.job) {
          this.jobTimer -= dt;
          if (this.jobTimer <= 0) {
            const pt = G.city.randomRoadPoint();
            this.job = { x: pt.x, z: pt.z, time: 90, reward: G.rng.int(80, 160) };
            G.hud.notify('DELIVERY JOB', `Reach the marker in 90s — $${this.job.reward}`);
          }
        } else {
          this.job.time -= dt;
          if (Math.hypot(p.x - this.job.x, p.z - this.job.z) < 12) {
            p.money += this.job.reward;
            G.audio.coin();
            G.hud.notify('JOB DONE', `+$${this.job.reward}`);
            this.job = null;
            this.jobTimer = 25;
            G.save();
          } else if (this.job.time <= 0) {
            G.hud.notify('JOB EXPIRED', 'Too slow — another job will come');
            this.job = null;
            this.jobTimer = 20;
          }
        }
      }

      // Active mission step logic.
      if (!this.active) return;
      const s = this.step;
      if (this.active.timer > 0) {
        this.active.timer -= dt;
        if (this.active.timer <= 0 && (s.type === 'driveTo' || s.type === 'survive')) {
          if (s.type === 'driveTo') { this.failMission('Out of time'); return; }
        }
      }
      const done = (() => {
        switch (s.type) {
          case 'goto': case 'driveTo': return Math.hypot(p.x - s.x, p.z - s.z) < s.r;
          case 'enterCar': return !p.onFoot;
          case 'enterTargetCar': return p.car === this.active.targetCar;
          case 'chase': return t && t.health <= 20 && Math.hypot(p.x - t.x, p.z - t.z) < 14;
          case 'escape': return G.police.wanted === 0;
          case 'survive': return this.active.timer <= 0;
          case 'combat': return G.enemies.every((e) => e.dead);
          default: return false;
        }
      })();
      if (done) {
        G.audio.blip();
        // Chase aftermath: the heat arrives.
        if (s.type === 'chase') G.police.setWanted(2);
        this.active.stepIdx += 1;
        if (this.active.stepIdx >= this.active.def.steps.length) this.completeMission();
        else this.beginStep();
      }
    },
  };
  return M;
}
