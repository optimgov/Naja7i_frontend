#!/usr/bin/env node
/**
 * valider-palette.mjs — mesure si deux couleurs de statut restent
 * distinguables, y compris pour un daltonien.
 *
 *   node valider-palette.mjs "#0b6b57,#c25a2e,#d99a16" [--fond "#faf8f3"]
 *
 * Pourquoi ce script existe : « le vert et l'orange se distinguent bien »
 * est une intuition de personne à vision normale. Environ 8 % des hommes
 * ne la partagent pas. La question ne se raisonne pas, elle se calcule —
 * et le résultat change une décision d'interface : si deux couleurs
 * porteuses de sens tombent sous le seuil, l'état ne peut PAS être donné
 * par la couleur seule ; il faut une icône et un libellé écrit.
 *
 * Méthode : simulation Viénot-Brettel-Mollon (1999) des trois dichromaties,
 * puis distance perceptuelle en OKLab (× 100). Seuils :
 *   ΔE ≥ 12  confortable
 *   ΔE 8-12  acceptable
 *   ΔE 6-8   plancher — légal SEULEMENT avec un second encodage
 *   ΔE < 6   échec : les deux couleurs se confondent
 * Un ΔE < 15 en vision normale est un échec dur : même sans daltonisme,
 * la paire ne se lit pas.
 */

const argv = process.argv.slice(2);
if (!argv[0]) {
  console.error('Usage : node valider-palette.mjs "#hex,#hex,…" [--fond "#hex"]');
  process.exit(2);
}
const couleurs = argv[0].split(',').map((s) => s.trim()).filter(Boolean);
const iFond = argv.indexOf('--fond');
const fond = iFond === -1 ? '#ffffff' : argv[iFond + 1];

// ------------------------------------------------------------- conversions
const hex2rgb = (h) => {
  const t = h.replace('#', '');
  const n = t.length === 3 ? t.split('').map((c) => c + c).join('') : t;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const delin = (c) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

// sRGB linéaire → OKLab (Björn Ottosson)
const oklab = ([r, g, b]) => {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
};
const deltaE = (a, b) => {
  const [A, B] = [oklab(a), oklab(b)];
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) * 100;
};

// Simulation des dichromaties (matrices Viénot et al. 1999, espace linéaire)
const MAT = {
  protan: [[0.0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]],
  deutan: [[1, 0, 0], [0.9513092, 0, 0.04866992], [0, 0, 1]],
  tritan: [[1, 0, 0], [0, 1, 0], [-0.86744736, 1.86727089, 0]],
};
const simuler = ([r, g, b], type) => {
  const v = [lin(r), lin(g), lin(b)];
  const M = MAT[type];
  return M.map((ligne) => delin(ligne.reduce((acc, k, i) => acc + k * v[i], 0)));
};

// Contraste WCAG, pour savoir si la couleur peut aussi porter du texte
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ---------------------------------------------------------------- résultats
const rgbs = couleurs.map(hex2rgb);
const rgbFond = hex2rgb(fond);

console.log(`# Palette — ${couleurs.length} couleurs sur fond ${fond}\n`);

console.log('## Contraste de chaque couleur sur le fond\n');
for (let i = 0; i < rgbs.length; i++) {
  const c = contraste(rgbs[i], rgbFond);
  const note = c >= 4.5 ? 'texte courant' : c >= 3 ? 'texte large ou aplat seulement' : 'aplat seulement — jamais de texte';
  console.log(`- ${couleurs[i]} : ${c.toFixed(2)}:1 — ${note}`);
}

console.log('\n## Séparation de chaque paire\n');
let plancher = [];
let echecs = [];
for (let i = 0; i < rgbs.length; i++) {
  for (let j = i + 1; j < rgbs.length; j++) {
    const normal = deltaE(rgbs[i], rgbs[j]);
    const vues = Object.keys(MAT).map((t) => ({
      t, d: deltaE(simuler(rgbs[i], t), simuler(rgbs[j], t)),
    }));
    const pire = vues.reduce((a, b) => (a.d < b.d ? a : b));
    const etat = pire.d >= 12 ? 'confortable'
      : pire.d >= 8 ? 'acceptable'
      : pire.d >= 6 ? 'PLANCHER'
      : 'ÉCHEC';
    if (etat === 'PLANCHER') plancher.push([couleurs[i], couleurs[j], pire]);
    if (etat === 'ÉCHEC' || normal < 15) echecs.push([couleurs[i], couleurs[j], pire, normal]);
    console.log(
      `- ${couleurs[i]} ↔ ${couleurs[j]} : ${etat} — ` +
      `ΔE ${pire.d.toFixed(1)} (${pire.t}), ${normal.toFixed(1)} en vision normale`
    );
  }
}

console.log('\n## Conséquence pour l\'interface\n');
if (echecs.length) {
  console.log('Des paires se confondent. Il faut re-choisir les couleurs — aucun');
  console.log('encodage secondaire ne rattrape une paire sous ΔE 6, ni un ΔE');
  console.log('inférieur à 15 en vision normale.\n');
  for (const [a, b] of echecs) console.log(`  ${a} ↔ ${b}`);
} else if (plancher.length) {
  console.log('Les paires suivantes sont au plancher. Elles restent utilisables,');
  console.log('mais **l\'état qu\'elles portent ne peut pas être donné par la couleur');
  console.log('seule** : chaque élément doit porter en plus une icône ET un libellé');
  console.log('écrit (« Bonne réponse », « Votre réponse · faux »). C\'est une règle');
  console.log('du système, pas une préférence.\n');
  for (const [a, b, p] of plancher) console.log(`  ${a} ↔ ${b} — ΔE ${p.d.toFixed(1)} en ${p.t}`);
} else {
  console.log('Toutes les paires se distinguent, y compris en vision dichromate.');
  console.log('Un encodage secondaire reste recommandé mais n\'est plus indispensable.');
}
process.exit(echecs.length ? 1 : 0);
