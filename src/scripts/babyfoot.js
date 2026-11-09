/*
 * Baby-foot interactif de l'ASBM
 * ------------------------------------------------------------
 * Table vue de dessus dessinée en canvas : caisson en bois, terrain,
 * barres chromées, 11 joueurs par équipe (1-2-5-3) qui pivotent,
 * balle avec ombre et roulement, boulier de score.
 *
 * Table et figurines façon Tornado T-3000 : caisson noir, terrain vert à rampes de coin,
 * barres traversantes, poignées en bois, figurines contrebalancées jaunes contre noires.
 * Vous jouez les jaunes, l'ordinateur les noirs. Quand un de vos joueurs a la balle,
 * vous pouvez tracer au doigt la trajectoire du tir.
 *  - Souris / doigt : saisir une barre, glisser le long de la barre pour la
 *    déplacer, glisser vers l'avant pour faire pivoter les joueurs et tirer.
 *    Un appui bref = frappe. Plusieurs doigts = plusieurs barres.
 *  - Clavier : flèches pour choisir et déplacer une barre, Espace pour tirer,
 *    Échap pour quitter.
 * Sur écran étroit, la table passe à la verticale (vos buts en bas).
 * Script autonome (pas de module) : fonctionne aussi en ouvrant le fichier local.
 */
(function () {
  'use strict';

  var racine = document.querySelector('[data-babyfoot]');
  if (!racine) return;
  var scene = racine.querySelector('[data-bf-scene]');
  var canvas = racine.querySelector('canvas');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;
  var boutonJouer = racine.querySelector('[data-bf-jouer]');
  var boutonQuitter = racine.querySelector('[data-bf-quitter]');
  var elScoreB = racine.querySelector('[data-bf-score-b]');
  var elScoreR = racine.querySelector('[data-bf-score-r]');
  var elAnnonce = racine.querySelector('[data-bf-annonce]');
  var elConsigne = racine.querySelector('[data-bf-consigne]');
  var panneauFin = racine.querySelector('[data-bf-fin]');
  var titreFin = racine.querySelector('[data-bf-fin-score]');
  var boutonRejouer = racine.querySelector('[data-bf-rejouer]');

  // ---------- Monde (1 unité ≈ 1 mm) ----------
  var FW = 1200, FH = 680, MUR = 58, MARGE = 124;
  var CY = FH / 2, BUT = 96, R = 17;
  var VX0 = -MUR - 10, VX1 = FW + MUR + 10, VY0 = -MUR - MARGE, VY1 = FH + MUR + MARGE;
  var VW = VX1 - VX0, VH = VY1 - VY0;
  var MARGE_PORTRAIT = 62; // sur mobile, les poignées sont en partie hors cadre : la table est plus grande
  var PIED = 62, TETE = 32, PHX = 13, PHY = 19, FIG = 1.6;
  var VMAX = 1500, E_MUR = 0.68, E_PIED = 0.38;
  var GAIN_ROT = (Math.PI / 2) / 80;
  var V_IA = 330; // vitesse maximale de déplacement des barres rouges
  var COUL = {
    // couleurs des figurines Tornado : jaunes contre noirs
    b: { base: '#f7c623', fonce: '#a87a00', clair: '#fff1a0', biseau: '#d9a50e', reflet: 'rgba(255, 255, 255, 0.45)', trait: 'rgba(90, 60, 0, 0.6)', nom: 'jaunes' },
    r: { base: '#25282e', fonce: '#08090b', clair: '#6c737e', biseau: '#16181c', reflet: 'rgba(255, 255, 255, 0.22)', trait: 'rgba(0, 0, 0, 0.7)', nom: 'noirs' }
  };

  var barres = [
    [75, 'b', [0], 150],
    [225, 'b', [-170, 170], 150],
    [375, 'r', [-210, 0, 210], 110],
    [525, 'b', [-240, -120, 0, 120, 240], 80],
    [675, 'r', [-240, -120, 0, 120, 240], 80],
    [825, 'b', [-210, 0, 210], 110],
    [975, 'r', [-170, 170], 150],
    [1125, 'r', [0], 150]
  ].map(function (d) {
    return {
      x: d[0], eq: d[1], hommes: d[2], course: d[3],
      off: 0, cible: 0, th: 0, cibleTh: 0, w: 0, wLibre: 0, vy: 0,
      saisie: 0, frappe: 0, recharge: 0, iaT: 0, iaCible: 0,
      v: 0, vMax: V_IA, err: 0, errT: 0, ignore: 0, verrou: 0, essai: false, possede: false, poss: null
    };
  });
  var bleues = barres.filter(function (b) { return b.eq === 'b'; });

  var balle = { x: FW / 2 + 36, y: CY, vx: 0, vy: 0, rot: 0, visible: true };
  var score = { b: 0, r: 0 };
  var etat = { mode: 'repos', pause: 0, fin: false, immobile: 0, fige: false };
  var flash = { t: 0, txt: '', coul: '#fff' };
  // Tir tracé au doigt : quand un joueur jaune tient la balle, on propose de dessiner sa trajectoire
  var trace = { dispo: false, tenue: 0, refus: false, actif: false, dessin: null, pts: [], suivi: null, fondu: 0 };
  var V_TRACE = 880, L_TRACE = 1900;
  var pointeurs = {};
  var selection = 2; // barre des milieux par défaut
  var visible = true, raf = 0, dernier = 0;

  // ---------- Outils ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function alea(graine) {
    return function () {
      graine |= 0; graine = (graine + 0x6D2B79F5) | 0;
      var t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function yHomme(b, h) { return CY + h + b.off; }

  // ---------- Vue (paysage ou portrait) ----------
  var dpr = 1, portrait = false, echelle = 1, cssW = 0, cssH = 0;
  var omb = { x: 1, y: 1.35 }; // direction des ombres (dans le monde)
  var fond = document.createElement('canvas');
  var fctx = fond.getContext('2d');

  function appliquerVue(c) {
    var s = echelle * dpr;
    if (portrait) c.setTransform(0, -s, s, 0, -s * VY0, s * VX1);
    else c.setTransform(s, 0, 0, s, -s * VX0, -s * VY0);
  }
  function versMonde(cx, cy) {
    var r = canvas.getBoundingClientRect();
    var X = cx - r.left, Y = cy - r.top;
    if (portrait) return { x: VX1 - Y / echelle, y: X / echelle + VY0 };
    return { x: X / echelle + VX0, y: Y / echelle + VY0 };
  }

  function redimensionner() {
    var largeur = scene.clientWidth;
    if (!largeur) return;
    portrait = largeur < 560;
    var m = portrait ? MARGE_PORTRAIT : MARGE;
    VY0 = -MUR - m; VY1 = FH + MUR + m; VH = VY1 - VY0;
    cssW = largeur;
    cssH = Math.round(largeur * (portrait ? VW / VH : VH / VW));
    echelle = portrait ? cssW / VH : cssW / VW;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    fond.width = canvas.width;
    fond.height = canvas.height;
    omb = portrait ? { x: -1.35, y: 1 } : { x: 1, y: 1.35 };
    racine.classList.toggle('bf--portrait', portrait);
    dessinerFond();
    majConsigne();
    dessiner();
  }

  // ---------- Décor fixe (caisson, terrain) ----------
  function dessinerFond() {
    var c = fctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, fond.width, fond.height);
    appliquerVue(c);
    var x0 = -MUR, y0 = -MUR, w = FW + 2 * MUR, h = FH + 2 * MUR;

    // Ombre portée de la table
    c.save();
    c.shadowColor = 'rgba(3, 10, 24, 0.6)';
    c.shadowBlur = 34 * dpr * echelle * 1.4;
    c.shadowOffsetX = 10 * dpr * echelle * 1.4;
    c.shadowOffsetY = 16 * dpr * echelle * 1.4;
    rr(c, x0, y0, w, h, 14);
    c.fillStyle = '#0c0d10';
    c.fill();
    c.restore();

    // Caisson façon Tornado T-3000 : stratifié noir mat, arêtes vives légèrement adoucies
    c.save();
    rr(c, x0, y0, w, h, 14);
    c.clip();
    var g = c.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#2a2d33');
    g.addColorStop(0.5, '#17191d');
    g.addColorStop(1, '#202227');
    c.fillStyle = g;
    c.fillRect(x0, y0, w, h);
    // grain fin du stratifié
    var rnd = alea(3000);
    for (var i = 0; i < 900; i++) {
      c.fillStyle = 'rgba(255,255,255,' + (0.015 + rnd() * 0.03).toFixed(3) + ')';
      c.fillRect(x0 + rnd() * w, y0 + rnd() * h, 2, 2);
    }
    // reflet du plateau sur l'arête des rails
    var reflet = c.createLinearGradient(0, y0, 0, y0 + 26);
    reflet.addColorStop(0, 'rgba(255,255,255,0.18)');
    reflet.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = reflet;
    c.fillRect(x0, y0, w, 26);
    c.restore();
    rr(c, x0 + 1, y0 + 1, w - 2, h - 2, 13);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    c.stroke();
    // bord intérieur chanfreiné du caisson autour du terrain
    c.strokeStyle = '#3a3e46';
    c.lineWidth = 6;
    c.strokeRect(-3, -3, FW + 6, FH + 6);

    // Buts (ouvertures sombres dans les murs d'extrémité)
    [[-MUR + 10, 0], [FW, FW + MUR - 10]].forEach(function (b, k) {
      var gx = c.createLinearGradient(b[0], 0, b[1], 0);
      var ext = '#1a1c20', inte = '#020203';
      gx.addColorStop(0, k === 0 ? ext : inte);
      gx.addColorStop(1, k === 0 ? inte : ext);
      c.fillStyle = gx;
      c.fillRect(b[0], CY - BUT, b[1] - b[0], 2 * BUT);
      c.fillStyle = '#c9ced6';
      c.fillRect(b[0], CY - BUT - 3, b[1] - b[0], 3);
      c.fillRect(b[0], CY + BUT, b[1] - b[0], 3);
    });

    // Terrain
    c.save();
    c.beginPath();
    c.rect(0, 0, FW, FH);
    c.clip();
    var gt = c.createRadialGradient(FW * 0.46, FH * 0.42, 40, FW / 2, FH / 2, FW * 0.72);
    gt.addColorStop(0, '#2f8f47');
    gt.addColorStop(1, '#1d6a33');
    c.fillStyle = gt;
    c.fillRect(0, 0, FW, FH);
    c.fillStyle = motifGrain(c);
    c.fillRect(0, 0, FW, FH);
    // Lignes peintes
    c.strokeStyle = 'rgba(244, 250, 245, 0.92)';
    c.fillStyle = 'rgba(244, 250, 245, 0.92)';
    c.lineWidth = 4;
    c.strokeRect(10, 10, FW - 20, FH - 20);
    c.beginPath(); c.moveTo(FW / 2, 10); c.lineTo(FW / 2, FH - 10); c.stroke();
    c.beginPath(); c.arc(FW / 2, CY, 90, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(FW / 2, CY, 6, 0, Math.PI * 2); c.fill();
    // Sigle du club peint sur le terrain
    c.save();
    c.translate(FW / 2, CY);
    c.fillStyle = 'rgba(244, 250, 245, 0.16)';
    c.font = '800 64px "Big Shoulders Display", "Arial Narrow", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ASBM', 0, -44);
    c.font = '700 26px "Big Shoulders Display", "Arial Narrow", sans-serif';
    c.fillText('MARSEILLE', 0, 44);
    c.restore();
    c.strokeRect(10, CY - 125, 58, 250);
    c.strokeRect(10, CY - 205, 170, 410);
    c.strokeRect(FW - 68, CY - 125, 58, 250);
    c.strokeRect(FW - 180, CY - 205, 170, 410);
    c.beginPath(); c.arc(180, CY, 60, -Math.PI / 2.6, Math.PI / 2.6); c.stroke();
    c.beginPath(); c.arc(FW - 180, CY, 60, Math.PI - Math.PI / 2.6, Math.PI + Math.PI / 2.6); c.stroke();
    // Rampes de coin (plateau Tornado) : la balle ne reste pas bloquée dans les coins
    [[0, 0, 1, 1], [FW, 0, -1, 1], [0, FH, 1, -1], [FW, FH, -1, -1]].forEach(function (q) {
      var L = 70;
      var gr = c.createLinearGradient(q[0], q[1], q[0] + q[2] * L * 0.6, q[1] + q[3] * L * 0.6);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(q[0], q[1]);
      c.lineTo(q[0] + q[2] * L, q[1]);
      c.lineTo(q[0], q[1] + q[3] * L);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(q[0] + q[2] * L, q[1]);
      c.lineTo(q[0], q[1] + q[3] * L);
      c.stroke();
    });
    // Lumière de la lampe + vignettage
    var lampe = c.createRadialGradient(FW * 0.45, FH * 0.38, 20, FW * 0.45, FH * 0.38, FW * 0.62);
    lampe.addColorStop(0, 'rgba(255, 255, 235, 0.16)');
    lampe.addColorStop(0.55, 'rgba(255, 255, 235, 0.03)');
    lampe.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    c.fillStyle = lampe;
    c.fillRect(0, 0, FW, FH);
    // Ombre des murs sur le terrain
    ombreBord(c, 0, 0, FW, 0, 0, 1);
    ombreBord(c, 0, FH, FW, FH, 0, -1);
    ombreBord(c, 0, 0, 0, FH, 1, 0);
    ombreBord(c, FW, 0, FW, FH, -1, 0);
    c.restore();

    // Paliers chromés des barres
    barres.forEach(function (b) {
      [-MUR / 2, FH + MUR / 2].forEach(function (y) {
        c.beginPath(); c.arc(b.x, y, 13, 0, Math.PI * 2);
        var gp = c.createRadialGradient(b.x - 4, y - 4, 1, b.x, y, 13);
        gp.addColorStop(0, '#5d626b'); gp.addColorStop(0.6, '#2a2d33'); gp.addColorStop(1, '#111215');
        c.fillStyle = gp; c.fill();
        c.beginPath(); c.arc(b.x, y, 8, 0, Math.PI * 2);
        c.fillStyle = '#050506'; c.fill();
      });
    });

    // Trou d'engagement (côté, au milieu)
    c.beginPath(); c.arc(FW / 2, -MUR / 2, 22, 0, Math.PI * 2);
    var gs = c.createRadialGradient(FW / 2 + 5, -MUR / 2 + 5, 2, FW / 2, -MUR / 2, 22);
    gs.addColorStop(0, '#000'); gs.addColorStop(0.8, '#0d0e10'); gs.addColorStop(1, '#4a4f58');
    c.fillStyle = gs; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#cfd4db'; c.stroke();

    // Tiges des bouliers de score
    [-MUR / 2, FW + MUR / 2].forEach(function (x) {
      c.lineCap = 'round';
      c.lineWidth = 5; c.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      c.beginPath(); c.moveTo(x + 2, 22); c.lineTo(x + 2, CY - BUT - 18); c.stroke();
      c.lineWidth = 4; c.strokeStyle = '#d9dee5';
      c.beginPath(); c.moveTo(x, 20); c.lineTo(x, CY - BUT - 20); c.stroke();
    });

    // Vis des coins
    [[-MUR + 18, -MUR + 18], [FW + MUR - 18, -MUR + 18], [-MUR + 18, FH + MUR - 18], [FW + MUR - 18, FH + MUR - 18]].forEach(function (p) {
      c.beginPath(); c.arc(p[0], p[1], 6, 0, Math.PI * 2);
      c.fillStyle = '#c7ccd3'; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; c.stroke();
    });
  }

  function motifGrain(c) {
    var t = document.createElement('canvas');
    t.width = t.height = 96;
    var tc = t.getContext('2d');
    var img = tc.createImageData(96, 96), rnd = alea(13004);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = rnd() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(rnd() * 16);
    }
    tc.putImageData(img, 0, 0);
    return c.createPattern(t, 'repeat');
  }

  function ombreBord(c, xa, ya, xb, yb, nx, ny) {
    var L = 26;
    var g = c.createLinearGradient(xa, ya, xa + nx * L, ya + ny * L);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    var x = Math.min(xa, xb, xa + nx * L), y = Math.min(ya, yb, ya + ny * L);
    var w = Math.abs(xb - xa) || L, h = Math.abs(yb - ya) || L;
    c.fillRect(x, y, w, h);
  }

  // ---------- Éléments mobiles ----------
  function dessinerBoulier(x, eq, n) {
    var yA = 20, yB = CY - BUT - 20, rb = 8.5, co = COUL[eq];
    for (var i = 0; i < 10; i++) {
      var y = i < 10 - n ? yA + rb + i * 2 * rb : yB - rb - (9 - i) * 2 * rb;
      var g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, rb);
      g.addColorStop(0, co.clair); g.addColorStop(0.5, co.base); g.addColorStop(1, co.fonce);
      ctx.beginPath(); ctx.arc(x, y, rb - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }
  }

  function extremites(b) {
    // barres traversantes : elles coulissent et dépassent des deux côtés du caisson ;
    // poignée côté propriétaire (jaunes en bas, noirs en haut)
    var k = 0.22;
    if (b.eq === 'b') {
      return { haut: -MUR - 14 - (b.course - b.off) * k, bas: FH + MUR + 16 + (b.course + b.off) * k, poignee: 'bas' };
    }
    return { haut: -MUR - 16 - (b.course - b.off) * k, bas: FH + MUR + 14 + (b.course + b.off) * k, poignee: 'haut' };
  }

  function dessinerBarre(b, idx) {
    var e = extremites(b), x = b.x, ep = 12;
    var g = ctx.createLinearGradient(x - ep / 2, 0, x + ep / 2, 0);
    g.addColorStop(0, '#5a626c'); g.addColorStop(0.35, '#f6f8fa');
    g.addColorStop(0.55, '#aab3bd'); g.addColorStop(1, '#4b525b');
    ctx.fillStyle = g;
    ctx.fillRect(x - ep / 2, e.haut, ep, e.bas - e.haut);
    // butées caoutchouc
    var y1 = CY + b.hommes[0] - 20 + b.off, y2 = CY + b.hommes[b.hommes.length - 1] + 20 + b.off;
    [y1, y2].forEach(function (y) {
      ctx.fillStyle = '#1c1c1c';
      rr(ctx, x - 10, y - 4, 20, 8, 3); ctx.fill();
    });
    // poignée en bois verni (Tornado), forme tonneau, gorges de préhension
    var lp = 92, py = e.poignee === 'bas' ? e.bas : e.haut - lp;
    var gp = ctx.createLinearGradient(x - 17, 0, x + 17, 0);
    gp.addColorStop(0, '#7a4b1f'); gp.addColorStop(0.35, '#e2b77a'); gp.addColorStop(0.55, '#c99556'); gp.addColorStop(1, '#6e421a');
    ctx.beginPath();
    var bout = e.poignee === 'bas' ? py + lp : py, col = e.poignee === 'bas' ? py : py + lp;
    ctx.moveTo(x - 11, col);
    ctx.quadraticCurveTo(x - 18, (py + py + lp) / 2, x - 15, bout - (e.poignee === 'bas' ? 10 : -10));
    ctx.quadraticCurveTo(x, bout + (e.poignee === 'bas' ? 6 : -6), x + 15, bout - (e.poignee === 'bas' ? 10 : -10));
    ctx.quadraticCurveTo(x + 18, (py + py + lp) / 2, x + 11, col);
    ctx.closePath();
    ctx.fillStyle = gp; ctx.fill();
    ctx.strokeStyle = 'rgba(60, 30, 8, 0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(70, 38, 10, 0.55)'; ctx.lineWidth = 1.6;
    for (var r = 1; r < 5; r++) {
      var yr = (e.poignee === 'bas' ? py + 18 : py + lp - 18) + (e.poignee === 'bas' ? 1 : -1) * r * 11;
      ctx.beginPath(); ctx.moveTo(x - 15, yr); ctx.lineTo(x + 15, yr); ctx.stroke();
    }
    // virole métallique entre barre et poignée
    ctx.fillStyle = '#c9ced6';
    ctx.fillRect(x - 9, e.poignee === 'bas' ? py - 3 : py + lp - 3, 18, 6);
    if (etat.mode === 'jeu' && b.eq === 'b' && (b.saisie || bleues[selection] === b)) {
      rr(ctx, x - 20, py - 3, 40, lp + 6, 14);
      ctx.lineWidth = 4; ctx.strokeStyle = b.saisie ? '#8fd6f5' : 'rgba(143, 214, 245, 0.7)';
      ctx.stroke();
    }
  }

  function ombreBarre(b) {
    var e = extremites(b), d = 9;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(b.x - 5 + omb.x * d, e.haut + omb.y * d, 10, e.bas - e.haut);
  }

  function ombreJoueur(b, y) {
    var s = Math.sin(b.th), c = Math.abs(Math.cos(b.th));
    var d = 12 + 16 * c;
    var cx = b.x + PIED * s * 0.55 + omb.x * d * 0.8, cy = y + omb.y * d * 0.8;
    var rx = (16 + 26 * Math.abs(s)) * FIG, ry = 21 * FIG;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / 20, ry / 20);
    var g = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
    g.addColorStop(0, 'rgba(0,0,0,0.34)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Figurine Tornado T-3000 vue de dessus : plastique ABS moulé d'une pièce, arêtes vives et
  // section large, contrebalancée (tête lestée à l'opposé du pied), pied au bout plat strié.
  function plastique(c, co, x0, y0, x1, y1) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, co.clair); g.addColorStop(0.28, co.base); g.addColorStop(0.75, co.base); g.addColorStop(1, co.fonce);
    return g;
  }
  function dessinerJoueur(b, y) {
    var co = COUL[b.eq], s = Math.sin(b.th), x = b.x;
    var as = Math.abs(s), sg = s < 0 ? -1 : 1;
    var lo = omb.x * 4, la = omb.y * 4;
    // jambes et pied (visibles quand la figurine pivote)
    if (as > 0.04) {
      var xp = x + PIED * s;
      ctx.fillStyle = plastique(ctx, co, x, y - 10 * FIG, xp, y + 10 * FIG);
      // deux jambes jointes, légèrement évasées vers le pied
      ctx.beginPath();
      ctx.moveTo(x, y - 7 * FIG); ctx.lineTo(xp - sg * 5 * FIG, y - 8 * FIG);
      ctx.lineTo(xp - sg * 5 * FIG, y + 8 * FIG); ctx.lineTo(x, y + 7 * FIG);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = co.trait; ctx.lineWidth = 1; ctx.stroke();
      // pied : bloc à arêtes vives, bout plat avec stries d'accroche
      var lp = 12 * FIG, hp = 22 * FIG, xg = xp - lp / 2;
      ctx.fillStyle = plastique(ctx, co, xg, y - hp / 2, xg + lp, y + hp / 2);
      rr(ctx, xg, y - hp / 2, lp, hp, 2);
      ctx.fill();
      ctx.strokeStyle = co.trait; ctx.lineWidth = 1.2; ctx.stroke();
      // face de frappe biseautée
      ctx.fillStyle = co.biseau;
      var xb = sg > 0 ? xg + lp - 3 * FIG : xg;
      ctx.fillRect(xb, y - hp / 2 + 1, 3 * FIG, hp - 2);
      ctx.strokeStyle = co.trait; ctx.lineWidth = 0.9;
      for (var k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(xb, y + k * hp * 0.12);
        ctx.lineTo(xb + 3 * FIG, y + k * hp * 0.12);
        ctx.stroke();
      }
    }
    // tête lestée : bloc carré à coins vifs, décalé à l'opposé du pied quand la figurine pivote
    var xt = x - TETE * s, lt = (15 + 5 * as) * FIG, ht = 17 * FIG;
    ctx.fillStyle = plastique(ctx, co, xt - lt / 2 - lo, y - ht / 2 - la, xt + lt / 2, y + ht / 2);
    rr(ctx, xt - lt / 2, y - ht / 2, lt, ht, 3 * FIG);
    ctx.fill();
    ctx.strokeStyle = co.trait; ctx.lineWidth = 1.2; ctx.stroke();
    // plat du dessus de la tête (reflet)
    ctx.fillStyle = co.reflet;
    rr(ctx, xt - lt / 2 + 2.5 * FIG, y - ht / 2 + 2.5 * FIG, lt - 5 * FIG, ht * 0.32, 2 * FIG);
    ctx.fill();
    // épaules larges à arêtes vives, traversées par la barre
    var ex = (13 + 7 * as) * FIG, ey = 34 * FIG;
    ctx.fillStyle = plastique(ctx, co, x - ex / 2 - lo, y - ey / 2 - la, x + ex / 2, y + ey / 2);
    ctx.beginPath();
    ctx.moveTo(x - ex / 2 + 2, y - ey / 2);
    ctx.lineTo(x + ex / 2 - 2, y - ey / 2);
    ctx.lineTo(x + ex / 2, y - ey / 2 + 4);
    ctx.lineTo(x + ex / 2, y + ey / 2 - 4);
    ctx.lineTo(x + ex / 2 - 2, y + ey / 2);
    ctx.lineTo(x - ex / 2 + 2, y + ey / 2);
    ctx.lineTo(x - ex / 2, y + ey / 2 - 4);
    ctx.lineTo(x - ex / 2, y - ey / 2 + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = co.trait; ctx.lineWidth = 1.2; ctx.stroke();
    // arête centrale du moulage (vue de dessus)
    ctx.strokeStyle = co.reflet; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - ex * 0.15, y - ey / 2 + 3); ctx.lineTo(x - ex * 0.15, y + ey / 2 - 3); ctx.stroke();
  }

  function dessinerBalle() {
    var b = balle, v = Math.hypot(b.vx, b.vy);
    // ombre
    ctx.save();
    ctx.translate(b.x + omb.x * 6, b.y + omb.y * 6);
    var go = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 1.2);
    go.addColorStop(0, 'rgba(0,0,0,0.42)'); go.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = go;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // traînée si la balle va vite
    if (v > 800) {
      for (var k = 3; k >= 1; k--) {
        ctx.beginPath();
        ctx.arc(b.x - b.vx * 0.006 * k, b.y - b.vy * 0.006 * k, R * (1 - k * 0.08), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,250,' + (0.12 / k).toFixed(3) + ')';
        ctx.fill();
      }
    }
    var lx = -omb.x * 0.3 * R / 1.2, ly = -omb.y * 0.3 * R / 1.2;
    var g = ctx.createRadialGradient(b.x + lx, b.y + ly, 1, b.x, b.y, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#efe9d2'); g.addColorStop(1, '#a39b80');
    ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    // marques qui tournent : on voit la balle rouler
    if (v > 1) {
      var ux = b.vx / v, uy = b.vy / v;
      for (var m = 0; m < 2; m++) {
        var a = b.rot + m * Math.PI;
        if (Math.cos(a) < 0) continue;
        var px = b.x + ux * R * 0.62 * Math.sin(a) - uy * R * 0.28 * (m ? -1 : 1);
        var py = b.y + uy * R * 0.62 * Math.sin(a) + ux * R * 0.28 * (m ? -1 : 1);
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120, 110, 90, ' + (0.5 * Math.cos(a)).toFixed(3) + ')';
        ctx.fill();
      }
    }
  }

  function dessiner() {
    if (!cssW) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fond, 0, 0);
    appliquerVue(ctx);
    dessinerBoulier(-MUR / 2, 'b', score.b);
    dessinerBoulier(FW + MUR / 2, 'r', score.r);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FW, FH);
    ctx.rect(-MUR + 10, CY - BUT, MUR - 10, 2 * BUT);
    ctx.rect(FW, CY - BUT, MUR - 10, 2 * BUT);
    ctx.clip();
    barres.forEach(ombreBarre);
    if (balle.visible) dessinerBalle();
    barres.forEach(function (b) { b.hommes.forEach(function (h) { ombreJoueur(b, yHomme(b, h)); }); });
    ctx.restore();

    barres.forEach(dessinerBarre);
    barres.forEach(function (b) { b.hommes.forEach(function (h) { dessinerJoueur(b, yHomme(b, h)); }); });
    dessinerTrace();

    if (trace.actif) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var tc = Math.round(Math.min(cssW, cssH) * 0.06);
      ctx.font = '800 ' + tc + 'px "Big Shoulders Display", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var msg = trace.pts.length ? 'RELÂCHEZ POUR TIRER' : 'TRACEZ LA TRAJECTOIRE DEPUIS LA BALLE';
      var lw = ctx.measureText(msg).width + tc;
      ctx.fillStyle = 'rgba(11, 29, 58, 0.85)';
      rr(ctx, cssW / 2 - lw / 2, tc * 0.5, lw, tc * 1.5, 6); ctx.fill();
      ctx.fillStyle = '#ffd84d';
      ctx.fillText(msg, cssW / 2, tc * 0.75);
      appliquerVue(ctx);
    }

    if (flash.t > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = Math.min(1, flash.t / 0.35);
      var taille = Math.round(Math.min(cssW, cssH) * 0.2);
      ctx.font = '800 ' + taille + 'px "Big Shoulders Display", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(6, taille * 0.09);
      ctx.strokeStyle = '#0b1d3a';
      ctx.strokeText(flash.txt, cssW / 2, cssH / 2);
      ctx.fillStyle = flash.coul;
      ctx.fillText(flash.txt, cssW / 2, cssH / 2);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Physique ----------
  // Rythme volontairement posé : balle plus lente, frappes moins sèches.
  function rotationLibre(b, h, dir) {
    if (b.frappe > 0) {
      b.frappe -= h;
      b.th += dir * (b.eq === 'b' ? 19 : 17) * h;
      b.wLibre = dir * 5;
    } else {
      b.wLibre += (-60 * b.th - 15 * b.wLibre) * h;
      b.th += b.wLibre * h;
    }
    b.th = clamp(b.th, -1.9, 1.9);
  }

  function majBarre(b, h) {
    var off0 = b.off, th0 = b.th;
    if (b.eq === 'b') {
      b.off += (b.cible - b.off) * Math.min(1, h * 30);
      if (b.saisie) b.th += (b.cibleTh - b.th) * Math.min(1, h * 40);
      else if (trace.suivi && trace.suivi.receveur === b) { b.th += (0 - b.th) * Math.min(1, h * 18); b.wLibre = 0; } // les attaquants restent baissés pour recevoir
      else if (trace.suivi) { b.th += (-1.45 - b.th) * Math.min(1, h * 18); b.wLibre = 0; } // vos autres joueurs se relèvent
      else rotationLibre(b, h, 1);
    } else {
      // Rouges : ressort amorti vers la cible (aucun à-coup, aucune vibration)
      var raideur = b.possede ? 7 : 6;
      var acc = raideur * raideur * (b.iaCible - b.off) - 2 * raideur * b.v;
      b.v = clamp(b.v + acc * h, -b.vMax, b.vMax);
      b.off += b.v * h;
      rotationLibre(b, h, -1);
    }
    if (b.off < -b.course || b.off > b.course) { b.off = clamp(b.off, -b.course, b.course); b.v = 0; }
    b.vy = (b.off - off0) / h;
    b.w = (b.th - th0) / h;
    if (b.ignore > 0) b.ignore -= h;
  }

  function collisionPieds(b) {
    if (b.ignore > 0) return;
    var cth = Math.cos(b.th);
    if (cth < 0.4) return; // joueur relevé : la balle passe dessous
    var fx = b.x + PIED * Math.sin(b.th);
    var vfx = clamp(PIED * cth * b.w, -900, 900), vfy = clamp(b.vy, -500, 500);
    // barre tenue immobile : le joueur amortit et contrôle la balle
    var amorti = b.saisie && Math.abs(b.w) < 3 && Math.abs(b.vy) < 150;
    var e = amorti ? 0.08 : E_PIED;
    for (var i = 0; i < b.hommes.length; i++) {
      var fy = yHomme(b, b.hommes[i]);
      if (Math.abs(balle.x - fx) > PHX + R + 2 || Math.abs(balle.y - fy) > PHY + R + 2) continue;
      var px = clamp(balle.x, fx - PHX, fx + PHX), py = clamp(balle.y, fy - PHY, fy + PHY);
      var dx = balle.x - px, dy = balle.y - py, d = Math.hypot(dx, dy), nx, ny, pen;
      if (d > R) continue;
      if (d < 1e-6) {
        var ox = PHX + R - Math.abs(balle.x - fx), oy = PHY + R - Math.abs(balle.y - fy);
        if (ox < oy) { nx = balle.x >= fx ? 1 : -1; ny = 0; pen = ox; }
        else { nx = 0; ny = balle.y >= fy ? 1 : -1; pen = oy; }
      } else {
        nx = dx / d; ny = dy / d; pen = R - d;
      }
      // un rouge amortit une balle pas trop rapide et la garde (contrôle)
      if (b.eq === 'r' && !poss && b.recharge <= 0 && etat.pause <= 0 && !b.essai) {
        b.essai = true;
        if (Math.hypot(balle.vx, balle.vy) < 720 && (b.verrou > 0 || Math.random() < 0.75)) { prendre(b, i); return; }
      }
      balle.x += nx * pen;
      balle.y += ny * pen;
      var rvx = balle.vx - vfx, rvy = balle.vy - vfy, vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        balle.vx -= (1 + e) * vn * nx;
        balle.vy -= (1 + e) * vn * ny;
        var tx = -ny, ty = nx, vt = (vfx - balle.vx) * tx + (vfy - balle.vy) * ty;
        var adh = amorti ? 0.5 : 0.18;
        balle.vx += vt * tx * adh;
        balle.vy += vt * ty * adh;
      }
    }
  }

  function pasBalle(h) {
    var b = balle;
    var v = Math.hypot(b.vx, b.vy);
    if (v > 0) {
      var nv = Math.max(0, v * Math.exp(-0.55 * h) - 55 * h);
      if (nv > VMAX) nv = VMAX;
      b.vx *= nv / v; b.vy *= nv / v;
    }
    var dansBouche = Math.abs(b.y - CY) < BUT - 4;
    if (b.y < 34) b.vy += 200 * h;
    if (b.y > FH - 34) b.vy -= 200 * h;
    if (!dansBouche && b.x < 28) b.vx += 200 * h;
    if (!dansBouche && b.x > FW - 28) b.vx -= 200 * h;

    b.x += b.vx * h;
    b.y += b.vy * h;
    b.rot += Math.hypot(b.vx, b.vy) * h / R;

    if (b.x < R && !dansBouche) { b.x = R; b.vx = Math.abs(b.vx) * E_MUR; }
    if (b.x > FW - R && !dansBouche) { b.x = FW - R; b.vx = -Math.abs(b.vx) * E_MUR; }
    if (b.x < 0 || b.x > FW) {
      if (b.y < CY - BUT + R) { b.y = CY - BUT + R; b.vy = Math.abs(b.vy) * E_MUR; }
      if (b.y > CY + BUT - R) { b.y = CY + BUT - R; b.vy = -Math.abs(b.vy) * E_MUR; }
      if (b.x < -R - 6) return but('r');
      if (b.x > FW + R + 6) return but('b');
    } else {
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * E_MUR; }
      if (b.y > FH - R) { b.y = FH - R; b.vy = -Math.abs(b.vy) * E_MUR; }
    }
    [[0, CY - BUT], [0, CY + BUT], [FW, CY - BUT], [FW, CY + BUT]].forEach(function (p) {
      var dx = b.x - p[0], dy = b.y - p[1], d = Math.hypot(dx, dy);
      if (d < R + 3 && d > 0) {
        var nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
        b.x = p[0] + nx * (R + 3); b.y = p[1] + ny * (R + 3);
        if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; }
      }
    });
    for (var i = 0; i < barres.length; i++) collisionPieds(barres[i]);
  }

  function reflet(y) {
    var a = R, b = FH - R, L = b - a;
    var t = ((y - a) % (2 * L) + 2 * L) % (2 * L);
    return a + (t > L ? 2 * L - t : t);
  }

  // ---------- Jeu des rouges : construction comme en compétition ----------
  // Contrôle de la balle, passes gardien → défense → milieu → attaque,
  // balle posée sur le joueur central de l'attaque, puis tir dans l'ouverture.
  var ORDRE_ROUGE = [7, 6, 4, 2]; // indices : gardien, défense, milieu, attaque
  var TENUE = 30;                 // la balle est tenue juste devant le pied
  var poss = null;

  function hasard(a, b) { return a + Math.random() * (b - a); }
  function suivante(b) {
    var i = ORDRE_ROUGE.indexOf(barres.indexOf(b));
    return i >= 0 && i < ORDRE_ROUGE.length - 1 ? barres[ORDRE_ROUGE[i + 1]] : null;
  }
  function hommesY(b) { return b.hommes.map(function (h) { return yHomme(b, h); }); }

  // Aligne un homme de la barre sur une hauteur donnée (le plus proche possible)
  function viser(b, y) {
    var meilleur = b.iaCible, ecart = Infinity;
    b.hommes.forEach(function (h) {
      var o = clamp(y - CY - h, -b.course, b.course), e = Math.abs(CY + h + o - y);
      if (e < ecart - 0.5) { ecart = e; meilleur = o; }
    });
    return meilleur;
  }

  // Couloir de passe : la hauteur la plus éloignée des joueurs bleus qui barrent la route
  function couloir(depuis, vers, yActuel) {
    var obstacles = [];
    barres.forEach(function (b) {
      if (b.eq === 'b' && b.x < depuis.x && b.x > vers.x) obstacles = obstacles.concat(hommesY(b));
    });
    var meilleurY = yActuel, meilleur = -1;
    var pos = depuis.poss;
    if (!obstacles.length) {
      var h0 = depuis.hommes[pos.homme];
      return clamp(yActuel + hasard(-50, 50), CY + h0 - depuis.course, CY + h0 + depuis.course);
    }
    for (var y = 40; y <= FH - 40; y += 10) {
      // hauteur atteignable par l'homme qui tient la balle
      var h = depuis.hommes[pos.homme];
      if (y - CY - h < -depuis.course || y - CY - h > depuis.course) continue;
      var marge = obstacles.length ? Math.min.apply(null, obstacles.map(function (o) { return Math.abs(o - y); })) : 200;
      // on préfère aussi ne pas trop se déplacer
      var score = Math.min(marge, 120) - Math.abs(y - yActuel) * 0.08;
      if (score > meilleur) { meilleur = score; meilleurY = y; }
    }
    return meilleurY;
  }

  // Tir : la hauteur du but la moins couverte par le gardien et la défense bleus
  function ouverture(depuisY) {
    var def = hommesY(barres[0]).concat(hommesY(barres[1]));
    var meilleurY = CY, meilleur = -1;
    for (var cy = CY - BUT + R + 6; cy <= CY + BUT - R - 6; cy += 8) {
      var marge = Infinity;
      [barres[0], barres[1]].forEach(function (b) {
        var t = (b.x - 0) / (barres[2].x - TENUE); // fraction du trajet
        var yPassage = cy + (depuisY - cy) * t;
        hommesY(b).forEach(function (yh) { marge = Math.min(marge, Math.abs(yh - yPassage)); });
      });
      if (marge > meilleur) { meilleur = marge; meilleurY = cy; }
    }
    return meilleurY;
  }

  function prendre(b, i) {
    poss = { barre: b, homme: i, phase: 'controle', t: 0, duree: hasard(0.35, 0.6), depart: { x: balle.x, y: balle.y }, total: 0 };
    b.poss = poss;
    b.possede = true;
    b.iaCible = b.off;
    balle.vx = balle.vy = 0;
  }

  function lacher(vx, vy) {
    var b = poss.barre;
    balle.vx = vx; balle.vy = vy;
    b.frappe = 0.08;
    b.ignore = 0.2;
    b.recharge = 0.7;
    b.possede = false;
    b.poss = null;
    poss = null;
  }

  function jouerPossession(dt) {
    var p = poss, b = p.barre;
    p.t += dt; p.total += dt;
    var yTenue = yHomme(b, b.hommes[p.homme]);

    // la balle reste collée devant le pied (mouvement latéral compris)
    if (p.phase === 'controle') {
      var k = Math.min(1, p.t / 0.14);
      balle.x = p.depart.x + (b.x - TENUE - p.depart.x) * k;
      balle.y = p.depart.y + (yTenue - p.depart.y) * k;
    } else if (p.phase !== 'laterale') {
      balle.x = b.x - TENUE;
      balle.y = yTenue;
    }
    balle.vx = 0; balle.vy = b.vy;

    var cible = suivante(b);
    if (p.phase === 'controle' && p.t >= p.duree) {
      p.t = 0;
      if (!cible) {
        // attaque : on amène la balle sur le joueur central
        if (p.homme !== 1) {
          p.phase = 'laterale';
          p.yDepart = balle.y;
          p.yArrivee = clamp(balle.y, CY - b.course + 10, CY + b.course - 10);
          p.offArrivee = p.yArrivee - CY; // homme central (décalage 0)
          p.duree = 0.45;
        } else {
          p.phase = 'pose';
          p.duree = hasard(0.55, 1.0);
        }
      } else {
        p.phase = 'placement';
        p.lane = couloir(b, cible, balle.y);
        b.iaCible = clamp(p.lane - CY - b.hommes[p.homme], -b.course, b.course);
        cible.iaCible = viser(cible, p.lane);
        cible.verrou = 1.4;
      }
    } else if (p.phase === 'laterale') {
      var k2 = Math.min(1, p.t / p.duree);
      var lisse = k2 * k2 * (3 - 2 * k2);
      balle.x = b.x - TENUE;
      balle.y = p.yDepart + (p.yArrivee - p.yDepart) * lisse;
      b.iaCible = p.offArrivee;
      if (k2 >= 1 && Math.abs(b.off - p.offArrivee) < 4) {
        p.homme = 1; p.phase = 'pose'; p.t = 0; p.duree = hasard(0.55, 1.0);
      }
    } else if (p.phase === 'placement') {
      if (Math.abs(b.off - b.iaCible) < 3 || p.t > 1.4) {
        // passe : droite vers le couloir, avec une légère correction
        var dxp = cible.x - (b.x - TENUE);
        var vitesse = hasard(620, 760);
        var vyp = (p.lane - balle.y) * vitesse / Math.abs(dxp);
        lacher(-vitesse, vyp);
        return;
      }
    } else if (p.phase === 'pose') {
      // petite feinte latérale, comme un joueur qui prépare son tir
      if (p.base === undefined) p.base = b.off;
      b.iaCible = clamp(p.base + Math.sin(p.t * 7) * 6, -b.course, b.course);
      if (p.t >= p.duree) {
        p.phase = 'tir';
        p.t = 0;
        p.cibleBut = ouverture(balle.y);
        // tir « tiré » : on emmène la balle sur le côté avant de frapper
        var yTir = clamp(p.cibleBut + (balle.y - p.cibleBut) * 0.35, CY - b.course + 10, CY + b.course - 10);
        b.iaCible = yTir - CY;
      }
    } else if (p.phase === 'tir') {
      if (Math.abs(b.off - b.iaCible) < 4 || p.t > 0.5) {
        var dxt = balle.x - 0, vt = hasard(1150, 1350);
        lacher(-vt, (p.cibleBut - balle.y) * vt / dxt);
        return;
      }
    }
    // règle des 10 secondes : on joue quoi qu'il arrive
    if (p.total > 6 && poss) {
      lacher(-hasard(700, 900), hasard(-120, 120));
    }
  }

  function ia(dt) {
    if (poss) jouerPossession(dt);
    barres.forEach(function (b) {
      if (b.eq !== 'r') return;
      b.recharge -= dt;
      if (b.verrou > 0) b.verrou -= dt;
      b.errT -= dt;
      if (b.errT <= 0) { b.errT = hasard(1.2, 2.2); b.err = hasard(-14, 14); }
      if (b.possede) return;

      // placement défensif : suivre la trajectoire prévue, sans réagir au moindre écart
      b.iaT -= dt;
      if (b.iaT <= 0 && !(b.verrou > 0)) {
        b.iaT = hasard(0.14, 0.24);
        var py = CY;
        if (balle.visible) {
          py = balle.y;
          var t = (b.x - balle.x) / (balle.vx || 1e-6);
          if (t > 0 && t < 0.8) py = reflet(balle.y + balle.vy * t);
        }
        var c = viser(b, py + b.err);
        if (Math.abs(c - b.iaCible) > 10) b.iaCible = c;
      }

      // balle lente ou arrêtée devant un homme : il la récupère
      var pres = false;
      for (var i = 0; i < b.hommes.length; i++) {
        var dx = balle.x - b.x, dy = balle.y - yHomme(b, b.hommes[i]);
        if (dx > -(PIED + R + 30) && dx < 50 && Math.abs(dy) < PHY + R + 10) pres = true;
        if (!poss && balle.visible && etat.pause <= 0 && b.recharge <= 0 &&
            dx > -(PIED + R + 12) && dx < PHX + R + 4 && Math.abs(dy) < PHY + R - 2 &&
            Math.hypot(balle.vx, balle.vy) < 260) { prendre(b, i); return; }
      }
      if (!pres) b.essai = false;
    });
  }

  // ---------- Tir tracé ----------
  function joueurJauneTient() {
    if (poss || !balle.visible || trace.suivi) return false;
    if (Math.hypot(balle.vx, balle.vy) > 40) return false; // balle (quasi) immobile
    for (var i = 0; i < bleues.length; i++) {
      var b = bleues[i];
      for (var j = 0; j < b.hommes.length; j++) {
        var dx = balle.x - b.x, dy = balle.y - yHomme(b, b.hommes[j]);
        if (Math.abs(dx) < PIED + R + 12 && Math.abs(dy) < PHY + R + 6) return true;
      }
    }
    return false;
  }
  // Dès que la balle s'arrête à portée d'un joueur jaune, le jeu se fige et passe en mode tracé
  function majProposition(dt) {
    var tient = etat.pause <= 0 && !etat.fige && joueurJauneTient();
    if (!tient) { trace.tenue = 0; trace.refus = false; return; }
    trace.tenue += dt;
    if (trace.tenue > 0.12 && !trace.actif && !trace.refus) commencerTrace();
  }
  function commencerTrace() {
    trace.actif = true;
    trace.dispo = true;
    trace.pts = [];
    racine.classList.add('bf--trace');
    balle.vx = balle.vy = 0;
    // une saisie de barre en cours est relâchée : le prochain geste dessine la trajectoire
    Object.keys(pointeurs).forEach(function (id) { pointeurs[id].barre.saisie = 0; delete pointeurs[id]; });
    racine.classList.remove('bf--saisie');
    annoncer('Vous avez la balle : tracez la trajectoire du tir depuis la balle, puis relâchez. Échap pour jouer avec les barres.');
    dessiner();
  }
  function annulerTrace(refus) {
    trace.actif = false;
    trace.dessin = null;
    trace.pts = [];
    racine.classList.remove('bf--trace');
    trace.tenue = 0; trace.dispo = false;
    trace.refus = Boolean(refus); // Échap : pas de nouveau tracé tant que la balle reste là
  }
  function pointTrace(p) {
    var dansBouche = Math.abs(p.y - CY) < BUT - R;
    return {
      x: dansBouche ? clamp(p.x, -R - 14, FW + R + 14) : clamp(p.x, R, FW - R),
      y: clamp(p.y, R, FH - R)
    };
  }
  function longueurTrace(pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  }
  function lancerTrace() {
    var pts = trace.pts;
    racine.classList.remove('bf--trace');
    trace.actif = false;
    trace.dessin = null;
    if (pts.length < 3 || longueurTrace(pts) < 60) {
      // geste trop court : on reste en mode tracé
      trace.actif = true; trace.pts = []; racine.classList.add('bf--trace'); return;
    }
    // passe tracée depuis les demis : les attaquants jaunes la contrôlent automatiquement
    var depart = bleues.slice().sort(function (a, b) { return Math.abs(a.x - pts[0].x) - Math.abs(b.x - pts[0].x); })[0];
    var receveur = depart === barres[3] ? barres[5] : null;
    trace.suivi = { pts: pts, i: 0, receveur: receveur };
    trace.fondu = 1;
    trace.dispo = false;
    etat.immobile = 0;
  }
  // Barre jaune qui reçoit : elle se cale sur la hauteur où la balle va la croiser
  function placerReceveur(b, sv) {
    var pts = sv.pts, yCible = balle.y;
    for (var i = Math.max(sv.i, 0); i < pts.length - 1; i++) {
      var a = pts[i], c = pts[i + 1];
      if ((a.x - b.x) * (c.x - b.x) <= 0 && a.x !== c.x) { yCible = a.y + (c.y - a.y) * (b.x - a.x) / (c.x - a.x); break; }
    }
    var meilleur = b.cible, ecart = Infinity;
    b.hommes.forEach(function (hm) {
      var o = clamp(yCible - CY - hm, -b.course, b.course), e = Math.abs(CY + hm + o - yCible);
      if (e < ecart - 0.5) { ecart = e; meilleur = o; }
    });
    b.cible = meilleur;
  }
  // contrôle automatique : la balle arrive sur un attaquant, il l'amortit et la garde
  function receptionAuto(b) {
    var xFace = b.x - (PHX + R + 2);
    if (balle.x < xFace - 4 || balle.x > b.x + PHX + R) return false;
    for (var j = 0; j < b.hommes.length; j++) {
      var fy = yHomme(b, b.hommes[j]);
      if (Math.abs(balle.y - fy) < PHY + R) {
        trace.suivi = null;
        balle.x = xFace;
        balle.y = fy;
        balle.vx = balle.vy = 0;
        trace.tenue = 0; trace.refus = false;
        annoncer('Vos attaquants contrôlent la balle : tracez votre tir.');
        return true;
      }
    }
    return false;
  }
  // la balle suit le tracé ; un pied noir sur le chemin l'intercepte
  function suivreTrace(h) {
    var sv = trace.suivi, pts = sv.pts, reste = V_TRACE * h;
    if (sv.receveur) placerReceveur(sv.receveur, sv);
    var dx = 0, dy = 0;
    while (reste > 0 && sv.i < pts.length - 1) {
      var a = pts[sv.i + 1];
      dx = a.x - balle.x; dy = a.y - balle.y;
      var d = Math.hypot(dx, dy);
      if (d <= reste) { balle.x = a.x; balle.y = a.y; reste -= d; sv.i++; }
      else { balle.x += dx / d * reste; balle.y += dy / d * reste; reste = 0; }
    }
    var n = Math.hypot(dx, dy) || 1;
    balle.vx = dx / n * V_TRACE; balle.vy = dy / n * V_TRACE;
    balle.rot += V_TRACE * h / R;
    if (sv.receveur && balle.vx > 0 && receptionAuto(sv.receveur)) return;
    if (Math.abs(balle.y - CY) < BUT) {
      if (balle.x > FW + R + 6) { trace.suivi = null; return but('b'); }
      if (balle.x < -R - 6) { trace.suivi = null; return but('r'); }
    }
    for (var k = 0; k < barres.length; k++) {
      var b = barres[k];
      if (b.eq !== 'r' || Math.cos(b.th) < 0.4) continue;
      var fx = b.x + PIED * Math.sin(b.th);
      for (var j = 0; j < b.hommes.length; j++) {
        var fy = yHomme(b, b.hommes[j]);
        if (Math.abs(balle.x - fx) < PHX + R && Math.abs(balle.y - fy) < PHY + R) {
          trace.suivi = null;
          balle.x -= balle.vx / V_TRACE * 6;
          balle.vx = -balle.vx * 0.35; balle.vy = balle.vy * 0.35 + (balle.y - fy) * 4;
          annoncer('Tir intercepté par les noirs.');
          return;
        }
      }
    }
    if (sv.i >= pts.length - 1) {
      // fin du tracé : la balle continue sur sa lancée
      trace.suivi = null;
      balle.vx *= 0.75; balle.vy *= 0.75;
    }
  }
  function dessinerTrace() {
    var pts = trace.actif ? trace.pts : trace.suivi ? trace.suivi.pts.slice(trace.suivi.i) : null;
    if (trace.actif || trace.suivi) {
      // anneau autour de la balle
      ctx.beginPath(); ctx.arc(balle.x, balle.y, R + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 216, 77, 0.95)'; ctx.lineWidth = 3; ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (!pts || pts.length < 2) return;
    var tracer = function (largeur, couleur, tirets) {
      ctx.beginPath();
      ctx.moveTo(trace.suivi ? balle.x : pts[0].x, trace.suivi ? balle.y : pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineWidth = largeur; ctx.strokeStyle = couleur; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash(tirets || []); ctx.stroke(); ctx.setLineDash([]);
    };
    tracer(10, 'rgba(11, 29, 58, 0.35)');
    tracer(4, 'rgba(255, 216, 77, 0.95)', [16, 10]);
    // flèche au bout
    var a = pts[pts.length - 1], b0 = pts[Math.max(0, pts.length - 4)];
    var ang = Math.atan2(a.y - b0.y, a.x - b0.x);
    ctx.beginPath();
    ctx.moveTo(a.x + Math.cos(ang) * 16, a.y + Math.sin(ang) * 16);
    ctx.lineTo(a.x + Math.cos(ang + 2.5) * 16, a.y + Math.sin(ang + 2.5) * 16);
    ctx.lineTo(a.x + Math.cos(ang - 2.5) * 16, a.y + Math.sin(ang - 2.5) * 16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 216, 77, 0.95)'; ctx.fill();
  }

  function maj(dt) {
    ia(dt);
    if (flash.t > 0) flash.t -= dt;
    if (etat.pause > 0) {
      etat.pause -= dt;
      for (var j = 0; j < 4; j++) barres.forEach(function (b) { majBarre(b, dt / 4); });
      if (etat.pause <= 0) engager();
      return;
    }
    var v = Math.max(Math.hypot(balle.vx, balle.vy), 1200);
    var n = clamp(Math.ceil(v * dt / 8), 4, 16), h = dt / n;
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < barres.length; k++) majBarre(barres[k], h);
      if (poss) {
        // balle tenue par un rouge : elle suit l'homme (pas de physique libre)
        var p = poss, b = p.barre;
        if (p.phase !== 'controle' && p.phase !== 'laterale') { balle.x = b.x - TENUE; balle.y = yHomme(b, b.hommes[p.homme]); }
        continue;
      }
      if (trace.suivi) { suivreTrace(h); if (!balle.visible) break; continue; }
      pasBalle(h);
      if (!balle.visible) break;
    }
    majProposition(dt);
    if (balle.visible && !poss && !trace.dispo) {
      if (Math.hypot(balle.vx, balle.vy) < 14) etat.immobile += dt; else etat.immobile = 0;
      if (etat.immobile > 3) {
        annoncer('Balle bloquée : remise en jeu.');
        engager();
      }
    } else etat.immobile = 0;
  }

  function but(eq) {
    if (poss) { poss.barre.possede = false; poss.barre.poss = null; poss = null; }
    trace.suivi = null; annulerTrace();
    score[eq]++;
    balle.visible = false;
    balle.vx = balle.vy = 0;
    majScore();
    var fin = score[eq] >= 10;
    if (fin && eq === 'r') return defaite();
    flash.t = fin ? 3 : 1.3;
    flash.coul = eq === 'b' ? '#ffd84d' : '#c9ced6';
    flash.txt = fin ? (eq === 'b' ? 'VICTOIRE !' : 'PERDU !') : 'BUT !';
    etat.pause = fin ? 3.2 : 1.3;
    etat.fin = fin;
    var s = score.b + ' à ' + score.r;
    annoncer(fin
      ? (eq === 'b' ? 'Victoire, ' : 'Les noirs gagnent, ') + s + '. Nouvelle partie.'
      : (eq === 'b' ? 'But pour vous ! ' : 'But des noirs. ') + s + '.');
  }

  // 10 buts encaissés : la partie s'arrête sur une invitation à venir au club
  function defaite() {
    etat.fige = true;
    etat.pause = 0;
    etat.fin = true;
    if (titreFin) titreFin.textContent = score.b + ' – ' + score.r;
    if (panneauFin) panneauFin.hidden = false;
    annoncer('Les noirs gagnent ' + score.r + ' à ' + score.b + '. Marre de te faire battre par quelqu’un qui joue plus carré que toi ? Viens t’entraîner au club !');
    var lien = panneauFin && panneauFin.querySelector('a');
    if (lien) { try { lien.focus({ preventScroll: true }); } catch (e) { lien.focus(); } }
    dessiner();
  }
  function rejouer() {
    if (panneauFin) panneauFin.hidden = true;
    etat.fige = false;
    engager();
    try { scene.focus({ preventScroll: true }); } catch (e) { scene.focus(); }
    annoncer('Nouvelle partie. Vous jouez les jaunes.');
  }

  function engager() {
    if (etat.fin) { score.b = score.r = 0; majScore(); etat.fin = false; }
    trace.suivi = null; annulerTrace();
    if (poss) { poss.barre.possede = false; poss.barre.poss = null; poss = null; }
    balle.x = FW / 2 + (Math.random() - 0.5) * 40;
    balle.y = R + 4;
    balle.vx = (Math.random() - 0.5) * 160;
    balle.vy = 230 + Math.random() * 110;
    balle.visible = true;
    etat.pause = 0;
    etat.immobile = 0;
  }

  function majScore() {
    if (elScoreB) elScoreB.textContent = String(score.b);
    if (elScoreR) elScoreR.textContent = String(score.r);
  }
  function annoncer(txt) {
    if (!elAnnonce) return;
    elAnnonce.textContent = '';
    setTimeout(function () { elAnnonce.textContent = txt; }, 30);
  }
  function majConsigne() {
    if (!elConsigne) return;
    elConsigne.textContent = portrait
      ? 'Glissez une barre jaune vers la gauche ou la droite pour la déplacer, vers le bas pour tirer. Touchez brièvement pour frapper. Quand la balle s’arrête devant un de vos joueurs, tracez sa trajectoire au doigt. Vous défendez le but du bas.'
      : 'Glissez une barre jaune vers le haut ou le bas pour la déplacer, vers la gauche pour tirer. Un clic bref frappe la balle. Quand la balle s’arrête devant un de vos joueurs, tracez sa trajectoire. Clavier : flèches pour choisir et déplacer une barre, Espace pour tirer, Échap pour quitter le tracé.';
  }

  // ---------- Boucle ----------
  function boucle() {
    raf = 0;
    if (etat.mode !== 'jeu' || !visible) return;
    var now = performance.now();
    var dt = Math.min(0.033, Math.max(0.001, (now - dernier) / 1000));
    dernier = now;
    if (!trace.actif && !etat.fige) maj(dt); // le jeu est figé pendant que vous tracez
    dessiner();
    raf = requestAnimationFrame(boucle);
  }
  function lancerBoucle() {
    if (raf || etat.mode !== 'jeu' || !visible) return;
    dernier = performance.now();
    raf = requestAnimationFrame(boucle);
  }

  function demarrer() {
    etat.mode = 'jeu';
    racine.classList.add('bf--jeu');
    scene.tabIndex = 0;
    try { scene.focus({ preventScroll: true }); } catch (e) { scene.focus(); }
    if (portrait && scene.scrollIntoView) scene.scrollIntoView({ block: 'center', behavior: 'smooth' });
    engager();
    annoncer('Partie lancée. Vous jouez les jaunes.');
    lancerBoucle();
  }
  function arreter() {
    etat.mode = 'repos';
    racine.classList.remove('bf--jeu');
    scene.tabIndex = -1;
    Object.keys(pointeurs).forEach(function (id) { delete pointeurs[id]; });
    barres.forEach(function (b) { b.saisie = 0; });
    trace.suivi = null; annulerTrace();
    if (panneauFin) panneauFin.hidden = true;
    if (etat.fige) { etat.fige = false; score.b = score.r = 0; majScore(); etat.fin = false; }
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    dessiner();
    if (boutonJouer) boutonJouer.focus();
  }

  // ---------- Commandes ----------
  function barrePlusProche(x) {
    var tri = bleues.slice().sort(function (a, b) { return Math.abs(a.x - x) - Math.abs(b.x - x); });
    for (var i = 0; i < tri.length; i++) if (!tri[i].saisie) return tri[i];
    return tri[0];
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (etat.mode !== 'jeu') return;
    e.preventDefault();
    var p = versMonde(e.clientX, e.clientY);
    if (trace.actif) {
      // le tracé part toujours de la balle
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
      trace.dessin = e.pointerId;
      trace.pts = [{ x: balle.x, y: balle.y }];
      var q = pointTrace(p);
      if (Math.hypot(q.x - balle.x, q.y - balle.y) > 8) trace.pts.push(q);
      return;
    }
    var b = barrePlusProche(p.x);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    b.saisie++;
    b.cibleTh = b.th;
    pointeurs[e.pointerId] = { barre: b, y0: p.y, off0: b.cible, dernierX: p.x, px: p.x, py: p.y, dist: 0, t0: performance.now() };
    selection = bleues.indexOf(b);
    racine.classList.add('bf--saisie');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (trace.actif && trace.dessin === e.pointerId) {
      e.preventDefault();
      var q = pointTrace(versMonde(e.clientX, e.clientY)), der = trace.pts[trace.pts.length - 1];
      var d = Math.hypot(q.x - der.x, q.y - der.y);
      if (d > 10 && longueurTrace(trace.pts) + d < L_TRACE) { trace.pts.push(q); dessiner(); }
      return;
    }
    var g = pointeurs[e.pointerId];
    if (!g) return;
    e.preventDefault();
    var p = versMonde(e.clientX, e.clientY), b = g.barre;
    b.cible = clamp(g.off0 + (p.y - g.y0), -b.course, b.course);
    // tir en sens inversé (demande du club) : on tire la barre vers l'arrière pour frapper
    b.cibleTh = clamp(b.cibleTh - (p.x - g.dernierX) * GAIN_ROT, -1.9, 1.9);
    g.dernierX = p.x;
    g.dist += Math.hypot(p.x - g.px, p.y - g.py);
    g.px = p.x; g.py = p.y;
  });
  function relacher(e) {
    if (trace.actif && trace.dessin === e.pointerId) { lancerTrace(); return; }
    var g = pointeurs[e.pointerId];
    if (!g) return;
    var b = g.barre;
    b.saisie = Math.max(0, b.saisie - 1);
    if (g.dist < 10 && performance.now() - g.t0 < 350) b.frappe = 0.09;
    else if (!b.saisie) b.wLibre = clamp(b.w, -30, 30);
    delete pointeurs[e.pointerId];
    if (!Object.keys(pointeurs).length) racine.classList.remove('bf--saisie');
  }
  canvas.addEventListener('pointerup', relacher);
  canvas.addEventListener('pointercancel', relacher);
  canvas.addEventListener('contextmenu', function (e) { if (etat.mode === 'jeu') e.preventDefault(); });

  scene.addEventListener('keydown', function (e) {
    if (etat.mode !== 'jeu') return;
    var b = bleues[selection], k = e.key, ok = true;
    var bougerMoins = portrait ? 'ArrowLeft' : 'ArrowUp', bougerPlus = portrait ? 'ArrowRight' : 'ArrowDown';
    var choixPlus = portrait ? 'ArrowUp' : 'ArrowRight', choixMoins = portrait ? 'ArrowDown' : 'ArrowLeft';
    if (k === bougerMoins) b.cible = clamp(b.cible - 26, -b.course, b.course);
    else if (k === bougerPlus) b.cible = clamp(b.cible + 26, -b.course, b.course);
    else if (k === choixPlus) selection = Math.min(bleues.length - 1, selection + 1);
    else if (k === choixMoins) selection = Math.max(0, selection - 1);
    else if (k === ' ' || k === 'Enter') b.frappe = 0.09;
    else if (k === 'Escape') { if (trace.actif) annulerTrace(true); else arreter(); }
    else ok = false;
    if (ok) e.preventDefault();
  });

  if (boutonJouer) boutonJouer.addEventListener('click', demarrer);
  if (boutonRejouer) boutonRejouer.addEventListener('click', rejouer);
  if (boutonQuitter) boutonQuitter.addEventListener('click', arreter);

  // Pause hors écran ou onglet masqué
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entrees) {
      visible = entrees[0].isIntersecting;
      if (visible) lancerBoucle();
    }, { threshold: 0.15 }).observe(scene);
  }
  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (visible) lancerBoucle();
  });

  if ('ResizeObserver' in window) {
    var dernierL = 0;
    new ResizeObserver(function () {
      if (scene.clientWidth !== dernierL) { dernierL = scene.clientWidth; redimensionner(); }
    }).observe(scene);
  } else {
    window.addEventListener('resize', redimensionner);
  }
  redimensionner();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { dessinerFond(); dessiner(); });

  // Accès pour les tests automatisés
  racine.__babyfoot = { trace: trace, etat: etat, balle: balle, score: score, barres: barres, versMonde: versMonde, possession: function () { return poss ? { barre: barres.indexOf(poss.barre), homme: poss.homme, phase: poss.phase } : null; }, libererBalle: function () { if (poss) { poss.barre.possede = false; poss.barre.poss = null; poss = null; } barres.forEach(function (x) { if (x.eq === 'r') x.recharge = 3; }); } };
})();
