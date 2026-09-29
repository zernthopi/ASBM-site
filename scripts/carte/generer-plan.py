#!/usr/bin/env python3
"""
Génère le plan d'accès du club (src/components/PlanAcces.astro) : deux cartes SVG dans la charte
graphique du site, dessinées à partir des données OpenStreetMap enregistrées dans ce dossier.

  - « Plan de situation » : centre de Marseille, lignes de métro (M1, M2) et de tramway (T1, T2, T3)
    aux couleurs RTM, gares, grands axes et repères ;
  - « Du métro au club » : zoom sur le quartier, bâtiments, rues, arrêts et itinéraires à pied.

Données : © contributeurs OpenStreetMap (licence ODbL), extraites avec l'API Overpass
(transports.json, fond.json, batiments.json). Dépendance : shapely (pip install shapely).

    python3 scripts/carte/generer-plan.py
"""
import json
import math
from pathlib import Path

from shapely.geometry import LineString, MultiLineString, Polygon, box
from shapely.ops import linemerge, polygonize, unary_union

ICI = Path(__file__).resolve().parent
SORTIE = ICI.parent.parent / 'src' / 'components' / 'PlanAcces.astro'

transports = json.loads((ICI / 'transports.json').read_text())
fond = json.loads((ICI / 'fond.json').read_text())
batiments = json.loads((ICI / 'batiments.json').read_text())

CLUB = (43.30122, 5.39917)             # École primaire Michelet Foch (OSM way 654481478)
COULEURS = {r['ref']: r['colour'] for r in transports['routes']}


class Vue:
    """Projection équirectangulaire locale (suffisante à l'échelle d'un quartier)."""

    def __init__(self, lat0, lon0, lat1, lon1, largeur):
        self.lat0, self.lon0, self.lat1, self.lon1 = lat0, lon0, lat1, lon1
        self.c = math.cos(math.radians((lat0 + lat1) / 2))
        self.k = largeur / ((lon1 - lon0) * self.c)
        self.W = largeur
        self.H = round((lat1 - lat0) * self.k)
        self.cadre = box(0, 0, self.W, self.H)
        self.m_par_px = (lon1 - lon0) * self.c * 111320 / largeur

    def xy(self, lat, lon):
        return ((lon - self.lon0) * self.c * self.k, (self.lat1 - lat) * self.k)

    def ligne(self, pts):
        return LineString([self.xy(*p) for p in pts]) if len(pts) > 1 else None


def f(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def chemin(geom, tol=0.6):
    """Géométrie shapely → attribut d SVG (lignes ou polygones), simplifiée."""
    if geom is None or geom.is_empty:
        return ''
    geom = geom.simplify(tol, preserve_topology=True)
    parts = []

    def ligne(coords, fermer=False):
        coords = list(coords)
        if len(coords) < 2:
            return
        d = 'M' + ' '.join(f'{f(x)},{f(y)}' for x, y in coords)
        parts.append(d + ('Z' if fermer else ''))

    def visiter(g):
        t = g.geom_type
        if t == 'LineString':
            ligne(g.coords)
        elif t == 'Polygon':
            ligne(g.exterior.coords[:-1], True)
            for i in g.interiors:
                ligne(i.coords[:-1], True)
        elif hasattr(g, 'geoms'):
            for s in g.geoms:
                visiter(s)

    visiter(geom)
    return ''.join(parts)


def lignes_de(vue, elements, cadre=None):
    cadre = cadre or vue.cadre.buffer(20)
    ls = [vue.ligne(e['g']) for e in elements if len(e.get('g', [])) > 1]
    ls = [l for l in ls if l is not None]
    if not ls:
        return None
    return unary_union(ls).intersection(cadre)


def polygones_de(vue, elements):
    polys = []
    for e in elements:
        g = e.get('g', [])
        if len(g) > 3 and g[0] == g[-1]:
            p = Polygon([vue.xy(*q) for q in g])
            if p.is_valid and p.area > 2:
                polys.append(p)
    return unary_union(polys).intersection(vue.cadre) if polys else None


def parc_longchamp(vue):
    rel = [e for e in fond + batiments if e.get('t') == 'r' and e['tags'].get('name') == 'Parc Longchamp' and e.get('m')]
    if not rel:
        return None
    lignes = [vue.ligne(m['g']) for m in rel[0]['m'] if m['role'] == 'outer' and len(m['g']) > 1]
    polys = list(polygonize(linemerge(unary_union([l for l in lignes if l]))))
    return unary_union(polys).intersection(vue.cadre) if polys else None


def vieux_port(vue):
    """Bassin du Vieux-Port : trait de côte fermé loin à l'ouest, puis découpé au cadre."""
    cotes = [e for e in fond if e['tags'].get('natural') == 'coastline']
    fusion = linemerge(unary_union([vue.ligne(e['g']) for e in cotes]))
    if fusion.geom_type != 'LineString':
        fusion = max(fusion.geoms, key=lambda g: g.length)
    pts = list(fusion.coords)
    x0 = min(p[0] for p in pts) - 400
    poly = Polygon(pts + [(x0, pts[-1][1]), (x0, pts[0][1])])
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly.intersection(vue.cadre)


def rues(vue, classes, cadre=None, sans_tunnel=True):
    el = [e for e in fond if e.get('t') == 'w' and e['tags'].get('highway') in classes
          and not (sans_tunnel and e['tags'].get('tunnel'))]
    return lignes_de(vue, el, cadre)


def trace_ligne(vue, ref):
    r = next(r for r in transports['routes'] if r['ref'] == ref)
    return lignes_de(vue, [{'g': w} for w in r['ways']])


def rue_nommee(vue, nom, fenetre=None, prefixe=False):
    """Plus long tronçon continu d'une rue (pour poser son nom le long du tracé)."""
    el = [e for e in fond if e.get('t') == 'w' and e['tags'].get('highway') and
          (e['tags'].get('name', '').startswith(nom) if prefixe else e['tags'].get('name') == nom)]
    geom = lignes_de(vue, el, fenetre or vue.cadre)
    if geom is None or geom.is_empty:
        return None
    m = linemerge(geom) if geom.geom_type != 'LineString' else geom
    return m if m.geom_type == 'LineString' else max(m.geoms, key=lambda g: g.length)


def plus_court_chemin(depart, arrivee, fenetre=(43.2975, 5.391, 43.3065, 5.406), rue_arrivee=None, rue_depart=None):
    """Itinéraire à pied sur le réseau de rues OSM (Dijkstra) entre deux points (lat, lon).
    Les nœuds distants de moins de 3 m sont fusionnés (géométries arrondies)."""
    import heapq
    c = math.cos(math.radians(43.3))
    dist = lambda a, b: math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * c)
    cle = lambda p: (round(p[0] / 3e-5), round(p[1] / 4e-5))
    coord, voisins, sur_rue, depart_possible = {}, {}, set(), set()
    marchables = {'residential', 'unclassified', 'living_street', 'pedestrian', 'tertiary', 'secondary',
                  'primary', 'tertiary_link', 'secondary_link', 'footway', 'service'}
    for e in fond:
        if (e.get('t') != 'w' or e['tags'].get('highway') not in marchables or e['tags'].get('tunnel')
                or e['tags'].get('area') == 'yes'):
            continue
        pts = [tuple(p) for p in e['g'] if fenetre[0] <= p[0] <= fenetre[2] and fenetre[1] <= p[1] <= fenetre[3]]
        nom = e['tags'].get('name', '')
        for p in pts:
            coord.setdefault(cle(p), p)
            if rue_arrivee and nom.startswith(rue_arrivee):
                sur_rue.add(cle(p))
            if rue_depart and nom.startswith(rue_depart):
                depart_possible.add(cle(p))
        for a, b in zip(pts, pts[1:]):
            ka, kb = cle(a), cle(b)
            if ka == kb:
                continue
            voisins.setdefault(ka, []).append((kb, dist(a, b)))
            voisins.setdefault(kb, []).append((ka, dist(a, b)))
    # composante connexe du départ
    k0 = min((k for k in voisins if not rue_depart or k in depart_possible), key=lambda k: dist(coord[k], depart))
    vus, pile = {k0}, [k0]
    while pile:
        n = pile.pop()
        for m, _ in voisins[n]:
            if m not in vus:
                vus.add(m); pile.append(m)
    cibles = [k for k in vus if (not sur_rue or k in sur_rue)]
    k1 = min(cibles, key=lambda k: dist(coord[k], arrivee))
    meilleur, prec, file = {k0: 0}, {}, [(0, k0)]
    while file:
        d, n = heapq.heappop(file)
        if n == k1:
            break
        if d > meilleur.get(n, 1e18):
            continue
        for m, w in voisins[n]:
            if d + w < meilleur.get(m, 1e18):
                meilleur[m], prec[m] = d + w, n
                heapq.heappush(file, (d + w, m))
    trajet, n = [k1], k1
    while n != k0:
        n = prec[n]
        trajet.append(n)
    return [depart] + [coord[k] for k in trajet[::-1]] + [arrivee]


def gauche_droite(l):
    c = list(l.coords)
    return LineString(c[::-1]) if c[0][0] > c[-1][0] else l


def rogner(l, debut, fin):
    """Garde la portion [debut, fin] (fractions de longueur) d'une ligne."""
    from shapely.ops import substring
    return substring(l, debut * l.length, fin * l.length)


def lissage(l, tol=3):
    return l.simplify(tol)


# ---------------------------------------------------------------------------------------------
# Stations
NOMS_ARRETS = {n['id']: n['t'].get('name') for n in transports['nodes']}


def stations_metro():
    st = {}
    for r in transports['routes']:
        if r['ref'][0] != 'M':
            continue
        for s in r['stops']:
            st.setdefault(s[0], {'lat': s[1], 'lon': s[2], 'lignes': set()})['lignes'].add(r['ref'])
    return st


def arrets_tram():
    st = {}
    for r in transports['routes']:
        if r['ref'][0] != 'T':
            continue
        for s in r['stops']:
            nom = NOMS_ARRETS.get(s[0])
            if not nom:
                continue
            e = st.setdefault(nom, {'pts': [], 'lignes': set()})
            e['pts'].append((s[1], s[2]))
            e['lignes'].add(r['ref'])
    for nom, e in st.items():
        e['lat'] = sum(p[0] for p in e['pts']) / len(e['pts'])
        e['lon'] = sum(p[1] for p in e['pts']) / len(e['pts'])
    return st


# Noms de stations de métro (l'API donne les identifiants ; noms relevés dans OpenStreetMap)
NOMS_METRO = {
    'Saint-Charles': (43.3024, 5.38006), 'Réformés - Canebière': (43.30041, 5.38634),
    'Cinq Avenues Longchamp': (43.30408, 5.39632), 'Chartreux': (43.30913, 5.40148),
    'Vieux Port': (43.29558, 5.37437), 'Colbert': (43.30027, 5.37443), 'La Blancarde': (43.29556, 5.40619),
    'La Timone': (43.29114, 5.40039), 'Noailles': (43.29684, 5.38118), 'Jules Guesde': (43.30194, 5.374),
    'Notre-Dame-du-Mont - Cours Julien': (43.2925, 5.3837), 'Louis Armand': (43.29998, 5.41355),
}


def txt(x, y, contenu, classe, ancre='start', extra=''):
    return f'<text x="{f(x)}" y="{f(y)}" class="{classe}" text-anchor="{ancre}"{extra}>{contenu}</text>'


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace("'", '’')


# =============================================================================================
# 1. Plan de situation
V = Vue(43.2895, 5.3685, 43.3115, 5.4125, 1000)


def plan_situation():
    o = []
    o.append(f'<rect width="{V.W}" height="{V.H}" class="c-fond"/>')
    parcs = [e for e in fond if e['tags'].get('leisure') == 'park' and e.get('t') == 'w']
    p = unary_union([g for g in [polygones_de(V, parcs), parc_longchamp(V)] if g is not None])
    o.append(f'<path class="c-parc" d="{chemin(p, 0.8)}"/>')
    o.append(f'<path class="c-eau" d="{chemin(vieux_port(V), 0.6)}"/>')
    rail = lignes_de(V, [e for e in fond if e['tags'].get('railway') == 'rail' and not e['tags'].get('tunnel')])
    emprise = rail.buffer(2.6, cap_style=2).intersection(V.cadre) if rail is not None else None
    o.append(f'<path class="c-rail" d="{chemin(emprise, 0.8)}"/>')
    tert = rues(V, {'tertiary'})
    maj = rues(V, {'motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'})
    dt, dm = chemin(tert, 0.8), chemin(maj, 0.8)
    o.append(f'<path class="c-rue-bord c-rue-bord--t" d="{dt}"/><path class="c-rue-bord c-rue-bord--m" d="{dm}"/>')
    o.append(f'<path class="c-rue c-rue--t" d="{dt}"/><path class="c-rue c-rue--m" d="{dm}"/>')

    # Noms de rues le long du tracé
    defs, noms = [], []

    def nom_rue(ident, nom, geom, texte, debut=0.0, fin=1.0, classe='c-nom-rue', decalage=0):
        if geom is None:
            return
        l = gauche_droite(lissage(rogner(geom, debut, fin), 4))
        if decalage:
            l = gauche_droite(l.offset_curve(decalage, join_style=2))
        defs.append(f'<path id="{ident}" d="{chemin(l, 0)}"/>')
        noms.append(f'<text class="{classe}" dy="0.35em"><textPath href="#{ident}" startOffset="50%" text-anchor="middle">{esc(texte)}</textPath></text>')

    nom_rue('pv-foch', 'foch', V.ligne([(43.30012, 5.40036), (43.29740, 5.40445)]), 'AV. DU MARÉCHAL-FOCH', 0.0, 1.0, 'c-nom-rue c-nom-rue--fort', -10)
    nom_rue('pv-cane', 'cane', rue_nommee(V, 'La Canebière'), 'LA CANEBIÈRE', 0.0, 1.0, 'c-nom-rue', -10)
    nom_rue('pv-lib', 'lib', rue_nommee(V, 'Boulevard de la Libération', prefixe=True), 'BD DE LA LIBÉRATION', 0.1, 0.9)
    nom_rue('pv-long', 'long', rue_nommee(V, 'Boulevard Longchamp'), 'BD LONGCHAMP', 0.1, 0.9, 'c-nom-rue', -10)
    nom_rue('pv-chart', 'chart', rue_nommee(V, 'Avenue des Chartreux'), 'AV. DES CHARTREUX', 0.1, 0.95)
    nom_rue('pv-blanc', 'blanc', rue_nommee(V, 'Boulevard de la Blancarde'), 'BD DE LA BLANCARDE', 0.5, 1.0)
    nom_rue('pv-nat', 'nat', rue_nommee(V, 'Boulevard National'), 'BD NATIONAL', 0.2, 0.9)

    # Lignes de transport (tram puis métro par-dessus)
    for ref in ['T3', 'T1', 'T2']:
        d = chemin(trace_ligne(V, ref), 0.6)
        o.append(f'<path class="c-ligne-bord c-ligne-bord--tram" d="{d}"/><path class="c-ligne c-ligne--tram" stroke="{COULEURS[ref]}" d="{d}"/>')
    for ref in ['M2', 'M1']:
        d = chemin(trace_ligne(V, ref), 0.6)
        o.append(f'<path class="c-ligne-bord c-ligne-bord--metro" d="{d}"/><path class="c-ligne c-ligne--metro" stroke="{COULEURS[ref]}" d="{d}"/>')

    # Arrêts de tram
    tram = arrets_tram()
    for nom, e in tram.items():
        x, y = V.xy(e['lat'], e['lon'])
        if 0 <= x <= V.W and 0 <= y <= V.H:
            o.append(f'<circle class="c-arret" cx="{f(x)}" cy="{f(y)}" r="3.6"/>')
    # Stations de métro
    metro = stations_metro()
    for sid, e in metro.items():
        x, y = V.xy(e['lat'], e['lon'])
        if 0 <= x <= V.W and 0 <= y <= V.H:
            r = 8.5 if len(e['lignes']) > 1 else 6.5
            o.append(f'<circle class="c-station" cx="{f(x)}" cy="{f(y)}" r="{r}"/>')
    # Gares SNCF
    for nom, (lat, lon) in {'Saint-Charles': (43.30326, 5.38119), 'Blancarde': (43.2965, 5.40675)}.items():
        x, y = V.xy(lat, lon)
        o.append(f'<rect class="c-gare" x="{f(x - 7)}" y="{f(y - 7)}" width="14" height="14" rx="3"/>')

    o.append('<defs>' + ''.join(defs) + '</defs>')
    o.extend(noms)

    # Repères
    def repere(lat, lon, texte, classe='c-repere', dx=0, dy=0, ancre='middle'):
        x, y = V.xy(lat, lon)
        lignes = texte.split('|')
        for i, t in enumerate(lignes):
            o.append(txt(x + dx, y + dy + i * 17, esc(t), classe, ancre))

    repere(43.3071, 5.3946, 'PARC|LONGCHAMP', 'c-repere c-repere--parc', 0, 0)
    repere(43.2951, 5.3687, 'VIEUX-PORT', 'c-repere c-repere--eau', 0, 4, 'start')
    repere(43.3055, 5.3805, 'GARE|SAINT-CHARLES', 'c-repere', 0, -18)

    # Étiquettes des stations (position choisie à la main pour éviter les tracés)
    def etiquette(lat, lon, texte, dx, dy, ancre='start', classe='c-lib-station'):
        x, y = V.xy(lat, lon)
        for i, t in enumerate(texte.split('|')):
            o.append(txt(x + dx, y + dy + i * 16, esc(t), classe, ancre))

    etiquette(43.3024, 5.38006, 'Saint-Charles', 12, 22, 'start')
    etiquette(43.30041, 5.38634, 'Réformés|Canebière', 11, 16)
    etiquette(43.30408, 5.39632, 'Cinq Avenues – Longchamp', -13, -6, 'end', 'c-lib-station c-lib-station--fort')
    etiquette(43.30913, 5.40148, 'Chartreux', 12, 5)
    etiquette(43.29558, 5.37437, 'Vieux-Port', 12, 18)
    etiquette(43.29684, 5.38118, 'Noailles', 12, 16)
    etiquette(43.29556, 5.40619, 'La Blancarde', 12, 18)
    etiquette(43.30031, 5.40008, 'Foch Sakakini', -10, 16, 'end', 'c-lib-arret')
    etiquette(43.30232, 5.39707, 'Cinq Avenues', -9, 14, 'end', 'c-lib-arret')

    # Le club
    x, y = V.xy(*CLUB)
    o.append(f'''<g class="c-club" transform="translate({f(x)} {f(y)})">
  <circle r="17" class="c-club__halo"/>
  <path d="M0 0 C -9 -12 -13 -17 -13 -24 A 13 13 0 1 1 13 -24 C 13 -17 9 -12 0 0 Z" class="c-club__epingle"/>
  <circle cy="-24" r="5.5" class="c-club__point"/>
  <g transform="translate(22 -58)">
    <rect width="176" height="46" rx="6" class="c-club__cartouche"/>
    <text x="12" y="20" class="c-club__nom">ASBM</text>
    <text x="12" y="37" class="c-club__adresse">21 av. du Maréchal-Foch</text>
  </g>
</g>''')

    # Échelle et nord
    L = 500 / V.m_par_px
    x0, y0 = V.W - 24 - L, V.H - 26
    o.append(f'''<g class="c-echelle"><rect x="{f(x0 - 10)}" y="{f(y0 - 22)}" width="{f(L + 20)}" height="38" rx="5" class="c-echelle__fond"/>
  <path d="M{f(x0)},{f(y0)}h{f(L)}" class="c-echelle__barre"/><path d="M{f(x0)},{f(y0 - 5)}v10M{f(x0 + L)},{f(y0 - 5)}v10M{f(x0 + L / 2)},{f(y0 - 3)}v6" class="c-echelle__traits"/>
  {txt(x0 + L / 2, y0 - 9, '500 m', 'c-echelle__txt', 'middle')}</g>''')
    o.append(f'''<g class="c-nord" transform="translate({V.W - 30} 34)"><circle r="17" class="c-nord__fond"/><path d="M0 -12 L6 6 L0 2 L-6 6 Z" class="c-nord__fleche"/>{txt(0, -20, 'N', 'c-nord__txt', 'middle')}</g>''')
    o.append(txt(8, V.H - 8, '© contributeurs OpenStreetMap', 'c-credit'))
    return o


# =============================================================================================
# 2. Zoom : du métro au club
Z = Vue(43.2988, 5.3935, 43.3058, 5.4030, 600)


def plan_quartier():
    o = [f'<rect width="{Z.W}" height="{Z.H}" class="c-fond"/>']
    parcs = [e for e in fond if e['tags'].get('leisure') == 'park' and e.get('t') == 'w']
    p = unary_union([g for g in [polygones_de(Z, parcs), parc_longchamp(Z)] if g is not None])
    o.append(f'<path class="c-parc" d="{chemin(p, 0.5)}"/>')
    bat = polygones_de(Z, [e for e in batiments if e.get('t') == 'b'])
    o.append(f'<path class="c-bati" d="{chemin(bat, 0.5)}"/>')
    ecole = next(e for e in fond if e['tags'].get('amenity') == 'school')
    poly_ecole = Polygon([Z.xy(*q) for q in ecole['g']])

    toutes = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified',
              'living_street', 'secondary_link', 'tertiary_link', 'primary_link'}
    petites = rues(Z, {'residential', 'unclassified', 'living_street', 'tertiary_link'}, sans_tunnel=True)
    grandes = rues(Z, {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'secondary_link', 'primary_link'}, sans_tunnel=True)
    pietons = rues(Z, {'pedestrian'}, sans_tunnel=True)
    dp, dg, dpi = chemin(petites, 0.4), chemin(grandes, 0.4), chemin(pietons, 0.4)
    o.append(f'<path class="c-rue-bord c-rue-bord--p" d="{dp}"/><path class="c-rue-bord c-rue-bord--g" d="{dg}"/><path class="c-rue-bord c-rue-bord--pi" d="{dpi}"/>')
    o.append(f'<path class="c-rue c-rue--p" d="{dp}"/><path class="c-rue c-rue--g" d="{dg}"/><path class="c-rue c-rue--pi" d="{dpi}"/>')

    # L'école (le club est au sous-sol)
    o.append(f'<path class="c-ecole" d="{chemin(poly_ecole, 0)}"/>')

    # Noms de rues
    defs, noms = [], []

    def nom_rue(ident, geom, texte, debut=0.0, fin=1.0, classe='c-nom-rue c-nom-rue--z', decalage=0):
        if geom is None:
            return
        l = gauche_droite(lissage(rogner(geom, debut, fin), 3))
        if decalage:
            l = gauche_droite(l.offset_curve(decalage, join_style=2))
        defs.append(f'<path id="{ident}" d="{chemin(l, 0)}"/>')
        noms.append(f'<text class="{classe}" dy="0.35em"><textPath href="#{ident}" startOffset="50%" text-anchor="middle">{esc(texte)}</textPath></text>')

    nom_rue('zq-lib', rue_nommee(Z, 'Boulevard de la Libération', prefixe=True), 'BOULEVARD DE LA LIBÉRATION', 0.05, 0.95)
    nom_rue('zq-chart', rue_nommee(Z, 'Avenue des Chartreux'), 'AV. DES CHARTREUX', 0.5, 1.0)
    nom_rue('zq-duparc', rue_nommee(Z, 'Boulevard Françoise Duparc'), 'BD F. DUPARC', 0.1, 0.9)
    nom_rue('zq-monte', rue_nommee(Z, 'Rue Monte Cristo'), 'RUE MONTE CRISTO', 0.1, 0.9)

    # Tram T2 (avenue du Maréchal-Foch) et métro M1 (souterrain)
    d = chemin(trace_ligne(Z, 'M1'), 0.4)
    o.append(f'<path class="c-ligne-bord c-ligne-bord--metro-z" d="{d}"/><path class="c-ligne c-ligne--metro-z" stroke="{COULEURS["M1"]}" d="{d}"/>')
    d = chemin(trace_ligne(Z, 'T2'), 0.4)
    o.append(f'<path class="c-ligne-bord c-ligne-bord--tram-z" d="{d}"/><path class="c-ligne c-ligne--tram-z" stroke="{COULEURS["T2"]}" d="{d}"/>')

    # Nom de l'avenue sur la voie du tram, côté Blancarde
    foch = rue_nommee(Z, 'Avenue du Maréchal Foch')
    nom_rue('zq-foch', Z.ligne([(43.30205, 5.39750), (43.30070, 5.39955)]), 'AV. DU MARÉCHAL-FOCH', 0.0, 1.0, 'c-nom-rue c-nom-rue--z c-nom-rue--fort', 17)

    # Itinéraires à pied
    def itineraire(pts, cls):
        l = Z.ligne(pts)
        metres = sum(math.dist(Z.xy(*a), Z.xy(*b)) for a, b in zip(pts, pts[1:])) * Z.m_par_px
        o.append(f'<path class="c-pied {cls}" d="{chemin(l, 0)}"/>')
        return l, metres

    entree = (43.30112, 5.39893)   # façade de l'école sur l'avenue du Maréchal-Foch
    metro_pts = plus_court_chemin((43.30408, 5.39632), entree, rue_arrivee='Avenue du Maréchal Foch')
    tram_pts = [(43.30035, 5.40001), (43.30066, 5.39958), entree]   # le long de l'avenue
    l_m, m_m = itineraire(metro_pts, 'c-pied--metro')
    l_t, m_t = itineraire(tram_pts, 'c-pied--tram')

    # Arrêts et station
    for nom, (lat, lon) in {'Cinq Avenues': (43.30233, 5.39708), 'Foch Sakakini': (43.30032, 5.40010)}.items():
        x, y = Z.xy(lat, lon)
        o.append(f'<circle class="c-arret c-arret--z" cx="{f(x)}" cy="{f(y)}" r="7"/>')
    x, y = Z.xy(43.30408, 5.39632)
    o.append(f'<g transform="translate({f(x)} {f(y)})"><circle r="13" class="c-station c-station--z"/>'
             f'<text class="c-picto" y="5" text-anchor="middle">M</text></g>')

    o.append('<defs>' + ''.join(defs) + '</defs>')
    o.extend(noms)

    def etiquette(lat, lon, lignes, dx, dy, ancre='start', classe='c-lib-station c-lib-station--z'):
        x, y = Z.xy(lat, lon)
        for i, t in enumerate(lignes):
            o.append(txt(x + dx, y + dy + i * 17, esc(t), classe, ancre))

    etiquette(43.30408, 5.39632, ['Métro M1', 'Cinq Avenues – Longchamp'], 18, -2)
    etiquette(43.30233, 5.39708, ['Tram T2', 'Cinq Avenues'], -13, 2, 'end')
    etiquette(43.30032, 5.40010, ['Tram T2', 'Foch Sakakini'], 14, 18)
    etiquette(43.3052, 5.3952, ['PARC', 'LONGCHAMP'], 0, 0, 'middle', 'c-repere c-repere--parc')

    # Temps de marche
    def duree(l, metres, t, dx, dy, position=0.5):
        pm = l.interpolate(position, normalized=True)
        minutes = max(2, round(metres / 83))   # 5 km/h, 2 min au minimum (traversées)
        o.append(f'<g class="c-duree" transform="translate({f(pm.x + dx)} {f(pm.y + dy)})"><rect x="-54" y="-15" width="108" height="29" rx="14.5"/>'
                 f'<text y="5" text-anchor="middle">{minutes} min à pied</text></g>')
        return minutes

    min_m = duree(l_m, m_m, 'metro', 58, 0, 0.14)
    min_t = duree(l_t, m_t, 'tram', 58, 6)

    # Le club
    cx, cy = poly_ecole.centroid.x, poly_ecole.centroid.y
    o.append(f'''<g class="c-club" transform="translate({f(cx)} {f(cy)})">
  <path d="M0 0 C -9 -12 -13 -17 -13 -24 A 13 13 0 1 1 13 -24 C 13 -17 9 -12 0 0 Z" class="c-club__epingle"/>
  <circle cy="-24" r="5.5" class="c-club__point"/>
  <g transform="translate(20 -92)">
    <rect width="206" height="66" rx="6" class="c-club__cartouche"/>
    <text x="12" y="22" class="c-club__nom">ASBM</text>
    <text x="12" y="40" class="c-club__adresse">École Michelet, au sous-sol</text>
    <text x="12" y="56" class="c-club__adresse">21 av. du Maréchal-Foch</text>
  </g>
</g>''')

    L = 100 / Z.m_par_px
    x0, y0 = Z.W - 22 - L, Z.H - 24
    o.append(f'''<g class="c-echelle"><rect x="{f(x0 - 10)}" y="{f(y0 - 22)}" width="{f(L + 20)}" height="36" rx="5" class="c-echelle__fond"/>
  <path d="M{f(x0)},{f(y0)}h{f(L)}" class="c-echelle__barre"/><path d="M{f(x0)},{f(y0 - 5)}v10M{f(x0 + L)},{f(y0 - 5)}v10" class="c-echelle__traits"/>
  {txt(x0 + L / 2, y0 - 9, '100 m', 'c-echelle__txt', 'middle')}</g>''')
    o.append(f'''<g class="c-nord" transform="translate({Z.W - 28} 32)"><circle r="16" class="c-nord__fond"/><path d="M0 -11 L6 6 L0 2 L-6 6 Z" class="c-nord__fleche"/>{txt(0, -19, 'N', 'c-nord__txt', 'middle')}</g>''')
    o.append(txt(8, Z.H - 8, '© contributeurs OpenStreetMap', 'c-credit'))
    return o, min_m, min_t, round(m_m / 50) * 50, round(m_t / 10) * 10


situation = plan_situation()
quartier, min_metro, min_tram, m_metro, m_tram = plan_quartier()

GABARIT = (ICI / 'gabarit-plan.astro').read_text()
page = (GABARIT
        .replace('%%W1%%', str(V.W)).replace('%%H1%%', str(V.H))
        .replace('%%W2%%', str(Z.W)).replace('%%H2%%', str(Z.H))
        .replace('%%SITUATION%%', '\n'.join(situation))
        .replace('%%QUARTIER%%', '\n'.join(quartier))
        .replace('%%MIN_METRO%%', str(min_metro)).replace('%%MIN_TRAM%%', str(min_tram))
        .replace('%%M_METRO%%', str(m_metro)).replace('%%M_TRAM%%', str(m_tram)))
SORTIE.write_text(page)
print(f'{SORTIE.relative_to(ICI.parent.parent)} : {len(page) // 1024} Ko ; métro {m_metro} m ({min_metro} min), tram {m_tram} m ({min_tram} min)')
