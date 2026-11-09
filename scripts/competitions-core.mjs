// Collecte des données de compétition sur l'API publique api.tablesoccer.org,
// commune à l'ITSF (circuit mondial) et à la FFBF (plateforme CORAL, coral.ffbabyfoot.fr).
//
// Module sans dépendance : `collecter(api, aujourdhui)` reçoit une fonction
// api(organisation, chemin) → JSON et renvoie les données prêtes pour le site.
// Chaque partie est indépendante : si l'une échoue, elle vaut null et les autres sont conservées.

export const API = 'https://api.tablesoccer.org';
export const CLUB = 'ASBM';

const TOUR_ITSF = 1; // World Tour
const TOUR_FFBF = 4; // Circuit National (opens loisir, régionaux, nationaux, championnats)
const TOUR_REGION = 7; // Circuit régional Provence-Alpes-Côte d'Azur
const NB_RESULTATS = 6;
const NB_RESULTATS_CLUB = 10;

/** Regroupement des catégories FFBF pour les filtres du site. */
export function groupeFfbf(categorie) {
  if (categorie === 'Open Loisir') return 'loisir';
  if (categorie === 'Open Régional') return 'regional';
  if (categorie === 'Open National' || /world series/i.test(categorie)) return 'national';
  return 'championnat';
}

const propre = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Lien venu de l'API : seulement http(s), sinon vide (bloque « javascript: », « data: »…). */
export const lienSur = (u) => {
  try {
    const url = new URL(String(u ?? '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
};

/** "DOS SANTOS LOTE Miguel" → { prenom: "Miguel", nom: "Dos Santos Lote" } */
export function decouperNom(complet) {
  const mots = propre(complet).split(' ');
  const i = mots.findIndex((m) => m !== m.toUpperCase() || !/\p{L}/u.test(m));
  const nomMots = i === -1 ? mots.slice(0, 1) : mots.slice(0, Math.max(1, i));
  const prenomMots = mots.slice(nomMots.length);
  const casse = (m) => m.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  return { prenom: prenomMots.join(' '), nom: casse(nomMots.join(' ')) };
}

const joueurs = (team) => (team || []).map((j) => [propre(j.first_name), propre(j.last_name), j.country || '', j.code || '']);

function podium(detail) {
  return (detail.competitions || [])
    .map((c) => ({
      nom: propre(c.name),
      podium: (c.standings || []).slice(0, 3).map((s) => ({ rang: s.rank, joueurs: joueurs(s.team) })),
    }))
    .filter((e) => e.podium.some((p) => p.joueurs.length));
}

async function parLots(elements, taille, fn) {
  const sortie = [];
  for (let i = 0; i < elements.length; i += taille) {
    sortie.push(...(await Promise.all(elements.slice(i, i + taille).map(fn))));
  }
  return sortie;
}

// ---------------------------------------------------------------- ITSF

const tournoiItsf = (t) => ({
  code: t.code,
  nom: propre(t.name),
  debut: t.start_on,
  fin: t.end_on,
  ville: t.locality || t.address?.locality || '',
  pays: t.country || '',
  categorie: t.category?.name || '',
  table: t.playground?.name || '',
  lien: lienSur(t.site),
  statut: t.status,
});

async function itsf(api, aujourdhui) {
  const saison = await api('ITSF', `cms.tournaments?tour=${TOUR_ITSF}`);
  const suivante = (saison.seasons || []).find((s) => Number(s.name) === Number(saison.season_name) + 1);
  const saisonSuivante = suivante ? await api('ITSF', `cms.tournaments?tour=${TOUR_ITSF}&season=${suivante.id}`) : {};
  const tous = [...(saison.tournaments || []), ...(saisonSuivante.tournaments || [])];

  const calendrier = tous
    .filter((t) => t.status !== 'finished' && t.end_on >= aujourdhui)
    .sort((a, b) => a.start_on.localeCompare(b.start_on))
    .map(tournoiItsf);

  const termines = tous
    .filter((t) => t.status === 'finished')
    .sort((a, b) => b.end_on.localeCompare(a.end_on))
    .slice(0, NB_RESULTATS);
  const resultats = await parLots(termines, 3, async (t) => ({
    ...tournoiItsf(t),
    epreuves: podium(await api('ITSF', `cms.tournament?tournament=${t.code}`)),
  }));
  return { calendrier, resultats };
}

// ---------------------------------------------------------------- FFBF

async function ffbf(api, aujourdhui) {
  const saison = await api('FFBF', `cms.tournaments?tour=${TOUR_FFBF}`);
  const saisons = [...(saison.seasons || [])].sort((a, b) => a.id - b.id);
  const i = saisons.findIndex((s) => s.id === saison.season);
  const suivante = i >= 0 && saisons[i + 1] ? await api('FFBF', `cms.tournaments?tour=${TOUR_FFBF}&season=${saisons[i + 1].id}`) : {};
  let tous = [...(saison.tournaments || []), ...(suivante.tournaments || [])];

  // Début de saison : on complète les résultats avec la saison précédente.
  if (tous.filter((t) => t.status === 'finished').length < NB_RESULTATS && i > 0) {
    const precedente = await api('FFBF', `cms.tournaments?tour=${TOUR_FFBF}&season=${saisons[i - 1].id}`);
    tous = [...(precedente.tournaments || []).filter((t) => t.status === 'finished'), ...tous];
  }

  // Nom complet des catégories (l'API abrège parfois : « Ch. Régional Individuel »).
  const categories = new Map((saison.categories || []).map((c) => [c.id, c.name]));

  // Région de chaque club organisateur (liste des ligues et de leurs clubs).
  const regions = new Map();
  try {
    for (const r of await api('FFBF', 'cms.members?organization=FFBF')) {
      if (r.type !== 'Region') continue;
      regions.set(r.short_name, { region: r.name, code: r.short_name });
      for (const c of r.members || []) regions.set(c.short_name, { region: r.name, code: r.short_name });
    }
  } catch { /* régions facultatives */ }

  const tournoi = (t) => {
    const categorie = categories.get(t.category?.id) || t.category?.name || '';
    const sigle = t.organization?.short_name || '';
    return {
      code: t.code,
      nom: propre(t.name),
      debut: t.start_on,
      fin: t.end_on,
      ville: t.locality || t.address?.locality || '',
      adresse: propre(t.address?.street),
      pays: t.country || 'FR',
      region: regions.get(sigle)?.region || '',
      codeRegion: regions.get(sigle)?.code || '',
      categorie,
      groupe: groupeFfbf(categorie),
      table: t.playground?.name || '',
      lien: lienSur(t.site),
      info: lienSur(t.info),
      organisateur: { sigle, nom: propre(t.organization?.name) },
      statut: t.status,
    };
  };

  const saisonCourante = (saison.tournaments || []).concat(suivante.tournaments || []);
  const calendrier = saisonCourante
    .sort((a, b) => a.start_on.localeCompare(b.start_on) || a.name.localeCompare(b.name))
    .map(tournoi);

  const termines = tous
    .filter((t) => t.status === 'finished' && t.end_on <= aujourdhui)
    .sort((a, b) => b.end_on.localeCompare(a.end_on))
    .slice(0, NB_RESULTATS);
  const resultats = await parLots(termines, 3, async (t) => ({
    ...tournoi(t),
    epreuves: podium(await api('FFBF', `cms.tournament?tournament=${t.code}`)),
  }));

  return { saison: saison.season_name, saisonId: saison.season, saisons, calendrier, resultats };
}

// ---------------------------------------------------------------- Joueurs du club

async function joueursDuClub(api, saisons, saisonId) {
  const idx = saisons.findIndex((s) => s.id === saisonId);
  const ids = [saisonId, saisons[idx - 1]?.id].filter(Boolean);
  const trouves = new Map();
  const lire = async (tour, saison) => {
    let page = 1, pages = 1;
    do {
      const j = await api('FFBF', `cms.rankings?tour=${tour}&season=${saison}&page=${page}`);
      pages = Math.min(j.pages || 1, 60);
      for (const s of j.standings || [])
        for (const p of s.team || [])
          if ((p.memberships || []).includes(CLUB) && !trouves.has(p.code)) trouves.set(p.code, { code: p.code, ...decouperNom(p.player), pays: p.country || 'FR' });
      page++;
    } while (page <= pages);
  };
  for (const s of ids) {
    await lire(TOUR_REGION, s).catch(() => {});
    await lire(TOUR_FFBF, s).catch(() => {});
  }
  return [...trouves.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

function categoriePrincipale(cats) {
  const liste = (cats || []).filter((c) => c.name);
  const itsf = liste.find((c) => /^(ITSF \d+|World Series|World Cup)/.test(c.name));
  const ffbf = liste.find((c) => c.tour?.organization?.short_name === 'FFBF');
  const autre = liste.find((c) => !/Master Series|Pro Tour/.test(c.name));
  return (itsf || ffbf || autre || liste[0])?.name || '';
}

// Classement de chaque joueur du club, épreuve par épreuve, sur ses tournois des 12 derniers mois.
// (Le détail d'un tournoi ne donne que le podium : on interroge le parcours de chaque joueur.)
async function resultatsDuClub(api, liste, aujourdhui) {
  const parCode = new Map(liste.map((j) => [j.code, j]));
  const limite = new Date(new Date(`${aujourdhui}T12:00:00Z`).getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const tournois = new Map();
  await parLots(liste, 3, async (j) => {
    const stats = await api('FFBF', `cms.player_stats?player=${j.code}`).catch(() => ({}));
    for (const t of stats.tournaments || []) {
      if (!t.code || !t.id || t.start_on > aujourdhui || t.start_on < limite || (t.status && t.status !== 'finished')) continue;
      if (!tournois.has(t.code)) tournois.set(t.code, { ...t, joueursClub: [] });
      tournois.get(t.code).joueursClub.push(j.code);
    }
  });
  const recents = [...tournois.values()].sort((a, b) => b.start_on.localeCompare(a.start_on)).slice(0, NB_RESULTATS_CLUB);
  const sortie = await parLots(recents, 2, async (t) => {
    const d = await api('FFBF', `cms.tournament?tournament=${t.code}`).catch(() => ({}));
    const infos = new Map((d.competitions || []).map((c, i) => [c.id, { ordre: i, equipes: Number(c.teams) || 0 }]));
    const epreuves = new Map();
    for (const code of t.joueursClub) {
      const moi = parCode.get(code);
      const parcours = await api('FFBF', `cms.player_tournament_competitions?player=${code}&tournament=${t.id}`).catch(() => []);
      for (const c of parcours || []) {
        if (!c.rank) continue;
        if (!epreuves.has(c.id)) epreuves.set(c.id, { nom: propre(c.name), ...(infos.get(c.id) || { ordre: 99, equipes: 0 }), classements: new Map() });
        const equipe = [[moi.prenom, moi.nom, moi.pays || 'FR', code], ...joueurs(c.partners)];
        const cle = `${c.rank}:${equipe.map((p) => p[3]).sort().join('+')}`;
        epreuves.get(c.id).classements.set(cle, { rang: c.rank, joueurs: equipe });
      }
    }
    if (!epreuves.size) return null;
    const listeEpreuves = [...epreuves.values()]
      .sort((a, b) => a.ordre - b.ordre)
      .map((e) => ({ nom: e.nom, equipes: e.equipes, classements: [...e.classements.values()].sort((a, b) => a.rang - b.rang) }));
    return {
      code: t.code,
      nom: propre(t.name),
      debut: t.start_on,
      fin: (d.end_at || '').slice(0, 10) || t.start_on,
      ville: t.address?.locality || '',
      pays: t.address?.country || '',
      categorie: categoriePrincipale(t.categories),
      table: t.playground?.name || '',
      lien: lienSur(d.public_url) || `https://app.tablesoccer.org/p/${encodeURIComponent(t.code)}`,
      epreuves: listeEpreuves,
    };
  });
  return sortie.filter(Boolean);
}

// ---------------------------------------------------------------- Point d'entrée

/**
 * @param api        (organisation, chemin) → Promise<JSON>
 * @param aujourdhui "AAAA-MM-JJ"
 * @param options    { journal(message), ajouts: [{ code, prenom, nom }] joueurs du club à ajouter à la main }
 */
export async function collecter(api, aujourdhui, { journal = () => {}, ajouts = [] } = {}) {
  const partie = async (nom, fn) => {
    try { return await fn(); } catch (e) { journal(`${nom} : ${e.message}`); return null; }
  };
  const donneesItsf = await partie('ITSF', () => itsf(api, aujourdhui));
  const donneesFfbf = await partie('FFBF', () => ffbf(api, aujourdhui));
  const club = donneesFfbf
    ? await partie('Joueurs du club', async () => {
        const liste = await joueursDuClub(api, donneesFfbf.saisons, donneesFfbf.saisonId);
        for (const a of ajouts) if (a.code && !liste.some((j) => j.code === a.code)) liste.push({ pays: 'FR', ...a });
        return { sigle: CLUB, joueurs: liste, resultats: await resultatsDuClub(api, liste, aujourdhui) };
      })
    : null;
  return { itsf: donneesItsf, ffbf: donneesFfbf, club };
}
