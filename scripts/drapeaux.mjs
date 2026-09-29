// Prépare les drapeaux utilisés par la page Compétitions, hébergés sur le site (aucune requête externe).
// Source : paquet flag-icons (licence MIT). Les drapeaux simples restent en SVG optimisé ;
// les drapeaux très détaillés (armoiries : Espagne, Mexique…) sont convertis en petite image WebP.
// Le manifeste src/data/drapeaux.json indique au site quel fichier utiliser pour chaque pays.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE = new URL('../node_modules/flag-icons/flags/4x3/', import.meta.url);
const CIBLE = new URL('../public/drapeaux/', import.meta.url);
const MANIFESTE = new URL('../src/data/drapeaux.json', import.meta.url);
const ALIAS = { UK: 'gb', EN: 'gb-eng', SC: 'gb-sct', WA: 'gb-wls' };
const TAILLE_MAX_SVG = 4096;

export async function preparerDrapeaux(codes) {
  const manifeste = JSON.parse(await readFile(MANIFESTE, 'utf8').catch(() => '{}'));
  await mkdir(CIBLE, { recursive: true });
  let optimiser = null, sharp = null;
  try { optimiser = (await import('svgo')).optimize; } catch { /* facultatif */ }
  try { sharp = (await import('sharp')).default; } catch { /* facultatif */ }

  let ajoutes = 0;
  for (const code of new Set(codes)) {
    if (!code || manifeste[code]) continue;
    const nom = ALIAS[code] || code.toLowerCase();
    let svg;
    try { svg = await readFile(new URL(`${nom}.svg`, SOURCE), 'utf8'); } catch { continue; }
    if (optimiser) svg = optimiser(svg, { multipass: true }).data;
    if (Buffer.byteLength(svg) <= TAILLE_MAX_SVG || !sharp) {
      await writeFile(new URL(`${nom}.svg`, CIBLE), svg);
      manifeste[code] = `${nom}.svg`;
    } else {
      await sharp(Buffer.from(svg), { density: 200 })
        .resize(72, 54)
        .webp({ quality: 90 })
        .toFile(fileURLToPath(new URL(`${nom}.webp`, CIBLE)));
      manifeste[code] = `${nom}.webp`;
    }
    ajoutes++;
  }
  const trie = Object.fromEntries(Object.entries(manifeste).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFESTE, JSON.stringify(trie, null, 1) + '\n');
  return ajoutes;
}

/** Tous les codes pays présents dans les données de compétition. */
export function codesPays(...listes) {
  const codes = new Set(['FR']);
  for (const liste of listes)
    for (const t of liste || []) {
      if (t.pays) codes.add(t.pays);
      for (const e of t.epreuves || [])
        for (const p of [...(e.podium || []), ...(e.classements || [])])
          for (const j of p.joueurs || []) if (j[2]) codes.add(j[2]);
    }
  return [...codes];
}
