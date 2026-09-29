// Met à jour les données de la page Compétitions avant chaque build :
//  - calendrier et résultats ITSF (circuit mondial) ;
//  - calendrier et résultats FFBF (Circuit National : opens loisir, régionaux, nationaux, championnats) ;
//  - joueurs licenciés au club et leurs derniers classements.
// Source unique : l'API publique api.tablesoccer.org (utilisée par tablesoccer.org et coral.ffbabyfoot.fr).
// En cas d'échec réseau, les fichiers existants sont conservés : le site se construit quand même.
//
//   node scripts/maj-competitions.mjs                  mise à jour depuis l'API
//   node scripts/maj-competitions.mjs --depuis x.json  écrit les fichiers depuis une collecte sauvegardée
import { readFile, writeFile } from 'node:fs/promises';
import { API, collecter } from './competitions-core.mjs';
import { preparerDrapeaux, codesPays } from './drapeaux.mjs';

const fichier = (nom) => new URL(`../src/data/${nom}`, import.meta.url);
const SOURCE_ITSF = 'https://www.tablesoccer.org/tournaments';
const SOURCE_FFBF = 'https://coral.ffbabyfoot.fr/tournaments/';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(organisation, chemin) {
  const entetes = { 'Content-Type': 'application/json', 'X-Organization': organisation, 'X-Locale': organisation === 'ITSF' ? 'en' : 'fr' };
  for (let essai = 1; ; essai++) {
    try {
      const r = await fetch(`${API}/${chemin}`, { headers: entetes, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`${chemin} : HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (essai >= 2) throw e;
      await pause(1500);
    }
  }
}

const ecrireJson = (nom, donnees) => writeFile(fichier(nom), JSON.stringify(donnees, null, 1) + '\n');

async function ecrire(d) {
  const maj = d.maj || new Date().toISOString();
  const bilan = [];
  if (d.itsf) {
    await ecrireJson('itsf-calendrier.json', { maj, source: SOURCE_ITSF, tournois: d.itsf.calendrier });
    await ecrireJson('itsf-resultats.json', { maj, source: SOURCE_ITSF, tournois: d.itsf.resultats });
    bilan.push(`ITSF ${d.itsf.calendrier.length} à venir / ${d.itsf.resultats.length} résultats`);
  }
  if (d.ffbf) {
    await ecrireJson('ffbf-calendrier.json', { maj, source: SOURCE_FFBF, saison: d.ffbf.saison, tournois: d.ffbf.calendrier });
    await ecrireJson('ffbf-resultats.json', { maj, source: SOURCE_FFBF, tournois: d.ffbf.resultats });
    bilan.push(`FFBF ${d.ffbf.calendrier.length} tournois / ${d.ffbf.resultats.length} résultats`);
  }
  if (d.club) {
    await ecrireJson('club-resultats.json', { maj, source: SOURCE_FFBF, sigle: d.club.sigle, joueurs: d.club.joueurs, tournois: d.club.resultats });
    bilan.push(`club ${d.club.joueurs.length} joueurs / ${d.club.resultats.length} tournois`);
  }
  const drapeaux = await preparerDrapeaux(
    codesPays(d.itsf?.calendrier, d.itsf?.resultats, d.ffbf?.resultats, d.club?.resultats),
  ).catch(() => 0);
  if (drapeaux) bilan.push(`${drapeaux} drapeau(x) ajouté(s)`);
  return bilan;
}

async function principal() {
  const i = process.argv.indexOf('--depuis');
  if (i > 0) {
    const bilan = await ecrire(JSON.parse(await readFile(process.argv[i + 1], 'utf8')));
    console.log(`Compétitions (collecte sauvegardée) : ${bilan.join(', ')}.`);
    return;
  }
  const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const ajouts = JSON.parse(await readFile(fichier('joueurs-club-ajouts.json'), 'utf8').catch(() => '{"joueurs":[]}')).joueurs || [];
  const erreurs = [];
  const d = await collecter(api, aujourdhui, { journal: (m) => erreurs.push(m), ajouts });
  const bilan = await ecrire(d);
  if (bilan.length) console.log(`Compétitions : ${bilan.join(', ')}.`);
  for (const e of erreurs) console.warn(`Compétitions : mise à jour partielle impossible (${e}). Données précédentes conservées.`);
}

principal().catch(async (e) => {
  const cal = JSON.parse(await readFile(fichier('itsf-calendrier.json'), 'utf8').catch(() => '{}'));
  console.warn(`Compétitions : mise à jour impossible (${e.message}). Données conservées du ${cal.maj || '?'}.`);
});
