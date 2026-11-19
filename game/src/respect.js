// Respect: the progression ladder. Missions pay +50 respect each (and races
// will too — see races.js); ranks run Street -> Runner -> Wheelman ->
// King of Solmar. The current rank and points show on the HUD and the pause
// screen, and later missions gate on rank (missions.js reads G.respect).
export const RANKS = [
  { name: 'Street', min: 0 },
  { name: 'Runner', min: 100 },
  { name: 'Wheelman', min: 300 },
  { name: 'King of Solmar', min: 600 },
];
export const RESPECT_PER_MISSION = 50;

// Rank index (0-3) for a points total.
export function rankIndex(points) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (points >= RANKS[i].min) idx = i;
  return idx;
}

// Rank name for a points total.
export function rankName(points) {
  return RANKS[rankIndex(points)].name;
}

export function createRespect(G) {
  const R = {
    points: 0,
    get rank() { return rankIndex(this.points); },
    get rankName() { return RANKS[this.rank].name; },
    addRespect(n) { return addRespect(G, n); },
  };
  return R;
}

// Add respect points; on a rank-up, celebrate with a banner + jingle.
export function addRespect(G, n) {
  const R = G.respect;
  const before = R.rank;
  R.points += n;
  const after = R.rank;
  if (after > before) {
    G.audio.jingle();
    G.hud.notify('RANK UP', `You are now a ${R.rankName} — ${R.points} respect`);
  }
  // No hint for a plain gain: the step loop's hints ("Press F to enter the
  // car") overwrite any hint within a frame, while the HUD counter already
  // shows the new total.
  G.save();
  return R.points;
}
