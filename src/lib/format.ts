// Libellés et mises en forme partagés (typographie française).

export const FORMATS = {
  open: { court: 'Open', long: 'Tournoi open' },
  dyp: { court: 'DYP', long: 'Tournoi DYP (partenaire tiré au sort)' },
  championnat: { court: 'Championnat', long: 'Championnat' },
  'vie-du-club': { court: 'Vie du club', long: 'Vie du club' },
} as const;

export type Format = keyof typeof FORMATS;

const TZ = 'Europe/Paris';

export function jourMois(date: Date) {
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', timeZone: TZ }).format(date);
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: TZ })
    .format(date)
    .replace('.', '');
  return { jour, mois };
}

export function dateLongue(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(date);
}

export function jourSemaine(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: TZ }).format(date);
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** "18:00" → "18 h" ; "18:30" → "18 h 30" (espaces insécables) */
export function heureFr(hhmm: string) {
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

/** Aujourd'hui à minuit (Paris), pour trier « à venir » / « passés » au moment du build. */
export function aujourdhui() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  return new Date(`${iso}T00:00:00Z`);
}

/** Lien externe venu des données : seulement http(s), sinon chaîne vide (bloque « javascript: »…). */
export function lienSur(u: unknown): string {
  try {
    const url = new URL(String(u ?? '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * Empêche la coupure de « baby-foot » en fin de ligne.
 * Renvoie du HTML échappé (à utiliser avec set:html) : les polices n'ont pas de trait d'union insécable.
 */
export function insecable(texte: string) {
  const echappe = texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return echappe.replace(/baby-foot/gi, (m) => `<span class="insecable">${m}</span>`);
}

const PAYS = new Intl.DisplayNames(['fr'], { type: 'region' });
/** "FR" → "France" */
export function nomPays(code: string) {
  if (!code) return '';
  try { return PAYS.of(code.toUpperCase()) || code; } catch { return code; }
}

function jourFr(d: Date) { return d.getUTCDate() === 1 ? '1er' : String(d.getUTCDate()); }
function moisCourt(d: Date) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
}
/** "2026-10-02", "2026-10-04" → "2–4 oct." ; sur deux mois : "30 oct. – 1er nov." */
export function plageDates(debut: string, fin: string) {
  const d = new Date(`${debut}T12:00:00Z`), f = new Date(`${fin}T12:00:00Z`);
  if (debut === fin) return `${jourFr(d)} ${moisCourt(d)}`;
  if (d.getUTCMonth() === f.getUTCMonth()) return `${jourFr(d)}–${jourFr(f)} ${moisCourt(f)}`;
  return `${jourFr(d)} ${moisCourt(d)} – ${jourFr(f)} ${moisCourt(f)}`;
}
/** "2026-10-02" → "Octobre 2026" */
export function moisAnnee(iso: string) {
  const t = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "2026-11-21" → "sam." */
export function jourCourt(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}
/** "2026-11-21" → { jour: "21", mois: "nov." } sans décalage de fuseau */
export function jourMoisIso(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    jour: d.getUTCDate() === 1 ? '1er' : String(d.getUTCDate()),
    mois: new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', ''),
  };
}
