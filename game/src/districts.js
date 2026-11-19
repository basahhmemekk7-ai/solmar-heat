// The seven named districts of Solmar Bay. The HUD always shows the
// district Kai is in, and crossing into a new one announces it.
export const DISTRICTS = ['Downtown', 'Marina', 'Hills', 'Palm Park', 'Club Row', 'Old Town', 'Docks'];

// The district containing a point: downtown in the middle, the named
// quarters around it — Marina and the Hills along the southern shore,
// Old Town and the Docks in the north, Palm Park and Club Row flanking
// downtown east and west.
export function districtAt(x, z) {
  if (z >= 90) return x >= 0 ? 'Marina' : 'Hills';
  if (z <= -90) return x >= 0 ? 'Docks' : 'Old Town';
  if (x >= 90) return 'Club Row';
  if (x <= -90) return 'Palm Park';
  return 'Downtown';
}

export function createDistricts(G) {
  const el = document.getElementById('district');
  const current = districtAt(G.player.x, G.player.z);
  if (el) el.textContent = current.toUpperCase();
  return { current, el };
}

// Per-frame district logic: announce a new district when the player
// crosses into one, and keep the HUD readout current.
export function updateDistricts(G, dt) {
  const D = G.districts;
  if (G.screen !== 'play') return;
  const d = districtAt(G.player.x, G.player.z);
  if (d !== D.current) {
    D.current = d;
    if (D.el) D.el.textContent = d.toUpperCase();
    G.hud.notify(d.toUpperCase(), 'Solmar Bay');
  }
  void dt;
}
