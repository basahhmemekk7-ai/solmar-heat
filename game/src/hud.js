// The HUD: wanted stars, money, health, speed, radio, mission panel, minimap and
// menus. The minimap reuses the city's ground texture as its base map.
import { CITY_R, PLACES } from './config.js';

const $ = (id) => document.getElementById(id);

export function createHud(G) {
  const el = {
    mission: $('mission'), missionTitle: $('missionTitle'), missionText: $('missionText'), missionTimer: $('missionTimer'),
    stars: $('stars'), money: $('money'), healthBar: $('healthBar'), clock: $('clock'),
    speed: $('speed'), radio: $('radio'), hint: $('hint'), notify: $('notify'), wasted: $('wasted'),
    title: $('titleScreen'), pause: $('pauseScreen'), help: $('helpScreen'), over: $('overScreen'),
    overTitle: $('overTitle'), overText: $('overText'), pauseStats: $('pauseStats'),
    briefing: $('briefing'), briefTitle: $('briefTitle'), briefText: $('briefText'),
    btnContinue: $('btnContinue'), map: $('minimap'),
    hudRoot: $('hud'),
  };
  const mctx = el.map.getContext('2d');
  let notifyT = 0, hintT = 0, briefT = 0;
  let lastMoney = -1, lastStars = -1;

  const hud = {
    pauseStats: el.pauseStats,
    notify(title, sub) {
      el.notify.innerHTML = `${title}<small>${sub || ''}</small>`;
      el.notify.style.opacity = 1;
      notifyT = 3;
    },
    hint(text, seconds) {
      el.hint.textContent = text;
      el.hint.classList.remove('hidden');
      hintT = seconds || 2.5;
    },
    showBriefing(title, text) {
      el.briefTitle.textContent = title;
      el.briefText.textContent = text;
      el.briefing.classList.remove('hidden');
      briefT = 6;
    },
    showScreen(name) {
      for (const k of ['title', 'pause', 'help', 'over']) el[k].classList.add('hidden');
      el.briefing.classList.add('hidden');
      // The HUD belongs to gameplay only; menus get a clean frame.
      el.hudRoot.classList.toggle('hidden', name !== '');
      if (name === 'title') el.title.classList.remove('hidden');
      if (name === 'pause') el.pause.classList.remove('hidden');
      if (name === 'help') el.help.classList.remove('hidden');
      if (name === 'over') el.over.classList.remove('hidden');
      el.wasted.classList.add('hidden');
    },
    setContinueVisible(v) { el.btnContinue.style.display = v ? '' : 'none'; },
    setOver(kind, stats) {
      el.overTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
      el.overText.textContent = stats;
      el.wasted.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
      el.wasted.classList.remove('hidden');
    },

    drawMinimap() {
      const S = 196, R = 150; // metres shown across the map
      const p = G.player;
      mctx.clearRect(0, 0, S, S);
      mctx.save();
      mctx.beginPath();
      mctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      mctx.clip();
      // Base map: crop the city's ground canvas around the player, clamped so the
      // circle stays filled even at the city's edge.
      const gc = G.city.groundCanvas;
      const scale = S / (R * 2);
      const src = R * 2 / (CITY_R * 2) * gc.width;
      const px = Math.min(Math.max(((p.x + CITY_R) / (CITY_R * 2)) * gc.width, src / 2), gc.width - src / 2);
      const pz = Math.min(Math.max(((p.z + CITY_R) / (CITY_R * 2)) * gc.height, src / 2), gc.height - src / 2);
      mctx.drawImage(gc, px - src / 2, pz - src / 2, src, src, 0, 0, S, S);
      const toMap = (x, z) => [S / 2 + (x - p.x) * scale, S / 2 + (z - p.z) * scale];
      // Mission marker.
      const mk = G.missions.marker;
      if (mk.visible) {
        const [mx, my] = toMap(mk.x, mk.z);
        const pulse = 5 + 2 * Math.sin(performance.now() / 200);
        mctx.fillStyle = '#ffd23f';
        mctx.beginPath();
        mctx.moveTo(mx, my - pulse); mctx.lineTo(mx + pulse, my); mctx.lineTo(mx, my + pulse); mctx.lineTo(mx - pulse, my);
        mctx.closePath(); mctx.fill();
        mctx.strokeStyle = '#000'; mctx.stroke();
      }
      // Police blips (flashing) and target car.
      for (const c of G.police.cops) {
        if (c.dead) continue;
        const [cx, cy] = toMap(c.x, c.z);
        mctx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff4444' : '#4488ff';
        mctx.beginPath(); mctx.arc(cx, cy, 3.5, 0, Math.PI * 2); mctx.fill();
      }
      const t = G.missions.active?.targetCar;
      if (t && !t.dead) {
        const [tx, ty] = toMap(t.x, t.z);
        mctx.fillStyle = '#ff2222';
        mctx.fillRect(tx - 3, ty - 3, 6, 6);
      }
      for (const e of G.enemies) {
        if (e.dead) continue;
        const [ex, ey] = toMap(e.x, e.z);
        mctx.fillStyle = '#ff2222';
        mctx.beginPath(); mctx.arc(ex, ey, 3, 0, Math.PI * 2); mctx.fill();
      }
      // Pay 'n Spray + safehouse icons.
      for (const [key, color] of [['garage', '#3ddc84'], ['start', '#ffffff']]) {
        const place = PLACES[key];
        const [gx, gy] = toMap(place.x, place.z);
        if (gx > 4 && gx < S - 4 && gy > 4 && gy < S - 4) {
          mctx.fillStyle = color;
          mctx.fillRect(gx - 3, gy - 3, 6, 6);
        }
      }
      // Player arrow, rotated by heading.
      mctx.translate(S / 2, S / 2);
      mctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)));
      mctx.fillStyle = '#fff';
      mctx.strokeStyle = '#000';
      mctx.beginPath();
      mctx.moveTo(0, -8); mctx.lineTo(5.5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5.5, 6);
      mctx.closePath(); mctx.fill(); mctx.stroke();
      mctx.restore();
    },

    update(dt) {
      const p = G.player;
      if (notifyT > 0) { notifyT -= dt; if (notifyT <= 0) el.notify.style.opacity = 0; }
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) el.hint.classList.add('hidden'); }
      if (briefT > 0) { briefT -= dt; if (briefT <= 0) el.briefing.classList.add('hidden'); }
      const stars = G.police.wanted;
      if (stars !== lastStars) {
        lastStars = stars;
        el.stars.innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('');
      }
      if (p.money !== lastMoney) {
        lastMoney = p.money;
        el.money.textContent = `$${Math.floor(p.money)}`;
      }
      el.healthBar.style.width = `${Math.max(0, p.health)}%`;
      const car = G.playerCar;
      const kmh = car ? Math.abs(car.speed) * 3.6 : Math.abs(p.speed) * 3.6;
      el.speed.textContent = String(Math.round(kmh));
      el.radio.textContent = G.audio.stationName;
      // Mission panel.
      const M = G.missions;
      if (M.active || M.job || M.index < 6) {
        el.mission.classList.remove('hidden');
        el.missionTitle.textContent = M.active ? M.active.def.name : (M.job ? 'Delivery Job' : 'Next Mission');
        el.missionText.textContent = M.objectiveText();
        const t = M.active?.timer || M.job?.time || 0;
        if (t > 0 && (M.step?.type === 'driveTo' || M.step?.type === 'survive' || M.job)) {
          el.missionTimer.classList.remove('hidden');
          const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
          el.missionTimer.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
        } else el.missionTimer.classList.add('hidden');
      } else el.mission.classList.add('hidden');
      el.clock.textContent = `Day 1 · ${String(17 + Math.floor(G.elapsed / 3600)).padStart(2, '0')}:${String(Math.floor(G.elapsed / 60) % 60).padStart(2, '0')} · Missions ${M.index}/6`;
      this.drawMinimap();
    },
  };
  return hud;
}
