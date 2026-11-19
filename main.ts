// Solmar Heat — the entry program (Node 22, standard library only).
//
// The game is plain static files under game/ (game/index.html plus its ES modules
// and one vendored three.js build), playable offline in desktop Chrome. This program
// hands it in: it copies game/ and screenshots/ beside this file into the output
// directory and writes /output/dossier.json with the kit's buildDossier, so the
// judge reads exactly what the scorer rebuilds. It writes the same bytes on every
// run: no timestamps, no randomness, no network.
//
// Run it outside the grader with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repo, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repo, 'screenshots'))) {
  cpSync(join(repo, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps (the kit's reference/gate.json): text_max_bytes is the only
// one that shapes the bytes; the others refuse an entry the scorer would refuse.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
