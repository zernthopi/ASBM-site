// Modèles 3D des trophées du club (three.js).
// Chaque trophée est décrit dans src/data/trophees.json en « pixels photo » (y vers le bas,
// demi-largeurs depuis l'axe), relevés sur les photos des trophées. Ce module reconstruit
// la coupe par révolution, le socle, la plaque gravée, les anses et le médaillon, puis
// normalise le tout à une hauteur de 1.
// Les reflets viennent d'un studio photo virtuel neutre (creerEnvironnement) : aucune trace
// de la salle ni du photographe, contrairement aux photos.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const POLICE_SANS = '"Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", Arial, sans-serif';
const POLICE_SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';
const POLICE_TITRE = '"Big Shoulders Display", "Arial Narrow", sans-serif';

/* ------------------------------------------------------------------ */
/* Matières                                                            */
/* ------------------------------------------------------------------ */

// Couleur sRGB peinte dans les textures, rugosité, métallicité
const METAUX = {
  argent: { c: '#f2f3f4', r: 0.07, m: 1 },
  chrome: { c: '#e9ecef', r: 0.05, m: 1 },
  or: { c: '#f3c65a', r: 0.1, m: 1 },
  'or-pale': { c: '#ecd08c', r: 0.16, m: 1 },
  bronze: { c: '#d39a62', r: 0.22, m: 1 },
  laiton: { c: '#e4c47c', r: 0.28, m: 1 },
  satine: { c: '#e4e6e8', r: 0.4, m: 1 },
  'bleu-anodise': { c: '#2f6fe0', r: 0.22, m: 1 },
  'noir-laque': { c: '#1b1f27', r: 0.3, m: 0.15 },
  'email-blanc': { c: '#f6f6f2', r: 0.25, m: 0 },
};

function canvas(l, h) {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  return c;
}

/** Trois calques peints ensemble : couleur (sRGB), rugosité/métal (G/B), relief. */
function calques(l, h, metal) {
  const m = METAUX[metal] || METAUX.argent;
  const col = canvas(l, h);
  const mr = canvas(l, h);
  const bump = canvas(l, h);
  const cc = col.getContext('2d');
  const cm = mr.getContext('2d');
  const cb = bump.getContext('2d');
  cc.fillStyle = m.c;
  cc.fillRect(0, 0, l, h);
  cm.fillStyle = mrCouleur(m.r, m.m);
  cm.fillRect(0, 0, l, h);
  cb.fillStyle = '#808080';
  cb.fillRect(0, 0, l, h);
  return { col, mr, bump, cc, cm, cb, l, h };
}
const mrCouleur = (r, m) => `rgb(0, ${Math.round(r * 255)}, ${Math.round(m * 255)})`;

/** Peint une forme dans les trois calques (fill(ctx) dessine le chemin et le remplit). */
function peindre(k, metal, dessiner, relief = null) {
  const m = METAUX[metal] || metal;
  k.cc.fillStyle = m.c;
  dessiner(k.cc);
  k.cm.fillStyle = mrCouleur(m.r, m.m);
  dessiner(k.cm);
  if (relief !== null) {
    k.cb.fillStyle = relief;
    dessiner(k.cb);
  }
}

function texture(c, srgb, repeter = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeter) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function materiauCalques(k, { reliefEchelle = 1.2, physique = {} } = {}) {
  const mrT = texture(k.mr, false);
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: texture(k.col, true),
    roughnessMap: mrT,
    metalnessMap: mrT,
    roughness: 1,
    metalness: 1,
    bumpMap: texture(k.bump, false),
    bumpScale: reliefEchelle,
    ...physique,
  });
}

function materiauMetal(nom) {
  const m = METAUX[nom] || METAUX.argent;
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(m.c),
    roughness: m.r,
    metalness: m.m,
  });
}

/* Bruit pseudo-aléatoire reproductible : les rendus sont identiques d'une fois à l'autre */
function alea(graine) {
  let s = graine >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function textureBois(teinte, graine = 7) {
  const T = {
    acajou: ['#5a1a1e', '#3c0e13', '#7a2a2b'],
    'bois-rouge': ['#93362f', '#6e221f', '#b04f45'],
  }[teinte] || ['#5a1a1e', '#3c0e13', '#7a2a2b'];
  const c = canvas(1024, 512);
  const x = c.getContext('2d');
  x.fillStyle = T[0];
  x.fillRect(0, 0, 1024, 512);
  const r = alea(graine);
  for (let i = 0; i < 160; i++) {
    const y0 = r() * 540 - 14;
    const amp = 2 + r() * 10;
    const f = 0.004 + r() * 0.01;
    const ph = r() * 10;
    x.strokeStyle = r() < 0.6 ? T[1] : T[2];
    x.globalAlpha = 0.15 + r() * 0.35;
    x.lineWidth = 0.6 + r() * 2.4;
    x.beginPath();
    for (let px = 0; px <= 1024; px += 8) {
      const y = y0 + Math.sin(px * f + ph) * amp + Math.sin(px * f * 3.1 + ph) * amp * 0.3;
      px === 0 ? x.moveTo(px, y) : x.lineTo(px, y);
    }
    x.stroke();
  }
  x.globalAlpha = 1;
  const t = texture(c, true, true);
  return t;
}

function textureMarbre(graine = 3) {
  const c = canvas(1024, 1024);
  const x = c.getContext('2d');
  x.fillStyle = '#17191d';
  x.fillRect(0, 0, 1024, 1024);
  const r = alea(graine);
  // nuages sombres
  for (let i = 0; i < 60; i++) {
    const g = x.createRadialGradient(r() * 1024, r() * 1024, 0, r() * 1024, r() * 1024, 80 + r() * 200);
    g.addColorStop(0, 'rgba(60,64,72,0.35)');
    g.addColorStop(1, 'rgba(60,64,72,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 1024);
  }
  // veines claires
  for (let i = 0; i < 38; i++) {
    let px = r() * 1024;
    let py = r() * 1024;
    let a = r() * TAU;
    x.strokeStyle = r() < 0.75 ? 'rgba(225,225,220,0.55)' : 'rgba(205,180,130,0.6)';
    x.lineWidth = 0.6 + r() * 2.2;
    x.beginPath();
    x.moveTo(px, py);
    const n = 20 + r() * 60;
    for (let k = 0; k < n; k++) {
      a += (r() - 0.5) * 0.9;
      px += Math.cos(a) * 9;
      py += Math.sin(a) * 9;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // éclats
  for (let i = 0; i < 70; i++) {
    x.fillStyle = r() < 0.6 ? 'rgba(220,218,210,0.5)' : 'rgba(190,160,110,0.55)';
    x.beginPath();
    const cx = r() * 1024;
    const cy = r() * 1024;
    const s = 2 + r() * 9;
    x.moveTo(cx, cy - s);
    x.lineTo(cx + s * 0.8, cy + s * 0.3);
    x.lineTo(cx - s * 0.6, cy + s * 0.7);
    x.fill();
  }
  return texture(c, true, true);
}

function textureCuir(couleur) {
  const c = canvas(512, 512);
  const x = c.getContext('2d');
  x.fillStyle = couleur;
  x.fillRect(0, 0, 512, 512);
  const b = canvas(512, 512);
  const xb = b.getContext('2d');
  xb.fillStyle = '#808080';
  xb.fillRect(0, 0, 512, 512);
  const r = alea(11);
  // écailles façon croco
  for (let i = 0; i < 900; i++) {
    const cx = r() * 512;
    const cy = r() * 512;
    const s = 5 + r() * 9;
    x.fillStyle = `rgba(0,0,30,${0.05 + r() * 0.12})`;
    xb.fillStyle = `rgb(${150 + r() * 60},${150 + r() * 60},${150 + r() * 60})`;
    for (const ctx of [x, xb]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, s, s * 0.7, r() * 3, 0, TAU);
      ctx.fill();
    }
  }
  return { map: texture(c, true, true), bump: texture(b, false, true) };
}

/* ------------------------------------------------------------------ */
/* Textes gravés                                                       */
/* ------------------------------------------------------------------ */

function policeDe(style) {
  return style === 'serif' ? POLICE_SERIF : style === 'titre' ? POLICE_TITRE : POLICE_SANS;
}

/** Écrit des lignes centrées dans un rectangle, à la plus grande taille possible. */
function ecrireLignes(ctxs, lignes, { x, y, l, h, police = 'sans', gras = false, interligne = 1.25, tailleMax = 999 }) {
  const n = lignes.length;
  const fam = policeDe(police);
  const poids = gras ? '700' : '500';
  const mesure = ctxs[0];
  let taille = Math.min(tailleMax, h / (n * interligne));
  for (const ligne of lignes) {
    if (!ligne) continue;
    mesure.font = `${poids} ${taille}px ${fam}`;
    const w = mesure.measureText(ligne).width;
    if (w > l) taille *= l / w;
  }
  const hauteurBloc = taille * interligne * n;
  let yy = y + (h - hauteurBloc) / 2 + taille * interligne * 0.5;
  for (const ligne of lignes) {
    for (const ctx of ctxs) {
      ctx.font = `${poids} ${taille}px ${fam}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ligne, x + l / 2, yy);
    }
    yy += taille * interligne;
  }
  return taille;
}


function brossage(k, intensite = 0.06, graine = 5) {
  const r = alea(graine);
  for (let i = 0; i < k.h * 1.5; i++) {
    const y = r() * k.h;
    const a = r() * intensite;
    k.cc.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 0.8})`;
    k.cc.fillRect(0, y, k.l, 1);
    k.cm.fillStyle = `rgba(0,${r() < 0.5 ? 255 : 0},0,${a})`;
    k.cm.fillRect(0, y, k.l, 1);
  }
}

/** Plaque gravée : renvoie un matériau. */
function materiauPlaque(p) {
  const L = 1024;
  const H = Math.max(64, Math.round((L * p.h) / p.w));
  const fond = p.fond || 'argent';
  const metal = fond === 'blanc' ? 'email-blanc' : fond;
  const k = calques(L, H, metal);
  if (fond !== 'blanc') brossage(k, fond === 'laiton' ? 0.12 : 0.05);
  // liseré
  const marge = Math.round(H * 0.06);
  if (fond !== 'blanc') {
    k.cc.strokeStyle = 'rgba(40,30,10,0.35)';
    k.cc.lineWidth = Math.max(2, H * 0.012);
    k.cc.strokeRect(marge, marge, L - 2 * marge, H - 2 * marge);
  }
  // texte : sombre, mat, en creux
  const encre = fond === 'blanc' ? '#1a1a1a' : '#2a2620';
  k.cc.fillStyle = encre;
  k.cm.fillStyle = mrCouleur(0.6, fond === 'blanc' ? 0 : 0.25);
  k.cb.fillStyle = '#5a5a5a';
  ecrireLignes([k.cc, k.cm, k.cb], p.lignes, {
    x: marge * 2.2,
    y: marge * 1.6,
    l: L - marge * 4.4,
    h: H - marge * 3.2,
    police: p.police || 'sans',
    gras: p.gras,
  });
  return materiauCalques(k, { reliefEchelle: 0.6, physique: fond === 'blanc' ? { clearcoat: 0.6, clearcoatRoughness: 0.2 } : {} });
}

/* ------------------------------------------------------------------ */
/* Médaillon (disque gravé d'un motif baby-foot)                        */
/* ------------------------------------------------------------------ */

function dessinerBabyfoot(ctx, S, avecTerrain = true) {
  // but en haut, deux joueurs sur une barre, balle en bas : motif générique des médailles
  const c = S / 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (avecTerrain) {
    // cage
    ctx.lineWidth = S * 0.012;
    ctx.strokeRect(c - S * 0.16, S * 0.2, S * 0.32, S * 0.08);
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(c - S * 0.16 + (S * 0.32 * i) / 8, S * 0.2);
      ctx.lineTo(c - S * 0.16 + (S * 0.32 * i) / 8, S * 0.28);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c - S * 0.16, S * 0.24);
    ctx.lineTo(c + S * 0.16, S * 0.24);
    ctx.stroke();
  }
  // barre
  ctx.lineWidth = S * 0.022;
  ctx.beginPath();
  ctx.moveTo(c - S * 0.34, S * 0.5);
  ctx.lineTo(c + S * 0.34, S * 0.5);
  ctx.stroke();
  // deux joueurs
  for (const dx of [-0.13, 0.13]) {
    const px = c + dx * S;
    ctx.beginPath();
    ctx.arc(px, S * 0.38, S * 0.035, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - S * 0.04, S * 0.42);
    ctx.lineTo(px + S * 0.04, S * 0.42);
    ctx.lineTo(px + S * 0.03, S * 0.56);
    ctx.lineTo(px + S * 0.012, S * 0.62);
    ctx.lineTo(px - S * 0.012, S * 0.62);
    ctx.lineTo(px - S * 0.03, S * 0.56);
    ctx.closePath();
    ctx.fill();
  }
  // balle
  ctx.beginPath();
  ctx.arc(c, S * 0.74, S * 0.04, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function dessinerLaurier(ctx, cx, cy, R, sx = 1, sy = 1, epaisseur = 0.16) {
  // deux branches de laurier en arc autour d'un centre
  for (const cote of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const a = Math.PI / 2 + cote * (0.35 + i * 0.23);
      const px = cx + Math.cos(a) * R * sx;
      const py = cy + Math.sin(a) * R * sy;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a + cote * 0.9);
      ctx.scale(sx, sy);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * epaisseur, R * epaisseur * 0.38, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

function materiauMedaillon(motif, metal) {
  const S = 512;
  const fondMetal = motif === 'babyfoot-blanc' ? 'email-blanc' : metal || 'or';
  const k = calques(S, S, fondMetal);
  // anneau extérieur
  peindre(k, motif === 'babyfoot-blanc' ? 'argent' : 'or-pale', (c) => {
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2, 0, TAU);
    c.arc(S / 2, S / 2, S * 0.44, 0, TAU, true);
    c.fill();
  }, '#b0b0b0');
  const encre = motif === 'babyfoot-blanc' ? METAUX['noir-laque'] : { c: '#6b4a1e', r: 0.45, m: 0.6 };
  k.cc.fillStyle = encre.c;
  k.cc.strokeStyle = encre.c;
  k.cm.fillStyle = k.cm.strokeStyle = mrCouleur(encre.r, encre.m);
  k.cb.fillStyle = k.cb.strokeStyle = '#d0d0d0';
  for (const c of [k.cc, k.cm, k.cb]) {
    c.save();
    c.translate(S * 0.04, S * 0.0);
    c.scale(0.92, 0.92);
    dessinerBabyfoot(c, S);
    c.restore();
  }
  return materiauCalques(k, { reliefEchelle: 2, physique: motif === 'babyfoot-blanc' ? { clearcoat: 1, clearcoatRoughness: 0.05 } : {} });
}

function medaillon(r, epaisseur, motif, metal) {
  const geo = new THREE.CylinderGeometry(r, r, epaisseur, 72, 1);
  geo.rotateX(Math.PI / 2);
  const face = materiauMedaillon(motif, metal);
  const bord = materiauMetal(motif === 'babyfoot-blanc' ? 'argent' : metal || 'or');
  return new THREE.Mesh(geo, [bord, face, bord]);
}

/* ------------------------------------------------------------------ */
/* Coupe : surface de révolution                                       */
/* ------------------------------------------------------------------ */

function reechantillonner(points, lisse, pas = 6) {
  // points : [[y, r]] triés du bas (y grand) vers le haut
  const out = [];
  if (lisse) {
    const v = points.map(([y, r]) => new THREE.Vector2(r, y));
    const courbe = new THREE.SplineCurve(v);
    const n = Math.max(points.length * 6, 120);
    for (const p of courbe.getSpacedPoints(n)) out.push([p.y, Math.max(0, p.x)]);
    return out;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const [y0, r0] = points[i];
    const [y1, r1] = points[i + 1];
    const d = Math.hypot(y1 - y0, r1 - r0);
    const n = Math.max(1, Math.ceil(d / pas));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([y0 + (y1 - y0) * t, r0 + (r1 - r0) * t]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function rayonA(profil, y) {
  // profil trié du bas vers le haut (y décroissant)
  for (let i = 0; i < profil.length - 1; i++) {
    const [y0, r0] = profil[i];
    const [y1, r1] = profil[i + 1];
    if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return profil[profil.length - 1][1];
}

function construireCorps(spec, k, yBas) {
  const c = spec.corps;
  const brut = [...c.profil].sort((a, b) => b[0] - a[0]);
  const ext = reechantillonner(brut, c.lisse !== false);
  const yHaut = ext[ext.length - 1][0];
  const yPied = ext[0][0];
  const ep = c.epaisseur ?? 6;
  const yFond = c.fond ?? yHaut + (yPied - yHaut) * 0.35;

  // Profil complet : axe → extérieur → lèvre → intérieur → fond
  const lignes = [[yPied + 0.01, 0, 'ext'], ...ext.map(([y, r]) => [y, r, 'ext'])];
  const rHaut = ext[ext.length - 1][1];
  lignes.push([yHaut - ep * 0.35, rHaut - ep * 0.5, 'levre']);
  const interieur = ext.filter(([y]) => y <= yFond).reverse();
  for (const [y, r] of interieur) lignes.push([y + ep * 0.2, Math.max(0, r - ep), 'int']);
  lignes.push([yFond + ep, 0, 'int']);

  const N = 160;
  const pos = [];
  const uv = [];
  const idx = [];

  const cannelure = (y, th) => {
    let f = 0;
    for (const z of c.cannelures || []) {
      const a = Math.min(z.de, z.a);
      const b = Math.max(z.de, z.a);
      if (y < a || y > b) continue;
      const w = Math.pow(Math.sin((Math.PI * (y - a)) / (b - a)), 0.4);
      f -= z.amp * w * (0.5 - 0.5 * Math.cos(z.n * th));
    }
    return f;
  };
  const coupe = c.coupe;
  const debutCoupe = coupe ? coupe.debut ?? yHaut + (yPied - yHaut) * 0.25 : 0;
  const deformerY = (y, th) => {
    if (!coupe || y > debutCoupe) return y;
    let f;
    if (coupe.type === 'festons') f = 0.5 - 0.5 * Math.cos(coupe.n * (th + (coupe.phase || 0)));
    else f = 0.5 + 0.5 * Math.cos(th - (coupe.phase || 0));
    const sommet = yHaut + coupe.amp * f;
    return debutCoupe + ((y - debutCoupe) * (sommet - debutCoupe)) / (yHaut - debutCoupe);
  };

  for (const [y, r, cote] of lignes) {
    const v = 1 - (Math.min(Math.max(y, yHaut), yPied) - yHaut) / (yPied - yHaut);
    for (let j = 0; j <= N; j++) {
      const u = j / N;
      const th = (u - 0.5) * TAU;
      const rr = cote === 'ext' ? r * (1 + cannelure(y, th)) : r;
      const yy = deformerY(y, th);
      pos.push(rr * k * Math.sin(th), (yBas - yy) * k, rr * k * Math.cos(th));
      uv.push(u, v);
    }
  }
  const L = N + 1;
  for (let i = 0; i < lignes.length - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * L + j;
      const b = a + 1;
      const d = a + L;
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = materiauCalques(peindreCorps(spec, yHaut, yPied, ext), { reliefEchelle: 1.5 });
  mat.side = THREE.DoubleSide;
  return { mesh: new THREE.Mesh(geo, mat), ext, yHaut, yPied };
}

function peindreCorps(spec, yHaut, yPied, ext) {
  const c = spec.corps;
  const W = 1024;
  const H = 1024;
  const k = calques(W, H, spec.metal);
  const ligne = (y) => ((y - yHaut) / (yPied - yHaut)) * H;
  const rMoyen = ext.reduce((s, [, r]) => s + r, 0) / ext.length;

  for (const z of c.zones || []) {
    const a = ligne(Math.min(z.de, z.a));
    const b = ligne(Math.max(z.de, z.a));
    peindre(k, z.mat, (ctx) => ctx.fillRect(0, a, W, b - a));
  }

  for (const b of c.bandes || []) {
    const de = ligne(b.de);
    const a = ligne(b.a);
    if (b.type === 'spirale') {
      // bandes satinées en hélice (coupe Évry 2017)
      peindre(k, b.mat || 'satine', (ctx) => {
        for (let i = 0; i < b.n; i++) {
          const y0 = de + ((a - de) * i) / b.n;
          const ep = b.largeur * H;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, de - 4, W, a - de + 8);
          ctx.clip();
          for (let decal = -2; decal <= 2; decal++) {
            const ya = y0 + decal * b.pente * W;
            ctx.beginPath();
            ctx.moveTo(0, ya);
            ctx.lineTo(W, ya + b.pente * W);
            ctx.lineTo(W, ya + b.pente * W + ep);
            ctx.lineTo(0, ya + ep);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }, '#909090');
    } else if (b.type === 'v') {
      // bande verticale qui s'affine vers le bas, face avant (coupe PACA 2025)
      peindre(k, b.mat || 'bleu-anodise', (ctx) => {
        ctx.beginPath();
        ctx.moveTo(W / 2 - (b.haut * W) / 2, de);
        ctx.lineTo(W / 2 + (b.haut * W) / 2, de);
        ctx.quadraticCurveTo(W / 2 + (b.haut * W) / 5, de + (a - de) * 0.6, W / 2 + (b.bas * W) / 2, a);
        ctx.lineTo(W / 2 - (b.bas * W) / 2, a);
        ctx.quadraticCurveTo(W / 2 - (b.haut * W) / 5, de + (a - de) * 0.6, W / 2 - (b.haut * W) / 2, de);
        ctx.fill();
      }, '#9a9a9a');
      // grain texturé
      const r = alea(21);
      k.cc.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 4000; i++) {
        const px = W / 2 + (r() - 0.5) * b.haut * W;
        const py = de + r() * (a - de);
        k.cc.fillRect(px, py, 2, 2);
      }
    } else if (b.type === 'vague') {
      // bande sombre ondulée et pastilles (coupe PACA 2024)
      peindre(k, b.mat || 'noir-laque', (ctx) => {
        ctx.beginPath();
        const pts = 40;
        for (let i = 0; i <= pts; i++) {
          const t = i / pts;
          const y = de + (a - de) * t;
          const x = W / 2 + Math.sin(t * Math.PI * 1.6 - 0.6) * W * 0.05 - (W * b.haut * (1 - t * 0.85)) / 2;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        for (let i = pts; i >= 0; i--) {
          const t = i / pts;
          const y = de + (a - de) * t;
          const x = W / 2 + Math.sin(t * Math.PI * 1.6 - 0.6) * W * 0.05 + (W * b.haut * (1 - t * 0.85)) / 2 - W * 0.05 * t;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        for (const [px, py, s] of b.pastilles || []) {
          ctx.beginPath();
          ctx.ellipse(W / 2 + px * W, ligne(py), s * W, s * W * 1.3, 0, 0, TAU);
          ctx.fill();
        }
      }, '#707070');
    } else if (b.type === 'fentes') {
      // fentes ajourées en diagonale (coupe de France 2017)
      const r = alea(33);
      peindre(k, 'noir-laque', (ctx) => {
        for (let i = 0; i < b.n; i++) {
          const py = de + r() * (a - de);
          const px = r() * W;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(r() < 0.5 ? -0.5 : 1.1);
          ctx.fillRect(-14, -3, 28, 6);
          ctx.restore();
        }
      }, '#404040');
    } else if (b.type === 'stries') {
      // gorges horizontales fines
      for (let i = 0; i < b.n; i++) {
        const y = de + ((a - de) * (i + 0.5)) / b.n;
        k.cb.fillStyle = '#505050';
        k.cb.fillRect(0, y - 1.5, W, 3);
      }
    }
  }

  // couronne de laurier peinte en relief autour du médaillon
  const md = spec.medaillon;
  if (md && md.couronne) {
    const ry = rayonA(ext, md.y);
    const sx = W / (TAU * ry);
    const sy = H / (yPied - yHaut);
    const cy = ligne(md.y);
    peindre(k, md.couronne.mat || 'argent', (ctx) => dessinerLaurier(ctx, W / 2, cy, md.couronne.r, sx, sy), '#d8d8d8');
  }
  return k;
}

function construireAnses(spec, k, yBas) {
  const groupe = new THREE.Group();
  for (const anse of spec.anses || []) {
    const mat = materiauMetal(anse.mat || spec.metal);
    for (const signe of [1, -1]) {
      const pts = anse.points.map(([x, y]) => new THREE.Vector3(signe * x * k, (yBas - y) * k, 0));
      const courbe = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const tube = new THREE.TubeGeometry(courbe, 120, (anse.rayon || 10) * k, 14, false);
      groupe.add(new THREE.Mesh(tube, mat));
      // embouts arrondis
      for (const p of [pts[0], pts[pts.length - 1]]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry((anse.rayon || 10) * k, 16, 12), mat);
        s.position.copy(p);
        groupe.add(s);
      }
      if (anse.feuille) {
        // feuille d'acanthe stylisée : ellipsoïde nervuré
        const [x0, y0] = anse.feuille.de;
        const [x1, y1] = anse.feuille.a;
        const a = new THREE.Vector3(signe * x0 * k, (yBas - y0) * k, 0);
        const b = new THREE.Vector3(signe * x1 * k, (yBas - y1) * k, 0);
        const longueur = a.distanceTo(b);
        const geo = new THREE.SphereGeometry(1, 40, 24);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const yv = p.getY(i);
          const ang = Math.atan2(p.getZ(i), p.getX(i));
          const dent = 1 + 0.18 * Math.max(0, Math.sin(yv * 22));
          p.setX(i, p.getX(i) * dent);
          p.setZ(i, p.getZ(i) * (0.6 + 0.4 * Math.abs(Math.cos(ang))));
        }
        geo.computeVertexNormals();
        const f = new THREE.Mesh(geo, mat);
        f.scale.set((anse.feuille.largeur / 2) * k, longueur / 2, (anse.feuille.largeur / 3.5) * k);
        f.position.copy(a).lerp(b, 0.5);
        f.lookAt(b);
        f.rotateX(Math.PI / 2);
        groupe.add(f);
      }
    }
  }
  return groupe;
}

/* ------------------------------------------------------------------ */
/* Socle                                                               */
/* ------------------------------------------------------------------ */

function boiteTronquee(lH, pH, lB, pB, h) {
  // pavé à faces planes, plus étroit en haut si lH < lB
  const c = [
    [-lB, 0, pB], [lB, 0, pB], [lB, 0, -pB], [-lB, 0, -pB],
    [-lH, h, pH], [lH, h, pH], [lH, h, -pH], [-lH, h, -pH],
  ];
  const faces = [
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7], [3, 2, 1, 0],
  ];
  const pos = [];
  const uv = [];
  for (const f of faces) {
    const q = f.map((i) => c[i]);
    const tri = [[0, 1, 2], [0, 2, 3]];
    const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const t of tri) for (const i of t) {
      pos.push(...q[i]);
      uv.push(...uvq[i]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function materiauSocle(nom, graine) {
  if (nom === 'marbre') {
    return new THREE.MeshPhysicalMaterial({ map: textureMarbre(graine), roughness: 0.25, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.08 });
  }
  return new THREE.MeshPhysicalMaterial({ map: textureBois(nom, graine), roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
}

function construireSocle(spec, k, yBas) {
  const groupe = new THREE.Group();
  let graine = 3;
  for (const b of spec.socle || []) {
    const h = (b.y1 - b.y0) * k;
    const mat = materiauSocle(b.mat || 'marbre', graine++);
    let mesh;
    if (b.forme === 'tronc') {
      const g = boiteTronquee(b.hw * k, b.hd * k, (b.hwBas ?? b.hw) * k, (b.hdBas ?? b.hd) * k, h);
      mesh = new THREE.Mesh(g, mat);
      mesh.position.y = (yBas - b.y1) * k;
    } else {
      const g = new RoundedBoxGeometry(2 * b.hw * k, h, 2 * b.hd * k, 3, Math.min(5 * k, h * 0.2));
      mesh = new THREE.Mesh(g, mat);
      mesh.position.y = (yBas - b.y1) * k + h / 2;
    }
    groupe.add(mesh);
  }
  const p = spec.plaque;
  if (p) {
    // la plaque se pose sur la face avant du bloc qui la porte
    const bloc = (spec.socle || []).find((b) => p.y >= b.y0 && p.y <= b.y1) || spec.socle[spec.socle.length - 1];
    const t = (p.y - bloc.y0) / (bloc.y1 - bloc.y0);
    const hdHaut = bloc.hd;
    const hdBas = bloc.hdBas ?? bloc.hd;
    const z = (hdHaut + (hdBas - hdHaut) * t) * k + 1.2 * k;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(p.w * k, p.h * k), materiauPlaque(p));
    plaque.position.set(0, (yBas - p.y) * k, z);
    if (bloc.forme === 'tronc') plaque.rotation.x = -Math.atan((hdBas - hdHaut) / (bloc.y1 - bloc.y0));
    groupe.add(plaque);
  }
  return groupe;
}

/* ------------------------------------------------------------------ */
/* Bouclier décoratif (coupe 2008)                                     */
/* ------------------------------------------------------------------ */

function formeEcu(l, h) {
  const s = new THREE.Shape();
  s.moveTo(-l / 2, h / 2);
  s.lineTo(l / 2, h / 2);
  s.lineTo(l / 2, -h * 0.05);
  s.quadraticCurveTo(l / 2, -h * 0.36, 0, -h / 2);
  s.quadraticCurveTo(-l / 2, -h * 0.36, -l / 2, -h * 0.05);
  s.closePath();
  return s;
}

function construireBouclier(spec, k, yBas, ext) {
  const b = spec.bouclier;
  const groupe = new THREE.Group();
  const reglages = { depth: 14 * k, bevelEnabled: true, bevelThickness: 6 * k, bevelSize: 6 * k, bevelSegments: 4, curveSegments: 32 };
  const fondOr = new THREE.Mesh(new THREE.ExtrudeGeometry(formeEcu((b.w + 30) * k, (b.h + 30) * k), reglages), materiauMetal(b.bord || 'or'));
  const face = new THREE.Mesh(new THREE.ExtrudeGeometry(formeEcu(b.w * k, b.h * k), reglages), materiauMetal(b.mat || 'argent'));
  face.position.z = 10 * k;
  groupe.add(fondOr, face);
  // laurier latéral en relief : petites feuilles dorées
  const feuille = new THREE.SphereGeometry(1, 16, 10);
  const matF = materiauMetal('or');
  for (const signe of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + signe * (0.5 + i * 0.26);
      const m = new THREE.Mesh(feuille, matF);
      m.scale.set(30 * k, 11 * k, 6 * k);
      m.position.set(Math.cos(a) * b.w * 0.52 * k, Math.sin(a) * b.h * 0.5 * k + b.h * 0.05 * k, 30 * k);
      m.rotation.z = a + signe * 1.2;
      groupe.add(m);
    }
  }
  const med = medaillon(b.medaillon * k, 8 * k, 'babyfoot', 'or');
  med.position.z = 34 * k;
  med.position.y = b.h * 0.06 * k;
  groupe.add(med);
  const rTige = rayonA(ext, b.y);
  groupe.position.set(0, (yBas - b.y) * k, rTige * k + 4 * k);
  return groupe;
}

/* ------------------------------------------------------------------ */
/* Types de trophées                                                   */
/* ------------------------------------------------------------------ */

function construireCoupe(spec) {
  const ys = [...spec.corps.profil.map((p) => p[0]), ...(spec.socle || []).flatMap((b) => [b.y0, b.y1])];
  const yBas = Math.max(...ys);
  const yTop = Math.min(...ys);
  const k = 1 / (yBas - yTop);
  const groupe = new THREE.Group();
  const corps = construireCorps(spec, k, yBas);
  groupe.add(corps.mesh);
  groupe.add(construireAnses(spec, k, yBas));
  groupe.add(construireSocle(spec, k, yBas));
  const md = spec.medaillon;
  if (md) {
    const r = rayonA(corps.ext, md.y);
    const pente = (rayonA(corps.ext, md.y - 10) - rayonA(corps.ext, md.y + 10)) / 20; // dr/dY
    const pivot = new THREE.Group();
    pivot.position.set(0, (yBas - md.y) * k, 0);
    const m = medaillon(md.r * k, 6 * k, md.motif, md.mat);
    m.position.z = r * k + 2 * k;
    pivot.add(m);
    m.rotation.x = Math.atan(pente);
    groupe.add(pivot);
  }
  if (spec.bouclier) groupe.add(construireBouclier(spec, k, yBas, corps.ext));
  return groupe;
}

function plaqueTexte(l, h, dessin, metal, options) {
  const L = 1024;
  const H = Math.round((L * h) / l);
  const k = calques(L, H, metal);
  dessin(k, L, H);
  return new THREE.Mesh(new THREE.PlaneGeometry(l, h), materiauCalques(k, options));
}

function construireEcusson(spec) {
  // Écusson en bois verni : disque doré, millésimes, plaque des joueurs (champion de France 2002-2003)
  const groupe = new THREE.Group();
  const k = 1 / 1250;
  // Contour relevé sur la photo de l'écusson, redressé par homographie (plaques rectangulaires,
  // disque circulaire) : demi-contour droit, du sommet (axe) à la pointe basse, y vers le bas.
  // Mêmes unités que les plaques ci-dessous.
  const demi = [[0,-313],[50,-291],[97,-274],[145,-262],[194,-254],[244,-252],[293,-254],[342,-262],[391,-274],[438,-290],[485,-305],[532,-299],[564,-261],[596,-222],[627,-184],[659,-146],[678,-101],[665,-53],[644,-8],[627,39],[615,87],[608,136],[607,186],[611,235],[621,284],[636,331],[654,378],[673,424],[690,470],[704,518],[717,566],[727,615],[735,664],[740,713],[743,763],[742,812],[735,862],[724,910],[706,956],[682,1000],[654,1041],[622,1079],[583,1110],[541,1136],[496,1157],[450,1175],[402,1190],[354,1203],[306,1215],[257,1226],[209,1236],[161,1248],[113,1263],[67,1283],[27,1310],[0,1328]];
  const contour = [...demi, ...demi.slice(1, -1).reverse().map(([x, y]) => [-x, y])].map(([x, y]) => new THREE.Vector2(x, -y));
  const s = new THREE.Shape();
  s.moveTo(contour[0].x, contour[0].y);
  s.splineThru([...contour.slice(1), contour[0]]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 40, bevelEnabled: true, bevelThickness: 10, bevelSize: 10, bevelSegments: 5, curveSegments: 64 });
  // UV planes sur toute la face
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 760) / 1520, (p.getY(i) + 1340) / 1680);
  geo.scale(k, k, k);
  const bois = new THREE.MeshPhysicalMaterial({ map: textureBois('acajou', 9), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 });
  bois.map.rotation = Math.PI / 2;
  groupe.add(new THREE.Mesh(geo, bois));
  const zFace = 52 * k;

  // disque doré
  const disque = plaqueTexte(598 * k, 598 * k, (c, L, H) => {
    brossage(c, 0.05);
    c.cc.fillStyle = '#20314f';
    c.cm.fillStyle = mrCouleur(0.55, 0.2);
    c.cb.fillStyle = '#505050';
    const ctxs = [c.cc, c.cm, c.cb];
    // texte en arc
    const texte = 'Champion de France des Clubs';
    for (const ctx of ctxs) {
      ctx.save();
      ctx.translate(L / 2, H / 2);
      ctx.font = `italic 700 ${L * 0.075}px ${POLICE_SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const R = L * 0.38;
      const total = Math.PI * 1.05;
      for (let i = 0; i < texte.length; i++) {
        const a = -Math.PI / 2 - total / 2 + (total * (i + 0.5)) / texte.length;
        ctx.save();
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(texte[i], 0, -R);
        ctx.restore();
      }
      ctx.restore();
    }
    ecrireLignes(ctxs, ['FFFT'], { x: L * 0.2, y: H * 0.36, l: L * 0.6, h: H * 0.18, police: 'sans', gras: true });
    ecrireLignes(ctxs, ['Division 1'], { x: L * 0.25, y: H * 0.58, l: L * 0.5, h: H * 0.12, police: 'serif', gras: true });
    ecrireLignes(ctxs, ['Nantes 2002/2003'], { x: L * 0.22, y: H * 0.72, l: L * 0.56, h: H * 0.1, police: 'serif' });
  }, 'or', { reliefEchelle: 0.6, physique: { transparent: true } });
  // découpe ronde
  disque.material.alphaMap = (() => {
    const c = canvas(256, 256);
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(128, 128, 127, 0, TAU);
    x.fill();
    return texture(c, false);
  })();
  disque.material.alphaTest = 0.5;
  disque.material.transparent = false;
  disque.position.set(0, -213 * k, zFace + 3 * k);
  groupe.add(disque);
  const bordDisque = new THREE.Mesh(new THREE.TorusGeometry(301 * k, 7 * k, 12, 96), materiauMetal('or'));
  bordDisque.position.copy(disque.position);
  groupe.add(bordDisque);

  // millésimes verticaux
  for (const [annee, x] of [['2002', -455], ['2003', 455]]) {
    const pl = plaqueTexte(117 * k, 420 * k, (c, L, H) => {
      brossage(c, 0.06);
      c.cc.fillStyle = '#2b3550';
      c.cm.fillStyle = mrCouleur(0.55, 0.2);
      c.cb.fillStyle = '#505050';
      for (let i = 0; i < 4; i++) {
        ecrireLignes([c.cc, c.cm, c.cb], [annee[i]], { x: 0, y: (H * i) / 4 + H * 0.02, l: L, h: H / 4 - H * 0.04, police: 'serif', gras: true });
      }
    }, 'or', { reliefEchelle: 0.6 });
    pl.position.set(x * k, -210 * k, zFace + 2 * k);
    groupe.add(pl);
  }

  // plaque des joueurs
  const equipe = spec.equipe || [];
  const plj = plaqueTexte(851 * k, 449 * k, (c, L, H) => {
    brossage(c, 0.1);
    const lignes = [[0, 1, 2], [3, 4, 5], [6, 7], [8, 9]];
    const hl = H / (lignes.length + 0.6);
    // même taille de lettres pour tous les noms : celle qui fait tenir le plus long
    c.cc.font = `500 100px ${POLICE_SANS}`;
    const plusLong = Math.max(...equipe.map((n) => c.cc.measureText(n).width));
    const tailleNoms = Math.min(hl * 0.42, (100 * L * 0.31 * 0.9) / plusLong);
    lignes.forEach((rang, li) => {
      const largeur = L * 0.31;
      const total = rang.length * largeur + (rang.length - 1) * L * 0.02;
      rang.forEach((n, ci) => {
        if (!equipe[n]) return;
        const x = (L - total) / 2 + ci * (largeur + L * 0.02);
        const y = hl * 0.3 + li * hl;
        peindre(c, 'or-pale', (ctx) => ctx.fillRect(x, y, largeur, hl * 0.72), '#9a9a9a');
        c.cc.fillStyle = '#3a2c12';
        c.cm.fillStyle = mrCouleur(0.6, 0.2);
        ecrireLignes([c.cc, c.cm], [equipe[n]], { x: x + largeur * 0.06, y, l: largeur * 0.88, h: hl * 0.72, police: 'sans', tailleMax: tailleNoms });
      });
    });
    // branche de laurier gravée
    c.cc.strokeStyle = '#3a2c12';
    c.cc.lineWidth = 3;
    c.cc.beginPath();
    c.cc.moveTo(L * 0.12, H * 0.93);
    c.cc.quadraticCurveTo(L * 0.5, H * 1.02, L * 0.9, H * 0.82);
    c.cc.stroke();
  }, 'laiton', { reliefEchelle: 0.8 });
  plj.position.set(0, -928 * k, zFace + 2 * k);
  groupe.add(plj);
  return groupe;
}

function construireCoffret(spec) {
  // Coffret de présentation ouvert : plateau + couvercle relevé portant la plaque
  const c = spec.coffret;
  const k = 1 / 1250;
  const groupe = new THREE.Group();
  const cuir = textureCuir(c.couleur || '#1f4f9e');
  const matCuir = new THREE.MeshPhysicalMaterial({ map: cuir.map, bumpMap: cuir.bump, bumpScale: 1.2, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const matVelours = new THREE.MeshPhysicalMaterial({ color: '#1b2a6b', roughness: 0.95, sheen: 1, sheenColor: new THREE.Color('#5a6fd0'), sheenRoughness: 0.5 });
  const L = 900;
  // plateau
  const plateau = new THREE.Mesh(new THREE.BoxGeometry(L * k, 70 * k, 640 * k), [matCuir, matCuir, matVelours, matCuir, matCuir, matCuir]);
  plateau.position.set(0, 35 * k, 120 * k);
  groupe.add(plateau);
  // couvercle
  const charniere = new THREE.Group();
  charniere.position.set(0, 70 * k, -200 * k);
  const couvercle = new THREE.Mesh(new THREE.BoxGeometry(L * k, 1100 * k, 60 * k), [matCuir, matCuir, matCuir, matCuir, matVelours, matCuir]);
  couvercle.position.set(0, 550 * k, -30 * k);
  charniere.add(couvercle);
  charniere.rotation.x = -0.12;
  groupe.add(charniere);
  // fermoirs dorés
  const matOr = materiauMetal('or-pale');
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(110 * k, 26 * k, 14 * k), matOr);
  f1.position.set(0, 1080 * k, 4 * k);
  charniere.add(f1);
  const f2 = new THREE.Mesh(new THREE.BoxGeometry(110 * k, 40 * k, 14 * k), matOr);
  f2.position.set(0, 35 * k, 445 * k);
  groupe.add(f2);

  // panneau intérieur et plaque
  const p = c.plaque;
  const zP = 2 * k;
  if (p.type === 'parchemin') {
    const fond = plaqueTexte(790 * k, 1000 * k, (cal, Lc, Hc) => {
      // ronce bleue vernie
      const r = alea(4);
      cal.cc.fillStyle = '#2459c4';
      cal.cc.fillRect(0, 0, Lc, Hc);
      for (let i = 0; i < 260; i++) {
        cal.cc.fillStyle = r() < 0.7 ? `rgba(20,50,140,${r() * 0.5})` : `rgba(120,40,90,${r() * 0.35})`;
        cal.cc.beginPath();
        cal.cc.ellipse(r() * Lc, r() * Hc, 10 + r() * 60, 6 + r() * 30, r() * 3, 0, TAU);
        cal.cc.fill();
      }
      cal.cm.fillStyle = mrCouleur(0.2, 0);
      cal.cm.fillRect(0, 0, Lc, Hc);
      // cadre doré
      peindre(cal, 'or-pale', (ctx) => {
        ctx.fillRect(0, 0, Lc, 14);
        ctx.fillRect(0, Hc - 14, Lc, 14);
        ctx.fillRect(0, 0, 14, Hc);
        ctx.fillRect(Lc - 14, 0, 14, Hc);
      });
    }, 'or', { physique: { clearcoat: 1, clearcoatRoughness: 0.05 } });
    fond.position.set(0, 550 * k, zP);
    couvercle.add(fond);
    fond.position.y = 0;
    fond.position.z = 31 * k;
    const parchemin = plaqueTexte(660 * k, 880 * k, (cal, Lc, Hc) => {
      brossage(cal, 0.05);
      const encre = '#3c3324';
      // rouleaux en haut et en bas
      cal.cc.strokeStyle = encre;
      cal.cc.lineWidth = 3;
      for (const yy of [Hc * 0.06, Hc * 0.94]) {
        for (let i = -2; i <= 2; i++) {
          cal.cc.beginPath();
          cal.cc.moveTo(Lc * 0.08, yy + i * 9);
          cal.cc.lineTo(Lc * 0.92, yy + i * 4);
          cal.cc.stroke();
        }
        cal.cc.beginPath();
        cal.cc.arc(Lc * 0.06, yy, 26, 0, TAU);
        cal.cc.arc(Lc * 0.94, yy, 26, 0, TAU);
        cal.cc.stroke();
      }
      cal.cc.fillStyle = encre;
      cal.cm.fillStyle = mrCouleur(0.6, 0.2);
      cal.cb.fillStyle = '#5a5a5a';
      ecrireLignes([cal.cc, cal.cm, cal.cb], p.lignes, { x: Lc * 0.12, y: Hc * 0.5, l: Lc * 0.76, h: Hc * 0.36, police: 'sans', interligne: 1.35 });
    }, 'or-pale', { reliefEchelle: 0.6 });
    parchemin.position.set(0, 0, 33 * k);
    couvercle.add(parchemin);
    const med = medaillon(95 * k, 10 * k, 'babyfoot', 'or');
    med.position.set(0, 150 * k, 40 * k);
    couvercle.add(med);
    const couronne = new THREE.Mesh(new THREE.TorusGeometry(125 * k, 22 * k, 14, 64), materiauMetal('or'));
    couronne.position.copy(med.position);
    couronne.scale.z = 0.5;
    couvercle.add(couronne);
  } else {
    const imprimee = plaqueTexte(790 * k, 1000 * k, (cal, Lc, Hc) => {
      // fond bleu nuit moiré, filets dorés, textes argentés
      const g = cal.cc.createLinearGradient(0, 0, Lc, Hc);
      g.addColorStop(0, '#0f2350');
      g.addColorStop(0.5, '#1d3e86');
      g.addColorStop(1, '#0d1f47');
      cal.cc.fillStyle = g;
      cal.cc.fillRect(0, 0, Lc, Hc);
      const r = alea(8);
      cal.cc.strokeStyle = 'rgba(120,170,255,0.18)';
      for (let i = 0; i < 40; i++) {
        cal.cc.lineWidth = 2 + r() * 8;
        cal.cc.beginPath();
        cal.cc.moveTo(0, r() * Hc);
        cal.cc.bezierCurveTo(Lc * 0.3, r() * Hc, Lc * 0.7, r() * Hc, Lc, r() * Hc);
        cal.cc.stroke();
      }
      cal.cm.fillStyle = mrCouleur(0.25, 0);
      cal.cm.fillRect(0, 0, Lc, Hc);
      peindre(cal, 'or-pale', (ctx) => {
        for (const m of [10, 34]) {
          ctx.fillRect(m, m, Lc - 2 * m, 6);
          ctx.fillRect(m, Hc - m - 6, Lc - 2 * m, 6);
          ctx.fillRect(m, m, 6, Hc - 2 * m);
          ctx.fillRect(Lc - m - 6, m, 6, Hc - 2 * m);
        }
      });
      // ellipse et sigle
      const argent = METAUX.argent;
      cal.cc.strokeStyle = argent.c;
      cal.cm.strokeStyle = mrCouleur(argent.r, 1);
      for (const ctx of [cal.cc, cal.cm]) {
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.ellipse(Lc / 2, Hc * 0.24, Lc * 0.34, Hc * 0.11, -0.05, 0, TAU);
        ctx.stroke();
      }
      cal.cc.fillStyle = argent.c;
      cal.cm.fillStyle = mrCouleur(argent.r, 1);
      ecrireLignes([cal.cc, cal.cm], [p.sigle || 'FFFT'], { x: Lc * 0.24, y: Hc * 0.17, l: Lc * 0.52, h: Hc * 0.1, police: 'sans', gras: true });
      ecrireLignes([cal.cc, cal.cm], ['FÉDÉRATION FRANÇAISE DE FOOTBALL DE TABLE'], { x: Lc * 0.26, y: Hc * 0.28, l: Lc * 0.48, h: Hc * 0.03, police: 'sans', gras: true });
      ecrireLignes([cal.cc, cal.cm], p.lignes, { x: Lc * 0.12, y: Hc * 0.46, l: Lc * 0.76, h: Hc * 0.42, police: 'serif', gras: true, interligne: 1.45 });
    }, 'argent', { physique: { clearcoat: 1, clearcoatRoughness: 0.04 } });
    imprimee.position.set(0, 0, 31 * k);
    couvercle.add(imprimee);
  }
  return groupe;
}

function construirePlateau(spec) {
  // Plateau ovale gravé posé sur un chevalet (coupe de France 2019)
  const groupe = new THREE.Group();
  const a = 0.62;
  const b = 0.47;
  const N = 128;
  const M = 48;
  const hauteur = (rho) => {
    if (rho < 0.8) return 0;
    if (rho < 0.92) return 0.05 * Math.pow((rho - 0.8) / 0.12, 1.6);
    const t = (rho - 0.92) / 0.08;
    return 0.05 + 0.025 * Math.sin(t * Math.PI);
  };
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= M; i++) {
    const rho = i / M;
    for (let j = 0; j <= N; j++) {
      const th = (j / N) * TAU;
      const x = a * rho * Math.cos(th);
      const y = b * rho * Math.sin(th);
      pos.push(x, y, hauteur(rho) * 0.6);
      uv.push(x / (2 * a) + 0.5, y / (2 * b) + 0.5);
    }
  }
  for (let i = 0; i < M; i++) for (let j = 0; j < N; j++) {
    const p0 = i * (N + 1) + j;
    const p1 = p0 + 1;
    const p2 = p0 + N + 1;
    const p3 = p2 + 1;
    idx.push(p0, p2, p1, p1, p2, p3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const L = 1024;
  const H = Math.round((L * b) / a);
  const k = calques(L, H, 'chrome');
  const encre = { c: '#7d838b', r: 0.55, m: 0.9 };
  const gravure = [k.cc, k.cm, k.cb];
  k.cc.fillStyle = k.cc.strokeStyle = encre.c;
  k.cm.fillStyle = k.cm.strokeStyle = mrCouleur(encre.r, 1);
  k.cb.fillStyle = k.cb.strokeStyle = '#5a5a5a';
  for (const ctx of gravure) {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(L / 2, H * 0.24, H * 0.1, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(L / 2 - H * 0.1, H * 0.14);
    ctx.scale(0.4, 0.4);
    dessinerBabyfoot(ctx, H * 0.5, false);
    ctx.restore();
  }
  // Le plateau est vu de face : on retourne l'axe vertical du dessin
  ecrireLignes(gravure, spec.plateau.lignes, { x: L * 0.18, y: H * 0.37, l: L * 0.64, h: H * 0.42, police: 'sans', interligne: 1.5 });
  const mat = materiauCalques(k, { reliefEchelle: 0.5 });
  mat.side = THREE.DoubleSide;
  mat.map.flipY = true;
  const plateau = new THREE.Mesh(geo, mat);
  // dessous du plateau
  const dessous = new THREE.Mesh(new THREE.CircleGeometry(1, 64), materiauMetal('chrome'));
  dessous.scale.set(a, b, 1);
  dessous.position.z = -0.004;
  dessous.rotation.y = Math.PI;
  const pivot = new THREE.Group();
  pivot.add(plateau, dessous);
  pivot.rotation.x = -0.28;
  pivot.position.set(0, b * Math.cos(0.28) + 0.04, 0);
  groupe.add(pivot);
  // chevalet noir
  const noir = new THREE.MeshPhysicalMaterial({ color: '#15171b', roughness: 0.35, clearcoat: 0.6 });
  for (const sx of [-1, 1]) {
    const pied = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.1, 0.05, 2, 0.012), noir);
    pied.position.set(sx * 0.22, 0.05, 0.06);
    groupe.add(pied);
  }
  const barre = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.6, 0.03, 2, 0.01), noir);
  barre.position.set(0, 0.32, -0.16);
  barre.rotation.x = -0.4;
  groupe.add(barre);
  return groupe;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function chargerPolices() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([
    document.fonts.load(`500 40px ${POLICE_SANS}`),
    document.fonts.load(`700 40px ${POLICE_SANS}`),
    document.fonts.load(`800 40px ${POLICE_TITRE}`),
  ]).catch(() => {});
}

/** Construit le trophée, normalisé : base à y = 0, hauteur 1, centré sur l'axe vertical. */
export async function construireTrophee(spec) {
  await chargerPolices();
  let objet;
  if (spec.type === 'ecusson') objet = construireEcusson(spec);
  else if (spec.type === 'coffret') objet = construireCoffret(spec);
  else if (spec.type === 'plateau') objet = construirePlateau(spec);
  else objet = construireCoupe(spec);
  const racine = new THREE.Group();
  racine.add(objet);
  const boite = new THREE.Box3().setFromObject(racine);
  const h = boite.max.y - boite.min.y;
  const centre = boite.getCenter(new THREE.Vector3());
  objet.position.sub(new THREE.Vector3(centre.x, boite.min.y, centre.z));
  racine.scale.setScalar(1 / h);
  racine.updateMatrixWorld(true);
  return racine;
}

/** Studio photo virtuel : dôme dégradé + boîtes à lumière, aucune salle à refléter. */
export function creerEnvironnement(renderer) {
  const scene = new THREE.Scene();
  const sphere = new THREE.SphereGeometry(50, 64, 32);
  const couleurs = [];
  const haut = new THREE.Color('#f7f9fc');
  const horizon = new THREE.Color('#aab8c8');
  const bas = new THREE.Color('#465263');
  const p = sphere.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / 50;
    const c = t > 0 ? horizon.clone().lerp(haut, Math.pow(t, 0.7)) : horizon.clone().lerp(bas, Math.pow(-t, 0.5));
    couleurs.push(c.r, c.g, c.b);
  }
  sphere.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  scene.add(new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const boite = (l, h, x, y, z, intensite, couleur = '#ffffff') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur).multiplyScalar(intensite), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  boite(22, 12, -14, 20, 16, 3.2); // principale, en haut à gauche
  boite(3, 34, -24, 4, 4, 4.2); // bande verticale gauche
  boite(3, 34, 24, 4, -2, 3.4); // bande verticale droite
  boite(18, 5, 0, 3, 28, 1.4); // débouché de face
  boite(36, 2.5, 0, 12, -26, 2.2, '#2aa9e0'); // liseré bleu Marseille à l'arrière
  boite(60, 60, 0, -16, 0, 1, '#4a5565'); // sol gris moyen, sans noir profond
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  return env;
}

/** Ombre de contact douce sous le trophée. */
export function ombreContact(largeur = 0.9, profondeur = 0.5) {
  const c = canvas(256, 256);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(11,29,58,0.55)');
  g.addColorStop(0.55, 'rgba(11,29,58,0.18)');
  g.addColorStop(1, 'rgba(11,29,58,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(largeur, profondeur), new THREE.MeshBasicMaterial({ map: texture(c, true), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.001;
  return m;
}

/** Place la caméra pour cadrer l'objet. */
export function cadrer(camera, objet, { azimut = -0.18, elevation = 0.12, marge = 1.08 } = {}) {
  const boite = new THREE.Box3().setFromObject(objet);
  const sphere = boite.getBoundingSphere(new THREE.Sphere());
  const centre = boite.getCenter(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const tailleH = boite.max.y - boite.min.y;
  const tailleL = Math.max(boite.max.x - boite.min.x, boite.max.z - boite.min.z);
  const dV = (tailleH / 2) / Math.tan(fov / 2);
  const dH = (tailleL / 2) / (Math.tan(fov / 2) * camera.aspect);
  const d = Math.max(dV, dH) * marge + sphere.radius * 0.35;
  camera.position.set(
    centre.x + d * Math.sin(azimut) * Math.cos(elevation),
    centre.y + d * Math.sin(elevation),
    centre.z + d * Math.cos(azimut) * Math.cos(elevation),
  );
  camera.lookAt(centre);
  camera.near = d / 20;
  camera.far = d * 10;
  camera.updateProjectionMatrix();
  return centre;
}

export function configurerRendu(renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

export { THREE };
