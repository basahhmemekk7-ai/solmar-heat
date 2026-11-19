// The chase camera: sits behind the player (or the car), follows the heading, and
// lets the mouse orbit. It eases instead of snapping, and shakes on impacts.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, angleDiff } from './config.js';

export function createCameraRig(G) {
  const rig = {
    yaw: 0, pitch: 0.42,
    pos: new THREE.Vector3(0, 8, -14),
    look: new THREE.Vector3(),
    shakeT: 0,

    update(dt) {
      const p = G.player;
      const car = G.playerCar;
      const look = G.input.takeLook();
      this.yaw -= look.x * 0.0028;
      this.pitch = clamp(this.pitch + look.y * 0.0022, 0.08, 1.1);
      // Ease the camera behind the direction of travel.
      const heading = car ? car.heading : (p.speed > 0.5 ? p.heading : this.yaw);
      let d = angleDiff(heading, this.yaw);
      const follow = car ? 1.6 : 0.9;
      this.yaw += clamp(d, -follow * dt, follow * dt);
      const dist = car ? 10.5 : 7.5;
      const height = car ? 4.2 : 3.4;
      const tx = p.x - Math.sin(this.yaw) * dist * Math.cos(this.pitch);
      const tz = p.z - Math.cos(this.yaw) * dist * Math.cos(this.pitch);
      const ty = (car ? 1.2 : 1.6) + Math.sin(this.pitch) * dist + height * 0.35;
      const k = 1 - Math.pow(0.0015, dt);
      this.pos.x = lerp(this.pos.x, tx, k);
      this.pos.y = lerp(this.pos.y, ty, k);
      this.pos.z = lerp(this.pos.z, tz, k);
      if (this.pos.y < 1.2) this.pos.y = 1.2;
      // Keep the camera out of buildings.
      const c = { x: this.pos.x, z: this.pos.z };
      for (const b of G.city.colliders) {
        if (c.x > b.x0 - 1 && c.x < b.x1 + 1 && c.z > b.z0 - 1 && c.z < b.z1 + 1) {
          this.pos.y = Math.max(this.pos.y, 14);
        }
      }
      const shake = G.shake || 0;
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.35 : 0;
      G.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
      this.look.set(p.x, (car ? 1.4 : 1.5) + p.y, p.z);
      G.camera.lookAt(this.look);
    },
    // Place the camera instantly (spawns, screenshots).
    snap(x, z, yaw, pitch) {
      this.yaw = yaw;
      this.pitch = pitch ?? 0.42;
      const dist = 9;
      this.pos.set(x - Math.sin(yaw) * dist, 5, z - Math.cos(yaw) * dist);
    },
  };
  return rig;
}
