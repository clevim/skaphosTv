#!/usr/bin/env node
/**
 * gen-intro.js — detecta um vídeo de abertura em assets/ e gera a referência.
 * Se houver assets/intro.(mp4|mov|webm) → o app toca o vídeo na abertura.
 * Se não houver → o app usa a animação simples do logo (AnimatedSplash).
 * Roda automaticamente antes do build.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const candidates = ['intro.mp4', 'intro.mov', 'intro.webm'];
const found = candidates.find((f) => fs.existsSync(path.join(root, 'assets', f)));

const genDir = path.join(root, 'src/generated');
fs.mkdirSync(genDir, { recursive: true });

const content = found
  ? `// AUTO-GERADO por scripts/gen-intro.js — vídeo de abertura detectado.\n` +
    `const introSource: any = require('../../assets/${found}');\nexport default introSource;\n`
  : `// AUTO-GERADO por scripts/gen-intro.js — sem vídeo (assets/intro.mp4). Usa o logo animado.\n` +
    `const introSource: any = null;\nexport default introSource;\n`;

fs.writeFileSync(path.join(genDir, 'introSource.ts'), content);
console.log(found ? `✓ intro: assets/${found} (vídeo de abertura)` : '✓ intro: nenhum → logo animado');
