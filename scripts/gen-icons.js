#!/usr/bin/env node
/**
 * gen-icons.js — gera todos os ícones a partir de UMA imagem fonte.
 *
 * Uso:  node scripts/gen-icons.js [caminho-da-imagem]
 *       (padrão: assets/adaptive-icon.png — o adaptive logo com fundo transparente)
 *
 * A fonte pode ter margens transparentes (adaptive logo): a arte é recortada
 * (trim) e recomposta em cada alvo, então o enquadramento fica consistente
 * independente do padding da fonte.
 *
 * Gera:
 *  - Android mipmaps (legacy + round + adaptive foreground) em todas as densidades
 *  - Banner de TV/Firestick 640x360 com o logo COMPLETO (contain, sem crop)
 *  - assets/icon.png, assets/adaptive-icon.png*, assets/splash.png (Expo)
 *    (* pulado quando a própria fonte já é o adaptive-icon)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SRC = path.resolve(process.argv[2] || path.join(root, 'assets/adaptive-icon.png'));
const BG = { r: 10, g: 8, b: 16, alpha: 1 };        // #0a0810 (igual ao iconBackground)
const SPLASH_BG = { r: 6, g: 3, b: 13, alpha: 1 };  // #06030d (igual ao colors.splashBg)

if (!fs.existsSync(SRC)) {
  console.error(`✗ imagem fonte não encontrada: ${SRC}\n  Salve sua arte em assets/adaptive-icon.png (ou passe o caminho).`);
  process.exit(1);
}

const resBase = path.join(root, 'android/app/src/main/res');

const circleMask = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

/** Compoẽ a arte (contain) centralizada num canvas w×h. bg=null → transparente. */
async function compose(artBuf, w, h, artScale, bg) {
  const art = await sharp(artBuf)
    .resize({ width: Math.round(w * artScale), height: Math.round(h * artScale), fit: 'inside' })
    .png().toBuffer();
  const meta = await sharp(art).metadata();
  return sharp({ create: { width: w, height: h, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, top: Math.round((h - meta.height) / 2), left: Math.round((w - meta.width) / 2) }])
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
  // Fonte inteira em memória ANTES de qualquer escrita — permite SRC == destino.
  const srcBuf = fs.readFileSync(SRC);
  // Arte sem as margens transparentes
  const artBuf = await sharp(srcBuf).trim().png().toBuffer();

  for (const d of DENSITIES) {
    const dir = path.join(resBase, d.dir);
    fs.mkdirSync(dir, { recursive: true });
    // Legacy: arte a 82% sobre o fundo da marca
    const legacy = await compose(artBuf, d.icon, d.icon, 0.82, BG);
    await sharp(legacy).toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(legacy).composite([{ input: circleMask(d.icon), blend: 'dest-in' }]).png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));
    // Adaptive foreground: arte na safe zone (66%) em canvas transparente
    await sharp(await compose(artBuf, d.fg, d.fg, 0.66, null)).toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  // Banner de TV/Firestick (16:9) — logo completo, sem crop, sobre o fundo da marca
  for (const dir of ['drawable', 'drawable-xhdpi']) {
    await sharp(await compose(artBuf, 640, 360, 0.86, BG)).toFile(path.join(resBase, dir, 'tv_banner.png'));
  }

  // Assets do Expo
  await sharp(await compose(artBuf, 1024, 1024, 0.82, BG)).toFile(path.join(root, 'assets/icon.png'));
  if (SRC !== path.resolve(root, 'assets/adaptive-icon.png')) {
    await sharp(await compose(artBuf, 1024, 1024, 0.66, null)).toFile(path.join(root, 'assets/adaptive-icon.png'));
  }
  await sharp(await compose(artBuf, 1242, 1242, 0.5, SPLASH_BG)).toFile(path.join(root, 'assets/splash.png'));

  // Glow da splash animada — gradiente radial suave do design (entrance-animation.html):
  // radial-gradient(ellipse 50% 46%, rgba(150,70,240,.55) 0%, rgba(120,40,210,.28) 36%, transparent 66%)
  const glowSvg = Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="0.5" cy="0.5" r="0.5"
        gradientTransform="translate(0 0.04) scale(1 0.92)">
        <stop offset="0%"  stop-color="rgb(150,70,240)" stop-opacity="0.55"/>
        <stop offset="36%" stop-color="rgb(120,40,210)" stop-opacity="0.28"/>
        <stop offset="66%" stop-color="rgb(120,40,210)" stop-opacity="0"/>
        <stop offset="100%" stop-color="rgb(120,40,210)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="512" height="512" fill="url(#g)"/>
  </svg>`);
  await sharp(glowSvg).png().toFile(path.join(root, 'assets/splash-glow.png'));

  console.log('✓ ícones gerados a partir de', path.relative(root, SRC));
  console.log('  mipmaps (legacy/round/foreground) · tv_banner 640x360 · icon/adaptive-icon/splash · splash-glow');
})();
