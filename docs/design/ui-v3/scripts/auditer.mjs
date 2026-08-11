#!/usr/bin/env node
/**
 * auditer.mjs — passe un écran au crible dans un vrai navigateur.
 *
 * Ce script existe parce que ces sept défauts ne se voient pas en relisant le
 * code : il faut mesurer le rendu. Chacun a été rencontré en production.
 *
 *   node auditer.mjs <url|fichier.html> [options]
 *
 *   --hash a,b,c        écrans à visiter (fragments d'URL), défaut : la page seule
 *   --largeur 1440,390  largeurs de viewport à tester (défaut 1440,390)
 *   --rtl "<sélecteur>" sélecteur du bouton de bascule de langue, s'il existe
 *   --sombre "<sél.>"   sélecteur du bouton de bascule de thème, s'il existe
 *   --json <chemin>     écrit le rapport brut en JSON
 *   --cookies <chemin>  cookies Playwright (JSON) — pour un écran sous session
 *   --chromium <chemin> binaire (défaut : $CHROMIUM ou /opt/pw-browsers/chromium)
 *
 * Sortie : un rapport lisible, trié par gravité. Code de sortie 1 s'il reste
 * des anomalies « grave », 0 sinon — utilisable en intégration continue.
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const cible = argv[0];
if (!cible || cible.startsWith('--')) {
  console.error('Usage : node auditer.mjs <url|fichier.html> [--hash a,b] [--largeur 1440,390] [--rtl "sél"] [--sombre "sél"] [--json rapport.json]');
  process.exit(2);
}
const opt = (nom, defaut) => {
  const i = argv.indexOf('--' + nom);
  return i === -1 ? defaut : argv[i + 1];
};
const hashs = opt('hash', '').split(',').filter(Boolean);
const largeurs = opt('largeur', '1440,390').split(',').map(Number);
const selRtl = opt('rtl', null);
const selSombre = opt('sombre', null);
const sortieJson = opt('json', null);
// Cookies d'une session déjà ouverte. Sans eux, un écran protégé se mesure
// redirigé vers la connexion — on auditerait six fois le même formulaire.
const fichierCookies = opt('cookies', null);
const executablePath = opt('chromium', process.env.CHROMIUM || '/opt/pw-browsers/chromium');

const url = /^https?:/.test(cible) ? cible : 'file://' + resolve(cible);

// ------------------------------------------------------- sonde côté page
// Tout ce bloc s'exécute DANS la page. Il ne dépend d'aucune bibliothèque.
function sonde() {
  const out = { debordement: [], invisibles: [], contraste: [], cibles: [], bidi: [], statuts: [] };
  const vw = document.documentElement.clientWidth;
  const rtl = document.documentElement.dir === 'rtl';

  const nom = (e) => {
    const c = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '';
    return e.tagName.toLowerCase() + c + (e.id ? '#' + e.id : '');
  };
  const extrait = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);

  // --- 1. Débordement horizontal ----------------------------------------
  // Symptôme classique : un `white-space: nowrap` ou une largeur fixe qui
  // déborde sur téléphone. La page devient scrollable latéralement.
  if (document.documentElement.scrollWidth > vw + 1) {
    const vus = new Set();
    for (const e of document.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        const k = nom(e);
        if (vus.has(k)) continue;
        vus.add(k);
        out.debordement.push({ selecteur: k, droite: Math.round(r.right), largeurVue: vw, texte: extrait(e) });
      }
    }
  }

  // --- 2. Éléments dimensionnés mais rendus à zéro -----------------------
  // Piège n°1 des barres de progression et des pastilles : un <span> ou un
  // <i> reste `display:inline`, où width/height n'ont aucun effet. L'élément
  // existe dans le DOM, est stylé, et ne s'affiche pas. Invisible en relecture.
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  for (const e of document.querySelectorAll('*')) {
    if (e.namespaceURI !== HTML_NS) continue;   // le contenu d'un <svg> n'est pas concerné
    const s = getComputedStyle(e);
    if (s.display !== 'inline') continue;
    const veutTaille = ['width', 'height', 'inline-size', 'block-size']
      .some((p) => { const v = s.getPropertyValue(p); return v && v !== 'auto' && v !== '0px'; });
    if (!veutTaille) continue;
    const r = e.getBoundingClientRect();
    if (r.height < 1 || r.width < 1) {
      out.invisibles.push({
        selecteur: nom(e), largeur: Math.round(r.width), hauteur: Math.round(r.height),
        cause: 'display:inline ignore width/height — passer en block, inline-block ou flex',
      });
    }
  }

  // --- 3. Contraste du texte (WCAG 2.2) ----------------------------------
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgba = (v) => {
    const t = String(v);
    if (/^(transparent|none)$/.test(t)) return null;
    const m = t.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    // color(srgb …) et oklab/oklch rendent des composantes normalisées 0-1.
    const norme = /^color\(/.test(t) && m.slice(0, 3).every((x) => +x <= 1);
    const k = norme ? 255 : 1;
    const a = m.length > 3 ? +m[3] : 1;
    return [+m[0] * k, +m[1] * k, +m[2] * k, a];
  };
  const fondEffectif = (e) => {
    let n = e;
    while (n && n !== document.documentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.85) return c.slice(0, 3);
      n = n.parentElement;
    }
    const c = rgba(getComputedStyle(document.body).backgroundColor);
    return c ? c.slice(0, 3) : [255, 255, 255];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const vusContraste = new Set();
  for (const e of document.querySelectorAll('body *')) {
    // uniquement les éléments qui portent eux-mêmes du texte visible
    const propre = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length;
    if (!propre) continue;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.15) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    const av = rgba(s.color);
    if (!av || av[3] < 0.15) continue;
    const fd = fondEffectif(e);
    const cr = ratio(av.slice(0, 3), fd);
    const px = parseFloat(s.fontSize);
    const gras = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const grand = px >= 24 || (gras && px >= 18.66);
    const seuil = grand ? 3 : 4.5;
    if (cr < seuil) {
      const k = nom(e) + '|' + s.color + '|' + Math.round(px);
      if (vusContraste.has(k)) continue;
      vusContraste.add(k);
      out.contraste.push({
        selecteur: nom(e), ratio: +cr.toFixed(2), seuil, taille: Math.round(px),
        couleur: s.color, fond: `rgb(${fd.join(', ')})`, texte: extrait(e),
      });
    }
  }

  // --- 4. Cibles tactiles (WCAG 2.2 AA, 24 × 24 px) ----------------------
  for (const e of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;          // masqué, pas trop petit
    // WCAG 2.2 exempte les liens en pleine phrase. On restreint donc aux
    // commandes proprement dites, plus les liens-icônes (libellé très court).
    const estCommande = /^(button|input|select|textarea)$/.test(e.tagName.toLowerCase())
      || e.getAttribute('role') === 'button'
      || (e.textContent || '').trim().length <= 3;
    if (!estCommande) continue;
    if (r.width < 24 || r.height < 24) {
      out.cibles.push({ selecteur: nom(e), largeur: Math.round(r.width), hauteur: Math.round(r.height), texte: extrait(e) });
    }
  }

  // --- 5. Nombres cassés par l'algorithme bidi ---------------------------
  // En contexte RTL, « 4 200 » avec une espace ordinaire (classe bidi WS)
  // s'affiche « 200 4 » : les deux groupes de chiffres sont réordonnés.
  // L'espace fine insécable U+202F (classe CS) les soude. C'est aussi la
  // typographie française correcte, donc le correctif est gratuit.
  if (rtl) {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const vus = new Set();
    let n;
    while ((n = w.nextNode())) {
      const t = n.textContent;
      if (!/\d[ ](\d{3}\b|%)/.test(t)) continue;
      const p = n.parentElement;
      if (!p || !p.getBoundingClientRect().width) continue;
      const frag = t.match(/\S*\d[ ](?:\d{3}\b|%)\S*/)[0];
      if (vus.has(frag)) continue;
      vus.add(frag);
      out.bidi.push({ selecteur: nom(p), fragment: frag, correctif: 'remplacer l\'espace par &#8239; (U+202F)' });
    }
  }

  // --- 6. Statut porté par la couleur seule ------------------------------
  // On ne peut pas décider à la place de l'humain, mais on peut lister les
  // éléments qui portent un état et vérifier qu'ils annoncent cet état
  // autrement que par leur couleur : une icône, un libellé, ou un aria-label.
  const SEL_ETAT = '[data-etat],[data-state],[data-statut],.correct,.incorrect,.succes,.success,.erreur,.error,.valide,.invalide';
  for (const e of document.querySelectorAll(SEL_ETAT)) {
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    const txt = (e.textContent || '');
    const aGlyphe = /[✓✔✕✖✗×⚠!→←●○]/.test(txt);
    const aLibelle = /(bonne|correct|juste|faux|incorrect|erreur|réussi|échou|valide|invalide|succ|right|wrong|passed|failed)/i.test(txt)
      || /(صحيح|خاطئ|خطأ|صواب|ناجح|فاشل)/.test(txt);
    const aAria = e.hasAttribute('aria-label') || e.querySelector('[aria-label]');
    if (!aGlyphe && !aLibelle && !aAria) {
      out.statuts.push({ selecteur: nom(e), texte: extrait(e) });
    }
  }

  return out;
}

// ------------------------------------------------------------ orchestration
const navigateur = await chromium.launch({ executablePath });
const cookies = fichierCookies ? JSON.parse(readFileSync(fichierCookies, 'utf8')) : null;
const rapport = [];

for (const largeur of largeurs) {
  for (const hash of hashs.length ? hashs : ['']) {
    for (const variante of ['clair-ltr', selSombre && 'sombre-ltr', selRtl && 'clair-rtl'].filter(Boolean)) {
      const contexte = await navigateur.newContext({ viewport: { width: largeur, height: 900 } });
      if (cookies) await contexte.addCookies(cookies);
      const page = await contexte.newPage();
      try {
        await page.goto(url + (hash ? '#' + hash : ''), { waitUntil: 'load' });
        await page.waitForTimeout(700);
        if (variante.includes('sombre') && selSombre) { await page.click(selSombre).catch(() => {}); }
        if (variante.includes('rtl') && selRtl) { await page.click(selRtl).catch(() => {}); }
        await page.waitForTimeout(500);
        const r = await page.evaluate(sonde);
        rapport.push({ ecran: hash || '(page)', largeur, variante, ...r });
      } catch (e) {
        rapport.push({ ecran: hash || '(page)', largeur, variante, erreur: String(e.message || e) });
      } finally {
        await page.close();
        await contexte.close();
      }
    }
  }
}
await navigateur.close();

// ------------------------------------------------------------------ rapport
const GRAVITE = {
  debordement: ['grave', 'Débordement horizontal'],
  invisibles: ['grave', 'Élément dimensionné mais rendu à zéro'],
  contraste: ['grave', 'Contraste sous le seuil WCAG'],
  bidi: ['grave', 'Nombre cassé par l\'algorithme bidi'],
  cibles: ['moyen', 'Cible tactile sous 24 × 24 px'],
  statuts: ['moyen', 'État sans marqueur textuel — à vérifier à l\'œil'],
};

const groupes = {};
const signature = (cle, i) =>
  cle === 'contraste' ? `${i.selecteur}|${i.couleur}|${i.fond}|${i.taille}`
  : cle === 'bidi' ? `${i.selecteur}|${i.fragment}`
  : `${i.selecteur}|${i.texte || ''}`;

for (const bloc of rapport) {
  if (bloc.erreur) { (groupes.erreurs ??= []).push({ ...bloc }); continue; }
  for (const cle of Object.keys(GRAVITE)) {
    for (const item of bloc[cle] || []) {
      const g = (groupes[cle] ??= new Map());
      const sig = signature(cle, item);
      const ctx = `${bloc.ecran} ${bloc.largeur}px ${bloc.variante}`;
      if (g.has(sig)) g.get(sig).contextes.add(ctx);
      else g.set(sig, { ...item, contextes: new Set([ctx]) });
    }
  }
}
for (const cle of Object.keys(GRAVITE)) {
  if (groupes[cle]) groupes[cle] = [...groupes[cle].values()]
    .map((i) => ({ ...i, contextes: [...i.contextes] }))
    .sort((a, b) => b.contextes.length - a.contextes.length);
}

let graves = 0;
const lignes = [];
lignes.push(`# Revue de rendu — ${cible}`);
lignes.push('');
lignes.push(`${rapport.length} passes : ${largeurs.join(' / ')} px × ${(hashs.length || 1)} écran(s) × variantes de langue et de thème.`);
lignes.push('');

for (const [cle, [gravite, titre]] of Object.entries(GRAVITE)) {
  const items = groupes[cle] || [];
  if (!items.length) continue;
  if (gravite === 'grave') graves += items.length;
  lignes.push(`## ${titre} — ${items.length} (${gravite})`);
  lignes.push('');
  for (const i of items.slice(0, 25)) {
    const n = i.contextes.length;
    const ctx = n === 1 ? i.contextes[0] : `${i.contextes[0]} +${n - 1} autres passes`;
    if (cle === 'contraste') {
      lignes.push(`- \`${i.selecteur}\` — ratio ${i.ratio} (seuil ${i.seuil}), ${i.taille}px · ${ctx}`);
      lignes.push(`  ${i.couleur} sur ${i.fond} — « ${i.texte} »`);
    } else if (cle === 'debordement') {
      lignes.push(`- \`${i.selecteur}\` dépasse à ${i.droite}px pour ${i.largeurVue}px de vue · ${ctx}`);
    } else if (cle === 'invisibles') {
      lignes.push(`- \`${i.selecteur}\` rendu ${i.largeur}×${i.hauteur} · ${ctx}`);
      lignes.push(`  ${i.cause}`);
    } else if (cle === 'bidi') {
      lignes.push(`- \`${i.selecteur}\` : « ${i.fragment} » · ${ctx} → ${i.correctif}`);
    } else if (cle === 'cibles') {
      lignes.push(`- \`${i.selecteur}\` ${i.largeur}×${i.hauteur} — « ${i.texte} » · ${ctx}`);
    } else {
      lignes.push(`- \`${i.selecteur}\` — « ${i.texte} » · ${ctx}`);
    }
  }
  if (items.length > 25) lignes.push(`- … et ${items.length - 25} autres`);
  lignes.push('');
}

if (groupes.erreurs) {
  lignes.push('## Passes en échec');
  lignes.push('');
  for (const e of groupes.erreurs) lignes.push(`- ${e.ecran} · ${e.largeur}px · ${e.variante} : ${e.erreur}`);
  lignes.push('');
}

if (!graves && !groupes.statuts?.length && !groupes.cibles?.length) {
  lignes.push('Aucune anomalie détectée sur les six contrôles automatiques.');
  lignes.push('');
  lignes.push('Ces contrôles ne remplacent pas le regard : hiérarchie, rythme vertical,');
  lignes.push('justesse du ton et rendu réel des polices arabes se jugent sur capture.');
}

const texte = lignes.join('\n');
console.log(texte);
if (sortieJson) writeFileSync(sortieJson, JSON.stringify(rapport, null, 2));
process.exit(graves ? 1 : 0);
