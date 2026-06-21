#!/usr/bin/env node
/**
 * gen-icons.js — gera todos os ícones a partir de UMA imagem fonte.
 *
 * Uso:  node scripts/gen-icons.js [caminho-da-imagem]
 *       (padrão: assets/brand-source.png)
 *
 * Gera:
 *  - Android mipmaps (legacy + round + adaptive foreground) em todas as densidades
 *  - Banner de TV (320x180) em drawable/ e drawable-xhdpi/
 *  - assets/icon.png, assets/adaptive-icon.png, assets/splash.png (Expo)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(root, 'assets/brand-source.png');
const BG = { r: 10, g: 8, b: 16, alpha: 1 }; // #0a0810 (igual ao iconBackground)

if (!fs.existsSync(SRC)) {
  console.error(`✗ imagem fonte não encontrada: ${SRC}\n  Salve sua arte em assets/brand-source.png (ou passe o caminho).`);
  process.exit(1);
}

const resBase = path.join(root, 'android/app/src/main/res');

const square = (size) =>
  sharp(SRC).resize({ width: size, height: size, fit: 'cover', position: 'centre' }).png().toBuffer();

const circleMask = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

// foreground adaptativo: arte centralizada (~72%) em canvas transparente (a cor de fundo aparece nas bordas)
async function foreground(fgSize) {
  const inner = Math.round(fgSize * 0.72);
  const art = await sharp(SRC).resize({ width: inner, height: inner, fit: 'cover', position: 'centre' }).png().toBuffer();
  const pad = Math.round((fgSize - inner) / 2);
  return sharp({ create: { width: fgSize, height: fgSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, top: pad, left: pad }])
    .png().toBuffer();
}

const DENSITIES = [
  { dir: 'mipmap-mdpi',    icon: 48,  fg: 108 },
  { dir: 'mipmap-hdpi',    icon: 72,  fg: 162 },
  { dir: 'mipmap-xhdpi',   icon: 96,  fg: 216 },
  { dir: 'mipmap-xxhdpi',  icon: 144, fg: 324 },
  { dir: 'mipmap-xxxhdpi', icon: 192, fg: 432 },
];

(async () => {
  for (const d of DENSITIES) {
    const dir = path.join(resBase, d.dir);
    fs.mkdirSync(dir, { recursive: true });
    const sq = await square(d.icon);
    await sharp(sq).toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(sq).composite([{ input: circleMask(d.icon), blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    await sharp(await foreground(d.fg)).toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  // Banner de TV (16:9) — usa a arte completa
  for (const dir of ['drawable', 'drawable-xhdpi']) {
    await sharp(SRC).resize({ width: 320, height: 180, fit: 'cover', position: 'centre' }).png()
      .toFile(path.join(resBase, dir, 'tv_banner.png'));
  }

  // Assets do Expo
  await sharp(SRC).resize({ width: 1024, height: 1024, fit: 'cover', position: 'centre' }).png()
    .toFile(path.join(root, 'assets/icon.png'));
  await sharp(await (async () => {
    const inner = Math.round(1024 * 0.72);
    const art = await sharp(SRC).resize({ width: inner, height: inner, fit: 'cover', position: 'centre' }).png().toBuffer();
    const pad = Math.round((1024 - inner) / 2);
    return sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: art, top: pad, left: pad }]).png().toBuffer();
  })()).toFile(path.join(root, 'assets/adaptive-icon.png'));
  await sharp(SRC).resize({ width: 1242, height: 1242, fit: 'cover', position: 'centre' }).flatten({ background: BG }).png()
    .toFile(path.join(root, 'assets/splash.png'));

  console.log('✓ ícones gerados a partir de', path.relative(root, SRC));
  console.log('  mipmaps (legacy/round/foreground) · tv_banner · icon/adaptive-icon/splash');
})();
