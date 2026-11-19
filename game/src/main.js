// Solmar Heat — boot, the fixed-step loop, screens and screenshot mode.
// ?seed=N rebuilds the same city; ?shot=chase|city|mission|start stages a scene,
// plays it forward a fixed number of steps and sets window.__shotReady.
import * as THREE from '../vendor/three.module.min.js';
import { STEP, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_HELP, PLACES, REPAIR_COST, BUST_FINE, SAVE_KEY, clamp } from './config.js';
import { createRandom } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { spawnTraffic, spawnParked, updateTraffic, drivePlayerCar, damageCar, spawnCar } from './vehicles.js';
import { spawnPeds, updatePeds, hitPed, scarePeds, spawnPed } from './pedestrians.js';
import { createPlayer, updatePlayer } from './player.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createCameraRig } from './camera.js';
import { createEffects } from './effects.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Math.random() * 4294967296) | 0;
const rng = createRandom(seed);

// --- Renderer, scene, sun-soaked sky ---
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf2c79b, 200, 560);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 10, -20);

// Sky dome: a gradient canvas (blue noon to warm horizon) on a big sphere.
{
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f7fc4');
  grad.addColorStop(0.45, '#8fc3e8');
  grad.addColorStop(0.75, '#f7c98d');
  grad.addColorStop(1, '#ffb37a');
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 16, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
}
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// --- Game context: every system reads and writes this one object ---
const G = {
  scene, camera, renderer, rng,
  cars: [], peds: [], enemies: [],
  player: null, playerCar: null,
  elapsed: 0, shake: 0, screen: SCREEN_TITLE,
  city: null, police: null, missions: null, hud: null, audio: null, input: null, cameraRig: null, effects: null,
};
G.city = buildCity(scene, rng);
G.input = createInput(canvas);
G.audio = createAudio();
G.effects = createEffects(G);
G.player = createPlayer(G, PLACES.start.x, PLACES.start.z);
G.police = createPolice(G);
G.missions = createMissions(G);
G.hud = createHud(G);
G.cameraRig = createCameraRig(G);
G.spawnPed = (x, z) => spawnPed(G, x, z);
G.scarePeds = (x, z, r) => scarePeds(G, x, z, r);
G.pedsHit = (ped, byCar) => hitPed(G, ped, byCar);
G.damageCar = (car, amount) => damageCar(G, car, amount);
G.save = () => saveGame(G);
// 28 cars over 8,640m of road: dense enough that a player on foot can
// flag one down within a minute anywhere in the city (16 left most
// streets empty for minutes at a time), sparse enough that the roads
// never jam.
spawnTraffic(G, 28);
spawnParked(G, 18);
// A few cars always wait near the safehouse, so the first mission starts at once.
spawnCar(G, { x: -6, z: 44, heading: 0, role: 'parked' });
spawnCar(G, { x: 3.5, z: 18, heading: 0, role: 'parked' });
spawnCar(G, { x: 20, z: 63.5, heading: Math.PI / 2, role: 'parked' });
spawnPeds(G, 26);

G.gameOver = function (kind) {
  if (G.screen !== SCREEN_PLAY) return;
  G.screen = SCREEN_OVER;
  G.input.unlock();
  G.audio.setSiren(false);
  G.audio.setEngine(0, false);
  const stats = `Missions ${G.missions.index}/6 · $${Math.floor(G.player.money)} · ${Math.floor(G.elapsed / 60)} min in Solmar Bay`;
  G.hud.setOver(kind, stats);
  G.hud.showScreen(SCREEN_OVER);
  G.overKind = kind;
};

function respawn() {
  const p = G.player;
  if (G.playerCar) { G.playerCar.role = 'parked'; G.playerCar.speed = 0; G.playerCar = null; }
  p.car = null; p.onFoot = true; p.mesh.visible = true;
  const home = G.overKind === 'busted' ? PLACES.policeHQ : PLACES.hospital;
  p.x = home.x; p.z = home.z; p.y = 0; p.health = 100;
  p.money = Math.max(0, p.money - BUST_FINE);
  p.mesh.position.set(p.x, 0, p.z);
  G.police.clearWanted();
  if (G.missions.active) G.missions.failMission(G.overKind === 'busted' ? 'The cops got you' : 'You got wasted');
  G.enemies.length = 0;
  G.cameraRig.snap(p.x, p.z, p.heading, 0.4);
  G.save();
  startPlaying();
}

function startPlaying() {
  G.screen = SCREEN_PLAY;
  G.hud.showScreen('');
  G.audio.ensure();
  if (!G.missions.active && G.missions.index < 6) {
    G.hud.notify('SOLMAR BAY', G.missions.index === 0 ? 'Follow the yellow marker to start your first mission' : `Next mission: ${G.missions.index + 1}/6`);
  }
}

function applySave(d) {
  const p = G.player;
  p.money = d.money ?? 250;
  p.health = d.health ?? 100;
  p.x = d.x ?? PLACES.start.x;
  p.z = d.z ?? PLACES.start.z;
  p.mesh.position.set(p.x, 0, p.z);
  G.elapsed = d.elapsed ?? 0;
  G.missions.index = clamp(d.missionIndex ?? 0, 0, 6);
  G.cameraRig.snap(p.x, p.z, 0, 0.4);
}

// --- One fixed step of the world ---
function stepWorld(dt, driveInput) {
  if (G.screen === SCREEN_PLAY) G.elapsed += dt;
  updatePlayer(G, dt);
  const car = G.playerCar;
  if (car && !car.dead) {
    drivePlayerCar(G, car, driveInput || G.input, dt);
    // The player rides in the car: every system reads the player's position.
    // Driving can wreck the car, which ejects the player and nulls
    // G.playerCar — only sync while the player is still in this car.
    if (G.playerCar === car) {
      G.player.x = car.x;
      G.player.z = car.z;
      G.player.heading = car.heading;
    }
  }
  updateTraffic(G, dt);
  updatePeds(G, dt);
  G.police.update(dt);
  G.missions.update(dt);
  G.effects.update(dt);

  // Pay 'n Spray: repair + lose the cops for $100.
  const p = G.player;
  if (G.screen === SCREEN_PLAY && G.playerCar) {
    const near = Math.hypot(p.x - PLACES.garage.x, p.z - PLACES.garage.z) < 14;
    if (near) {
      G.hud.hint(`Press E — Pay 'n Spray: repair car & lose the cops ($${REPAIR_COST})`, 0.4);
      if (G.input.take('KeyE')) {
        if (p.money >= REPAIR_COST && (G.playerCar.health < 100 || G.police.wanted > 0)) {
          p.money -= REPAIR_COST;
          G.playerCar.health = 100;
          G.police.clearWanted();
          G.audio.coin();
          G.hud.notify("PAY 'N SPRAY", 'Good as new — and the cops lost your trail');
        } else if (p.money < REPAIR_COST) G.hud.hint('Not enough cash', 1.5);
        else G.hud.hint('Car is already in perfect shape', 1.5);
      }
    }
  }
  if (G.screen === SCREEN_PLAY && p.onFoot) {
    const car = p.nearestCar(4.5);
    if (car) G.hud.hint('Press F to enter the car', 0.4);
  }
}

function renderFrame(dt) {
  const p = G.player;
  // The sun follows the player so shadows stay crisp wherever they go.
  sun.position.set(p.x - 90, 130, p.z + 50);
  sun.target.position.set(p.x, 0, p.z);
  sun.target.updateMatrixWorld();
  G.city.water.position.y = -0.4 + Math.sin(G.elapsed * 0.6) * 0.06;
  G.shake = Math.max(0, G.shake - dt * 2.2);
  if (G.screen === SCREEN_TITLE) {
    // Slow orbit over the city behind the title screen.
    const a = G.elapsed * 0.02 + 0.6;
    camera.position.set(Math.cos(a) * 210, 75, Math.sin(a) * 210);
    camera.lookAt(0, 0, 0);
  } else if (G.screen !== SCREEN_OVER) {
    G.cameraRig.update(dt);
  }
  G.audio.update();
  G.audio.setEngine(G.playerCar ? Math.abs(G.playerCar.speed) / 34 : 0, !!G.playerCar);
  G.hud.update(dt);
  renderer.render(scene, camera);
}

// --- Screen flow ---
let prevScreen = SCREEN_TITLE;
function showHelp(from) {
  prevScreen = from;
  G.screen = SCREEN_HELP;
  G.hud.showScreen(SCREEN_HELP);
}
function backFromHelp() {
  G.screen = prevScreen;
  G.hud.showScreen(prevScreen === SCREEN_TITLE ? SCREEN_TITLE : prevScreen === SCREEN_PAUSED ? SCREEN_PAUSED : '');
  if (prevScreen === SCREEN_PLAY) G.audio.ensure();
}

function handleActions() {
  const input = G.input;
  if (input.take('KeyM')) G.audio.toggleMute();
  if (G.screen === SCREEN_TITLE) {
    if (input.take('Enter') || input.take('Space')) {
      const d = loadGame();
      if (d) applySave(d);
      startPlaying();
    } else if (input.take('KeyH')) showHelp(SCREEN_TITLE);
  } else if (G.screen === SCREEN_PLAY) {
    if (input.take('KeyP') || input.take('Escape')) {
      G.screen = SCREEN_PAUSED;
      G.input.unlock();
      G.hud.showScreen(SCREEN_PAUSED);
      G.hud.pauseStats.textContent = `Missions ${G.missions.index}/6 · $${Math.floor(G.player.money)} · ${Math.floor(G.elapsed / 60)} min played`;
    } else if (input.take('KeyH')) showHelp(SCREEN_PLAY);
    else if (input.take('KeyR')) G.hud.hint(`Radio: ${G.audio.nextStation()}`, 2);
  } else if (G.screen === SCREEN_PAUSED) {
    if (input.take('KeyP') || input.take('Escape') || input.take('Enter')) startPlaying();
    else if (input.take('KeyH')) showHelp(SCREEN_PAUSED);
  } else if (G.screen === SCREEN_HELP) {
    if (input.take('KeyH') || input.take('Escape') || input.take('Enter')) backFromHelp();
  } else if (G.screen === SCREEN_OVER) {
    if (input.take('Enter')) respawn();
  }
  // Note: pressed keys are cleared at the end of the frame (see runGame), not
  // here — the world step below still needs one-shot keys like F, E and Space.
}

function runGame(autostart) {
  G.hud.setContinueVisible(hasSave());
  if (autostart) {
    G.screen = SCREEN_PLAY;
    G.hud.showScreen('');
  } else {
    G.hud.showScreen(SCREEN_TITLE);
  }
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, 0.25);
    acc += frameDt;
    last = now;
    handleActions();
    if (G.screen === SCREEN_PLAY) {
      while (acc >= STEP) { stepWorld(STEP); acc -= STEP; }
    } else if (G.screen === SCREEN_TITLE) {
      // The city stays alive behind the title: traffic and pedestrians move.
      while (acc >= STEP) {
        acc -= STEP;
        G.elapsed += STEP;
        updateTraffic(G, STEP);
        updatePeds(G, STEP);
        G.effects.update(STEP);
      }
    } else acc = 0;
    renderFrame(frameDt);
    G.input.clearPressed();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === SCREEN_PLAY) {
      G.screen = SCREEN_PAUSED;
      G.hud.showScreen(SCREEN_PAUSED);
    }
  });
  requestAnimationFrame(frame);
}

// --- Screenshot mode: stage, play forward, paint, signal ready ---
function runShot(name) {
  const cfg = stageShot(name, G);
  G.screen = cfg.screen === 'title' ? SCREEN_TITLE : SCREEN_PLAY;
  G.hud.showScreen(cfg.screen === 'title' ? SCREEN_TITLE : '');
  for (let i = 0; i < cfg.steps; i++) stepWorld(STEP, cfg.input);
  let painted = 0;
  function paint() {
    const cam = typeof cfg.camera === 'function' ? cfg.camera(G) : cfg.camera;
    if (cam) {
      camera.position.set(...cam.pos);
      camera.lookAt(...cam.look);
    } else {
      G.cameraRig.update(0.016);
    }
    sun.position.set(G.player.x - 90, 130, G.player.z + 50);
    sun.target.position.set(G.player.x, 0, G.player.z);
    sun.target.updateMatrixWorld();
    G.hud.update(0.016);
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// --- Buttons and gestures ---
document.getElementById('btnContinue').addEventListener('click', () => {
  const d = loadGame();
  if (d) applySave(d);
  startPlaying();
});
document.getElementById('btnNew').addEventListener('click', () => {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  try { window.sessionStorage.setItem('solmar-autostart', '1'); } catch { /* ignore */ }
  window.location.search = '';
});
for (const id of ['btnHelp', 'btnHelp2']) {
  document.getElementById(id).addEventListener('click', () => showHelp(G.screen === SCREEN_PLAY ? SCREEN_PLAY : G.screen));
}
document.getElementById('btnHelpClose').addEventListener('click', backFromHelp);
document.getElementById('btnResume').addEventListener('click', startPlaying);
document.getElementById('btnSave').addEventListener('click', () => {
  G.save();
  G.hud.hint('Game saved', 2);
});
for (const id of ['btnTitle', 'btnTitle2']) {
  document.getElementById(id).addEventListener('click', () => { window.location.search = ''; });
}
document.getElementById('btnRetry').addEventListener('click', respawn);
window.addEventListener('keydown', () => G.audio.ensure(), { once: true });
window.addEventListener('pointerdown', () => G.audio.ensure(), { once: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Autostart after New Game (set before the reload above).
let autostart = false;
try {
  if (window.sessionStorage.getItem('solmar-autostart') === '1') {
    window.sessionStorage.removeItem('solmar-autostart');
    autostart = true;
  }
} catch { /* ignore */ }

if (shot) runShot(shot);
else runGame(autostart);
