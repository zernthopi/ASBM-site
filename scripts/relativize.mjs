// Transforme les liens absolus (/club, /_astro/...) en liens relatifs dans dist/,
// pour que la version locale s'ouvre par un simple double-clic sur dist/index.html.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');

async function fichiers(dossier) {
  const sortie = [];
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...(await fichiers(p)));
    else sortie.push(p);
  }
  return sortie;
}

function cible(absolu) {
  const [chemin, suite = ''] = absolu.split(/(?=[?#])/);
  let fichier;
  if (chemin === '/') fichier = 'index.html';
  else if (/\.[a-z0-9]+$/i.test(chemin)) fichier = chemin.slice(1);
  else fichier = chemin.replace(/^\//, '').replace(/\/$/, '') + '.html';
  return { fichier, suite };
}

function relatif(depuis, absolu) {
  const { fichier, suite } = cible(absolu);
  let rel = path.relative(path.dirname(depuis), path.join(DIST, fichier)).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel + suite;
}

let n = 0;
for (const f of await fichiers(DIST)) {
  if (f.endsWith('.html')) {
    let s = await readFile(f, 'utf8');
    // Les préchargements de polices échouent en file:// (CORS) : inutiles hors serveur
    s = s.replace(/<link rel="preload"[^>]*as="font"[^>]*>/g, '');
    s = s.replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g, (_, attr, url) => { n++; return `${attr}="${relatif(f, url)}"`; });
    await writeFile(f, s);
  } else if (f.endsWith('.css')) {
    let s = await readFile(f, 'utf8');
    s = s.replace(/url\((['"]?)(\/(?!\/)[^)'"]*)\1\)/g, (_, q, url) => { n++; return `url(${q}${relatif(f, url)}${q})`; });
    await writeFile(f, s);
  }
}
console.log(`relativize : ${n} liens convertis`);
