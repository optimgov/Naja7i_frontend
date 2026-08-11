#!/usr/bin/env node
/**
 * capturer.mjs — prend une capture d'écran pour la regarder.
 *
 *   node capturer.mjs <fichier.html|url> <sortie.png> [options]
 *
 *   --hash <écran>      fragment d'URL à visiter
 *   --largeur 1440      largeur de vue (défaut 1440)
 *   --hauteur 1000      hauteur de vue (défaut 1000)
 *   --pleine            page entière plutôt que la seule vue
 *   --rtl "<sél.>"      clique ce sélecteur avant la capture (bascule de langue)
 *   --sombre "<sél.>"   clique ce sélecteur avant la capture (bascule de thème)
 *   --decouper 0,0,1440,1200   rogner (x,y,largeur,hauteur)
 *   --chromium <chemin> binaire (défaut : $CHROMIUM ou /opt/pw-browsers/chromium)
 *
 * Une capture pleine page d'un écran long dépasse souvent ce qu'un outil de
 * lecture d'image restitue lisiblement. Découpez en deux ou trois bandes
 * plutôt que de regarder une image de 4 000 px de haut réduite à néant.
 */

import { chromium } from 'playwright';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const [cible, sortie] = argv;
if (!cible || !sortie) {
  console.error('Usage : node capturer.mjs <fichier.html|url> <sortie.png> [--hash x] [--largeur 1440] [--pleine] [--rtl "sél"] [--sombre "sél"] [--decouper x,y,l,h]');
  process.exit(2);
}
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const flag = (n) => argv.includes('--' + n);

const url = (/^https?:/.test(cible) ? cible : 'file://' + resolve(cible)) + (opt('hash', '') ? '#' + opt('hash') : '');
const largeur = +opt('largeur', 1440);
const hauteur = +opt('hauteur', 1000);
const decoupe = opt('decouper', null);

const navigateur = await chromium.launch({
  executablePath: opt('chromium', process.env.CHROMIUM || '/opt/pw-browsers/chromium'),
});
const page = await navigateur.newPage({ viewport: { width: largeur, height: hauteur } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(900);          // laisser les polices web s'installer
if (opt('sombre', null)) await page.click(opt('sombre')).catch(() => {});
if (opt('rtl', null)) await page.click(opt('rtl')).catch(() => {});
await page.waitForTimeout(500);

const options = { path: sortie, fullPage: flag('pleine') };
if (decoupe) {
  const [x, y, width, height] = decoupe.split(',').map(Number);
  options.clip = { x, y, width, height };
  options.fullPage = true;
}
await page.screenshot(options);
await navigateur.close();
console.log(sortie);
