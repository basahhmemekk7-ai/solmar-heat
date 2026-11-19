// Screenshot scenes behind ?shot=chase|weapons|garage|race (plus the older
// city|mission|start) with &seed=N. Each one stages the real game — a wanted
// chase past a roadblock, the weapon wheel open in a firefight, the garage
// upgrade menu, a street race in full flight — then the main loop plays it
// forward a fixed number of steps with a scripted driver, so the same seed
// always gives the same frame.
import { PLACES, SCREEN_PLAY, clamp, angleDiff } from './config.js';
import { spawnCar } from './vehicles.js';
import { switchWeapon } from './weapons.js';
import { openGarageMenu } from './garage.js';
import { startRace, RACE_START } from './races.js';

function chaseAutopilot(G) {
  // Steer the player's car down the road, holding ~100 km/h so the patrol
  // cars stay in the frame behind it.
  return {
    axes: () => {
      const car = G.playerCar;
      if (!car) return { x: 0, y: 0 };
      const tx = -3.5, tz = car.z + 50;
      const want = Math.atan2(tx - car.x, tz - car.z);
      const d = angleDiff(want, car.heading);
      return { x: clamp(-d * 2.5, -1, 1), y: car.speed < 27 ? 1 : 0 };
    },
    handbrake: false, sprint: false, firing: false,
    take: () => false,
  };
}

function raceAutopilot(G) {
  // Chase the next race checkpoint at ~68 km/h: the rivals launch slower
  // than the player, so holding back keeps the pack bunched in the frame.
  return {
    axes: () => {
      const car = G.playerCar;
      const cp = G.races.nextCheckpoint;
      if (!car || !cp) return { x: 0, y: 0 };
      const want = Math.atan2(cp.x - car.x, cp.z - car.z);
      const d = angleDiff(want, car.heading);
      return { x: clamp(-d * 2.5, -1, 1), y: car.speed < 19 ? 1 : 0 };
    },
    handbrake: false, sprint: false, firing: false,
    take: () => false,
  };
}

function stageChase(G) {
  // Player in a sports car, 3 stars, helicopter overhead, mission 4 running.
  // The wanted level throws a roadblock across the road ahead; the shot is
  // taken while the player still bears down on it, so the frame holds the
  // chase, the roadblock, the helicopter, the wanted stars, the minimap and
  // the mission objective. Clear the chase route of traffic so the run
  // stays clean.
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
  G.player.money = 1250;
  G.respect.points = 150;
  G.missions.index = 3;
  G.missions.startMission(3);
  G.missions.active.stepIdx = 1;
  G.missions.beginStep();
  G.police.setWanted(3);
  // Two patrol cars right on the player's tail for the frame.
  for (const dz of [-24, -32]) {
    const cop = spawnCar(G, { x: -3.5 + (dz === -24 ? 4 : -3), z: -40 + dz, heading: 0, role: 'police' });
    cop.speed = 30;
    G.police.cops.push(cop);
  }
  // Helicopter: ends up ahead of and above the car after 2 s of drift
  // (0.35 rad/s), in the frame above the roadblock.
  G.police.heliHeight = 22;
  G.police.heliRadius = 26;
  G.police.heliAngle = Math.PI / 2 - 0.7;
  // Chase camera behind and above the car, looking down the road: the
  // player car in the foreground, the roadblock across the road ahead of
  // it, the helicopter overhead.
  const camera = (GG) => {
    const c = GG.playerCar;
    return {
      pos: [c.x, 7, c.z - 13],
      look: [c.x, 2.5, c.z + 40],
    };
  };
  // 2 s of driving: the player is still ~20 m short of the roadblock.
  return { steps: 120, input: chaseAutopilot(G), camera };
}

function stageWeapons(G) {
  // Mission 6, combat step: Kai on foot at the Marina with the Vipers
  // closing in, shotgun selected and the weapon wheel open on screen.
  G.missions.index = 5;
  G.missions.startMission(5);
  G.missions.active.stepIdx = 1;
  G.missions.beginStep();
  const p = G.player;
  p.x = PLACES.marina.x - 22; p.z = PLACES.marina.z - 6;
  p.heading = Math.atan2(PLACES.marina.x - p.x, PLACES.marina.z - p.z);
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  p.money = 1200;
  G.respect.points = 350;
  switchWeapon(G, 'shotgun');
  G.cameraRig.snap(p.x, p.z, p.heading, 0.35);
  // The wheel hides 1.2 s after a switch; the camera hook re-opens it at
  // paint time so the shot catches it open.
  const camera = (GG) => {
    const w = GG.weapons;
    w.wheelT = 999;
    if (w.wheelEl) w.wheelEl.classList.remove('hidden');
    const q = GG.player;
    return {
      pos: [q.x - Math.sin(q.heading) * 9, 4.2, q.z - Math.cos(q.heading) * 9],
      look: [q.x + Math.sin(q.heading) * 12, 1.5, q.z + Math.cos(q.heading) * 12],
    };
  };
  return { steps: 150, camera };
}

function stageGarage(G) {
  // Kai's sports car at Pay 'n Spray with the upgrade menu open, mission 8
  // asking for a tune-up: engine and armor already part-bought, so the
  // levels and prices read on the panel.
  const car = spawnCar(G, { x: PLACES.garage.x - 4, z: PLACES.garage.z + 2, heading: Math.PI / 2, role: 'player', kind: 'sports', color: 0xff7a29 });
  G.playerCar = car;
  G.player.car = car;
  G.player.onFoot = false;
  G.player.mesh.visible = false;
  G.player.x = car.x; G.player.z = car.z;
  G.player.money = 2500;
  G.respect.points = 150;
  G.garage.owned.engine = 1;
  G.garage.owned.armor = 1;
  G.missions.index = 7;
  G.missions.startMission(7);
  G.missions.active.stepIdx = 1;
  G.missions.beginStep();
  openGarageMenu(G);
  // The menu sits dead-centre, so aim the camera wide of the car: it reads
  // at the frame's edge beside the panel.
  const camera = () => ({
    pos: [car.x + 2, 7, car.z + 16],
    look: [car.x - 14, 1, car.z - 6],
  });
  return { steps: 30, camera };
}

function stageRace(G) {
  // A street race in full flight, as mission 7: Kai's car off the line at
  // the checkered flag, both rivals on his tail, the orange beacon marking
  // the next checkpoint and the race panel counting position and time.
  G.screen = SCREEN_PLAY; // startRace needs the play screen
  const car = spawnCar(G, { x: RACE_START.x, z: RACE_START.z, heading: Math.PI / 2, role: 'player', kind: 'sports', color: 0xd23c3c });
  G.playerCar = car;
  G.player.car = car;
  G.player.onFoot = false;
  G.player.mesh.visible = false;
  G.player.x = car.x; G.player.z = car.z;
  G.player.money = 850;
  G.respect.points = 150;
  G.missions.index = 6;
  G.missions.startMission(6);
  G.missions.active.stepIdx = 1;
  G.missions.beginStep();
  startRace(G);
  // Clear the pedestrians off the first leg so the frame holds the race,
  // not a jaywalker.
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const q = G.peds[i];
    if (Math.abs(q.z - RACE_START.z) < 12 && q.x > 50 && q.x < 190) {
      G.scene.remove(q.mesh);
      G.peds.splice(i, 1);
    }
  }
  // Low, close side camera from the south sidewalk, centred on the pack:
  // all three cars big in the frame with the city behind them.
  const camera = (GG) => {
    const c = GG.playerCar;
    return { pos: [c.x - 12, 6, c.z + 14], look: [c.x - 12, 2, c.z] };
  };
  // 3 s countdown + 5 s of racing.
  return { steps: 480, input: raceAutopilot(G), camera };
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
  if (name === 'weapons') return stageWeapons(G);
  if (name === 'garage') return stageGarage(G);
  if (name === 'race') return stageRace(G);
  if (name === 'city') return stageCity(G);
  if (name === 'mission') return stageMission(G);
  if (name === 'start') return stageStart(G);
  return stageChase(G); // default: the cover shot
}
