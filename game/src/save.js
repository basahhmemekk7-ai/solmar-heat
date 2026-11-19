// Save / load through localStorage: money, health, mission progress, position,
// the clock, weapons + ammo, garage upgrades and respect. Saves happen after
// every mission and job, and from the pause menu.
import { SAVE_KEY } from './config.js';

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      v: 1, money: Math.floor(p.money), health: Math.round(p.health),
      missionIndex: G.missions.index,
      x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10,
      elapsed: Math.round(G.elapsed),
      weapons: G.weapons ? { current: G.weapons.current, ammo: { ...G.weapons.ammo } } : undefined,
      garage: G.garage ? { ...G.garage.owned } : undefined,
      respect: G.respect ? G.respect.points : 0,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return d;
  } catch { return null; }
}

export function hasSave() { return loadGame() !== null; }
