// Screenshot scenes behind ?shot=chase|city|mission|start (with &seed=N). Each one
// stages the real game — a wanted chase, the city from above, a mission in progress,
// the title screen — then the main loop plays it forward a fixed number of steps
// with a scripted driver, so the same seed always gives the same frame.
import { PLACES, clamp, angleDiff } from './config.js';
import { spawnCar } from './vehicles.js';

function driveAutopilot(G) {
  // Steer the player's car toward a point ahead on its lane, holding ~100 km/h
  // so the patrol cars stay in the frame behind it.
  const car = G.playerCar;
  const tx = -3.5, tz = car.z + 50;
  const want = Math.atan2(tx - car.x, tz - car.z);
  const d = angleDiff(want, car.heading);
  return {
    axes: () => ({ x: clamp(-d * 2.5, -1, 1), y: car.speed < 27 ? 1 : 0 }),
    handbrake: false, sprint: false, firing: false,
    take: () => false,
  };
}

function stageChase(G) {
  // Player in a sports car, 3 stars, helicopter overhead, mission 4 running.
  // Clear the chase route of traffic so the run stays clean.
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if ((c.role === 'traffic' || c.role === 'parked') && Math.abs(c.x) < 14 && c.z > -90 && c.z < 220) {
      G.scene.remove(c.mesh);
      G.cars.splice(i, 1);
    }
  }
  const car = spawnCar(G, { x: -3.5, z: -40, heading: 0, role: 'player', kind: 'sports', color: 0xd23c3c });
  car.speed = 22;
  G.playerCar = car;
  G.player.car = car;
  G.player.onFoot = false;
  G.player.mesh.visible = false;
  G.player.x = car.x; G.player.z = car.z;
  G.missions.index = 3;
  G.missions.startMission(3);
  G.missions.active.stepIdx = 1;
  G.missions.beginStep();
  G.police.setWanted(3);
  // Two patrol cars right on the player's tail for the frame.
  for (const dz of [-24, -38]) {
    const cop = spawnCar(G, { x: -3.5 + (dz === -24 ? 4 : -3), z: -40 + dz, heading: 0, role: 'police' });
    cop.speed = 30;
    G.police.cops.push(cop);
  }
  // Helicopter: ends up behind and above the car after 4 s of drift (0.35 rad/s).
  G.police.heliHeight = 22;
  G.police.heliRadius = 26;
  G.police.heliAngle = -Math.PI / 2 - 1.4;
  // Side-front camera, computed from the car's final spot: player car, cops and
  // helicopter all in one frame.
  const camera = (GG) => {
    const c = GG.playerCar;
    return {
      pos: [c.x + 11, 8.5, c.z + 21],
      look: [c.x - 1, 4, c.z - 13],
    };
  };
  return { steps: 240, input: driveAutopilot(G), camera };
}

function stageCity(G) {
  // High view over downtown: buildings, traffic, palms and the sea beyond.
  const p = G.player;
  p.x = PLACES.park.x; p.z = PLACES.park.z;
  p.heading = Math.PI / 4;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  return {
    steps: 180,
    camera: { pos: [95, 105, -150], look: [-20, 0, 30] },
  };
}

function stageMission(G) {
  // Mission 2: Kai on foot at Lookout Point, the Comet GT and its beacon ahead.
  G.missions.index = 1;
  G.missions.startMission(1);
  const p = G.player;
  p.x = PLACES.lookout.x - 9; p.z = PLACES.lookout.z + 8;
  p.heading = Math.atan2(PLACES.lookout.x - p.x, PLACES.lookout.z - p.z);
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  G.cameraRig.snap(p.x, p.z, p.heading, 0.35);
  return { steps: 90 };
}

function stageStart(G) {
  // Title screen over the city skyline from the beach. The player waits on the
  // sand, far from the mission marker, so no mission starts behind the title.
  G.hud.setContinueVisible(false);
  const p = G.player;
  p.x = 60; p.z = 280;
  p.heading = Math.PI;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  return {
    steps: 30,
    camera: { pos: [30, 9, 318], look: [-10, 10, 60] },
    screen: 'title',
  };
}

export function stageShot(name, G) {
  if (name === 'city') return stageCity(G);
  if (name === 'mission') return stageMission(G);
  if (name === 'start') return stageStart(G);
  return stageChase(G); // default: the cover shot
}
