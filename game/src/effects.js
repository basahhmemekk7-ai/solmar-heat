// Cheap effects: a pooled particle system (sparks, smoke, blood puffs), muzzle-flash
// tracers and car explosions. One THREE.Points cloud, recycled every frame.
import * as THREE from '../vendor/three.module.min.js';

const MAX = 420;

export function createEffects(G) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  points.frustumCulled = false;
  G.scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX; i++) parts.push({ life: 0, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 });
  let cursor = 0;
  const tracers = [];

  function spawn(x, y, z, vx, vy, vz, r, g, b, life) {
    const p = parts[cursor];
    cursor = (cursor + 1) % MAX;
    p.life = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.r = r; p.g = g; p.b = b;
  }

  const fx = {
    burst(G2, x, z, color, n) {
      const c = new THREE.Color(color);
      for (let i = 0; i < n; i++) {
        spawn(x, 1, z, (Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6, c.r, c.g, c.b, 0.5 + Math.random() * 0.4);
      }
    },
    smoke(G2, x, z, dark) {
      const v = dark ? 0.12 : 0.75;
      spawn(x, 0.8, z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5, v, v, v, 1.1);
    },
    explode(G2, x, z) {
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
        const hot = Math.random() < 0.5;
        spawn(x, 0.6, z, Math.sin(a) * sp, 2 + Math.random() * 7, Math.cos(a) * sp, 1, hot ? 0.55 : 0.25, 0.1, 0.7 + Math.random() * 0.6);
      }
      for (let i = 0; i < 14; i++) this.smoke(G2, x, z, true);
      G2.audio.crash();
      G2.shake = 1;
    },
    muzzle(G2, x, z, tx, tz) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 1.4, z),
        new THREE.Vector3(tx, 1.2, tz),
      ]);
      const line = new THREE.Line(g, mat);
      G2.scene.add(line);
      tracers.push({ line, life: 0.07 });
      this.burst(G2, x, z, 0xffe9a8, 3);
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.vy -= 4 * dt;
          if (p.y < 0.05) { p.y = 0.05; p.vy = 0; }
        } else p.y = -50;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          G.scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          tracers[i].line.material.dispose();
          tracers.splice(i, 1);
        }
      }
    },
  };
  return fx;
}
