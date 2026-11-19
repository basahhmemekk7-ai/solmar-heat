// Solmar Bay itself: a sun-soaked grid city drawn once into a ground texture (roads,
// sidewalks, crosswalks, park, beach), instanced pastel buildings with window facades,
// palm trees, street lamps, a marina pier and the sea. Also owns the collision boxes
// and the road helpers every other system drives on.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_XS, ROAD_ZS, ROAD_W, CITY_R, BEACH_Z, WATER_Z, BUILDING_COLORS, PLACES } from './config.js';

const TEX = 1024;
function toPx(v) { return ((v + CITY_R) / (CITY_R * 2)) * TEX; }

// Push a circle out of every building box it overlaps; returns the corrected position.
export function resolveCollisions(x, z, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(x, c.x1));
    const nz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.x0 - r; else if (m === pr) x = c.x1 + r;
        else if (m === pt) z = c.z0 - r; else z = c.z1 + r;
      }
    }
  }
  return { x, z, hit };
}

function facadeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 250; y += 10) {
    for (let x = 5; x < 122; x += 12) {
      g.fillStyle = Math.random() < 0.22 ? '#ffd98a' : '#33455c';
      g.fillRect(x, y, 8, 7);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(rng) {
  const c = document.createElement('canvas');
  c.width = TEX; c.height = TEX;
  const g = c.getContext('2d');
  // Asphalt everywhere, then blocks, park, beach and markings on top.
  g.fillStyle = '#33373d'; g.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < ROAD_XS.length - 1; i++) {
    for (let j = 0; j < ROAD_ZS.length - 1; j++) {
      const x0 = ROAD_XS[i] + ROAD_W / 2, x1 = ROAD_XS[i + 1] - ROAD_W / 2;
      const z0 = ROAD_ZS[j] + ROAD_W / 2, z1 = ROAD_ZS[j + 1] - ROAD_W / 2;
      const isPark = i === 1 && j === 2;
      g.fillStyle = isPark ? '#5da24f' : '#b7bcc4';
      g.fillRect(toPx(x0), toPx(z0), toPx(x1) - toPx(x0), toPx(z1) - toPx(z0));
      g.fillStyle = isPark ? '#6fb85f' : '#a7adb6';
      g.fillRect(toPx(x0 + 4), toPx(z0 + 4), toPx(x1 - 4) - toPx(x0 + 4), toPx(z1 - 4) - toPx(z0 + 4));
      if (isPark) { // park paths
        g.strokeStyle = '#d8c9a3'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(toPx(x0), toPx((z0 + z1) / 2)); g.lineTo(toPx(x1), toPx((z0 + z1) / 2)); g.stroke();
        g.beginPath(); g.moveTo(toPx((x0 + x1) / 2), toPx(z0)); g.lineTo(toPx((x0 + x1) / 2), toPx(z1)); g.stroke();
      }
    }
  }
  // Beach strip and sand.
  g.fillStyle = '#e8d29a'; g.fillRect(0, toPx(BEACH_Z), TEX, TEX - toPx(BEACH_Z));
  g.fillStyle = '#dfc684';
  for (let i = 0; i < 40; i++) g.fillRect(rng.range(0, TEX), toPx(BEACH_Z) + rng.range(0, TEX - toPx(BEACH_Z)), 6, 3);
  // Centre dashes and crosswalks.
  g.fillStyle = '#e8c33c';
  for (const rx of ROAD_XS) for (let z = -CITY_R; z < BEACH_Z; z += 12) g.fillRect(toPx(rx) - 1, toPx(z), 2, 7);
  for (const rz of ROAD_ZS) for (let x = -CITY_R; x < CITY_R; x += 12) g.fillRect(toPx(x), toPx(rz) - 1, 7, 2);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of ROAD_XS) for (const rz of ROAD_ZS) {
    for (let k = -5; k <= 5; k += 2.5) {
      g.fillRect(toPx(rx + k) - 1, toPx(rz - ROAD_W / 2 - 2), 2, 4);
      g.fillRect(toPx(rx - ROAD_W / 2 - 2), toPx(rz + k) - 1, 4, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { texture: t, canvas: c };
}

export function buildCity(scene, rng) {
  const colliders = [];
  const { texture, canvas } = groundTexture(rng);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_R * 2, CITY_R * 2),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sea.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_R * 2 + 400, 320),
    new THREE.MeshStandardMaterial({ color: 0x1f7fb8, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, WATER_Z + 160);
  scene.add(water);

  // Buildings: one instanced box mesh, tinted per instance.
  const spots = [];
  for (let i = 0; i < ROAD_XS.length - 1; i++) {
    for (let j = 0; j < ROAD_ZS.length - 1; j++) {
      const x0 = ROAD_XS[i] + ROAD_W / 2 + 3, x1 = ROAD_XS[i + 1] - ROAD_W / 2 - 3;
      const z0 = ROAD_ZS[j] + ROAD_W / 2 + 3, z1 = ROAD_ZS[j + 1] - ROAD_W / 2 - 3;
      if (i === 1 && j === 2) continue; // park block
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const downtown = Math.hypot(cx, cz) < 110;
      const n = downtown ? 1 : rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const w = n === 1 ? x1 - x0 : (x1 - x0) / n - 2;
        const d = z1 - z0 - (n === 1 ? 0 : 4);
        const bx = n === 1 ? cx : x0 + w / 2 + k * (w + 2);
        const h = downtown ? rng.range(22, 52) : rng.range(7, 20);
        spots.push({ x: bx, z: cz, w, d, h, downtown });
      }
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.85 });
  const buildings = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    pos.set(s.x, 0, s.z); scl.set(s.w, s.h, s.d);
    m4.compose(pos, q, scl);
    buildings.setMatrixAt(i, m4);
    buildings.setColorAt(i, col.setHex(rng.pick(BUILDING_COLORS)));
    colliders.push({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 });
  });
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  scene.add(buildings);

  // Landmark signs: glowing boxes on the club, hospital and police HQ roofs.
  const signMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const signs = [
    { p: PLACES.club, c: 0xff4fd8, s: [16, 2.5, 2] },
    { p: PLACES.hospital, c: 0xff5555, s: [12, 2.5, 2] },
    { p: PLACES.policeHQ, c: 0x4f9dff, s: [12, 2.5, 2] },
  ];
  for (const s of signs) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(...s.s), signMat(s.c));
    sign.position.set(s.p.x, 24, s.p.z);
    scene.add(sign);
  }

  // Palm trees: instanced trunks + foliage.
  const treeSpots = [];
  for (let i = 0; i < 90; i++) {
    const bx = rng.range(-260, 260), bz = rng.range(-260, 255);
    const onRoad = ROAD_XS.some((rx) => Math.abs(bx - rx) < ROAD_W / 2 + 1) || ROAD_ZS.some((rz) => Math.abs(bz - rz) < ROAD_W / 2 + 1);
    if (onRoad) continue;
    if (colliders.some((c) => bx > c.x0 - 2 && bx < c.x1 + 2 && bz > c.z0 - 2 && bz < c.z1 + 2)) continue;
    treeSpots.push({ x: bx, z: bz, s: rng.range(0.8, 1.3) });
  }
  // A dense row along the beach.
  for (let x = -260; x <= 260; x += 14) treeSpots.push({ x: x + rng.range(-3, 3), z: BEACH_Z + 6, s: rng.range(1, 1.4) });
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 4.5, 5);
  trunkGeo.translate(0, 2.25, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 }), treeSpots.length);
  const leafGeo = new THREE.ConeGeometry(2.4, 4.5, 6);
  leafGeo.translate(0, 6, 0);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 1 }), treeSpots.length);
  treeSpots.forEach((t, i) => {
    pos.set(t.x, 0, t.z); scl.set(t.s, t.s, t.s);
    m4.compose(pos, q, scl);
    trunks.setMatrixAt(i, m4);
    leaves.setMatrixAt(i, m4);
  });
  trunks.castShadow = true; leaves.castShadow = true;
  scene.add(trunks, leaves);

  // Street lamps along every road.
  const lampSpots = [];
  for (const rx of ROAD_XS) for (let z = -240; z <= 240; z += 60) lampSpots.push({ x: rx + ROAD_W / 2 + 1, z });
  for (const rz of ROAD_ZS) for (let x = -240; x <= 240; x += 60) lampSpots.push({ x, z: rz + ROAD_W / 2 + 1 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 5);
  poleGeo.translate(0, 3, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 0.6, metalness: 0.5 }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.35, 8, 6);
  headGeo.translate(0, 6.1, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), lampSpots.length);
  lampSpots.forEach((t, i) => {
    pos.set(t.x, 0, t.z); scl.set(1, 1, 1);
    m4.compose(pos, q, scl);
    poles.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles, heads);

  // Marina pier.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 60), pierMat);
  pier.position.set(PLACES.marina.x, 0.4, WATER_Z + 26);
  pier.castShadow = true;
  scene.add(pier);
  for (let i = 0; i < 4; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 6), pierMat);
    post.position.set(PLACES.marina.x + (i % 2 ? 4 : -4), 0.4, WATER_Z + 8 + i * 14);
    scene.add(post);
  }

  function nearestRoadPoint(x, z) {
    let bx = ROAD_XS[0], bz = ROAD_ZS[0];
    for (const rx of ROAD_XS) if (Math.abs(rx - x) < Math.abs(bx - x)) bx = rx;
    for (const rz of ROAD_ZS) if (Math.abs(rz - z) < Math.abs(bz - z)) bz = rz;
    return Math.abs(bx - x) < Math.abs(bz - z) ? { x: bx, z, axis: 'x' } : { x, z: bz, axis: 'z' };
  }
  function randomRoadPoint() {
    if (rng.chance(0.5)) return { x: rng.pick(ROAD_XS), z: rng.range(-250, 250) };
    return { x: rng.range(-250, 250), z: rng.pick(ROAD_ZS) };
  }
  function randomSidewalkPoint() {
    const p = randomRoadPoint();
    const off = ROAD_W / 2 + 2;
    if (Math.abs(p.x - Math.round(p.x / 60) * 60) < 1) p.x += rng.chance(0.5) ? off : -off;
    else p.z += rng.chance(0.5) ? off : -off;
    return p;
  }

  return { colliders, groundCanvas: canvas, water, nearestRoadPoint, randomRoadPoint, randomSidewalkPoint };
}
