// Données et libellés partagés par la page Compétitions et la page d'accueil.
import { getCollection } from 'astro:content';
import club from '../data/club.json';
import ffbfCalendrier from '../data/ffbf-calendrier.json';
import drapeaux from '../data/drapeaux.json';
import tables from '../data/tables.json';
import { aujourdhui, isoDate, FORMATS } from './format';

/** Classe de couleur d'une catégorie de tournoi (ITSF ou FFBF). */
export function classeCategorie(nom: string) {
  if (/world series/i.test(nom)) return 'ws';
  if (/ITSF (500|750|1000)|World Cup|Champions League/i.test(nom)) return 'i500';
  if (/ITSF 250/i.test(nom)) return 'i250';
  if (nom === 'Open Loisir') return 'loisir';
  if (nom === 'Open Régional') return 'regional';
  if (nom === 'Open National') return 'national';
  if (/championnat|coupe/i.test(nom)) return 'championnat';
  return 'autre';
}

const COURTS: Record<string, string> = {
  'Championnat Régional Individuel': 'Régional individuel',
  'Championnat Régional Club': 'Régional clubs',
  'Championnats de France Individuels': 'France individuels',
  'Championnats de France des Clubs': 'France clubs',
  'Coupe de France des Clubs': 'Coupe de France',
  'World Series Bonzini': 'World Series',
};
/** Libellé court pour les pastilles (le nom du tournoi précise déjà le reste). */
export const libelleCategorie = (nom: string) => COURTS[nom] ?? nom;

/** Fichier du drapeau d'un pays (manifeste généré par scripts/drapeaux.mjs), ou null. */
export function fichierDrapeau(code: string | null | undefined) {
  if (!code) return null;
  const f = (drapeaux as Record<string, string>)[code.toUpperCase()];
  return f ? `/drapeaux/${f}` : null;
}

type Marque = { image?: string; texte?: string; illustration?: boolean; modele?: string; statut?: string };

/** Vignette d'une marque de table : image, mot (ex. « MULTI ») ou illustration générique. */
export function infosTable(nom: string | null | undefined) {
  const marque = (tables.marques as Record<string, Marque>)[nom || ''] ?? (tables.defaut as Marque);
  return { nom: nom || '', ...marque, illustration: Boolean(marque.illustration) };
}
/** Nom affiché d'une marque de table. */
export const libelleTable = (nom: string) => (nom === 'Other' || !nom ? 'Autre table' : nom);
/** Identifiant sans espace pour les filtres : "Ullrich Kicker" → "ullrich-kicker". */
export const slugTable = (nom: string) =>
  (nom || 'autre').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Marques présentes dans une liste, triées par nombre de tournois. */
export function marquesPresentes(liste: { table: string }[]) {
  const compte = new Map<string, number>();
  for (const t of liste) compte.set(t.table || 'Other', (compte.get(t.table || 'Other') || 0) + 1);
  return [...compte.entries()]
    .sort((a, b) => (a[0] === 'Other' ? 1 : b[0] === 'Other' ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])))
    .map(([nom, nombre]) => ({ nom, nombre, slug: slugTable(nom) }));
}

/** "1er", "2e", "16e" */
export const place = (rang: number) => (rang === 1 ? '1er' : `${rang}e`);

export type EvenementClub = {
  debut: string;
  fin: string;
  titre: string;
  categorie: string;
  classe: string;
  etiquette: 'open' | 'dyp' | 'championnat';
  heure?: string;
  lieu?: string;
  resume?: string;
  lien: string;
  externe: boolean;
  info?: string;
  table: string;
  source: 'ffbf' | 'club';
  termine: boolean;
};

/**
 * Compétitions organisées par le club : tournois inscrits au calendrier FFBF par le club
 * + tournois annoncés dans les actualités du site (open, DYP, championnat).
 */
export async function evenementsClub(): Promise<EvenementClub[]> {
  const auj = isoDate(aujourdhui());
  const ffbf: EvenementClub[] = ffbfCalendrier.tournois
    .filter((t) => t.organisateur.sigle === club.sigleFederal)
    .map((t) => {
      const classe = classeCategorie(t.categorie);
      return {
        debut: t.debut,
        fin: t.fin,
        titre: t.nom,
        categorie: t.categorie,
        classe,
        etiquette: classe === 'championnat' ? 'championnat' : 'open',
        lieu: /foch/i.test(t.adresse) ? `Au club, ${club.adresse.rue}` : [t.adresse, t.ville].filter(Boolean).join(', '),
        lien: t.lien,
        externe: true,
        info: t.info || undefined,
        table: t.table || 'Other',
        source: 'ffbf',
        termine: t.statut === 'finished' || t.fin < auj,
      };
    });

  const actus = await getCollection('actualites', ({ data }) => !data.brouillon && data.format !== 'vie-du-club');
  const annonces: EvenementClub[] = actus.map((a) => {
    const d = isoDate(a.data.date);
    const format = a.data.format as 'open' | 'dyp' | 'championnat';
    return {
      debut: d,
      fin: d,
      titre: a.data.titre,
      categorie: FORMATS[format].long,
      classe: format === 'championnat' ? 'championnat' : 'club',
      etiquette: format,
      heure: a.data.heure,
      lieu: a.data.lieu && a.data.lieu.includes(club.adresse.rue) ? `Au club, ${club.adresse.rue}` : a.data.lieu,
      resume: a.data.resume,
      lien: `/actualites/${a.id}`,
      externe: false,
      // Tournoi du club : tables précisées dans l'annonce, sinon les tables principales du club (Bonzini)
      table: a.data.table || club.tables[0].marque,
      source: 'club',
      termine: d < auj,
    };
  });

  return [...ffbf, ...annonces].sort((a, b) => a.debut.localeCompare(b.debut) || a.titre.localeCompare(b.titre));
}
