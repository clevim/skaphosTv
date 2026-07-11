#!/usr/bin/env node
/**
 * gen-tentacle-paths.js — pré-computa a geometria dos tentáculos da splash
 * (scripts/tentacle-generator.js) e grava como constantes TypeScript em
 * src/generated/tentaclePaths.ts. Rodar UMA VEZ ao mudar HERO_CONFIGS/
 * BG_CONFIGS — um FireStick não precisa recalcular 11 tentáculos × 48
 * pontos a cada boot (ver porting-react-native.md do projeto de design).
 */
const fs = require('fs');
const path = require('path');
const { makeHeroTentacle, makeBgTentacle, HERO_CONFIGS, BG_CONFIGS } = require('./tentacle-generator');

const animOf = (c) => ({
  ax: c.ax, ay: c.ay, delay: c.delay,
  sway: c.sway, swayDur: c.swayDur, swayDelay: c.swayDelay,
  sway2: c.sway2, sway2Dur: c.sway2Dur, sway2Delay: c.sway2Delay,
  breathe: c.breathe, breatheDur: c.breatheDur, breatheDelay: c.breatheDelay,
});

const hero = HERO_CONFIGS.map((c) => ({ name: c.name, anim: animOf(c), geo: makeHeroTentacle(c) }));
const bg = BG_CONFIGS.map((c) => ({ name: c.name, anim: animOf(c), geo: makeBgTentacle(c) }));

const out = `// AUTO-GERADO por scripts/gen-tentacle-paths.js — não editar à mão.
// Fonte: scripts/tentacle-generator.js (mesma geometria do protótipo
// entrance-animation.html do projeto Claude Design). ViewBox 1920×1080.

export interface TentacleAnim {
  /** Âncora (pivô) fora da tela — sway/sway2/breathe pivotam TODOS aqui. */
  ax: number; ay: number;
  /** Atraso (s) do "grow" de entrada. */
  delay: number;
  sway: number; swayDur: number; swayDelay: number;
  sway2: number; sway2Dur: number; sway2Delay: number;
  breathe: number; breatheDur: number; breatheDelay: number;
}

export interface Sucker { cx: number; cy: number; rx: number; ry: number; rot: number }

export interface HeroGeo {
  fill: string; edge: string; rim: string; bright: string;
  suckers: Sucker[];
  tipCap: { cx: number; cy: number; r: number };
}

export interface BgGeo { fill: string; rim: string }

export const HERO_LIMBS: { name: string; anim: TentacleAnim; geo: HeroGeo }[] = ${JSON.stringify(hero, null, 2)};

export const BG_LIMBS: { name: string; anim: TentacleAnim; geo: BgGeo }[] = ${JSON.stringify(bg, null, 2)};
`;

const dest = path.join(__dirname, '..', 'src', 'generated', 'tentaclePaths.ts');
fs.writeFileSync(dest, out);
console.log(`✓ ${dest} (${hero.length} hero + ${bg.length} bg)`);
