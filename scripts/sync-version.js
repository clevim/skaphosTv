#!/usr/bin/env node
/**
 * sync-version.js — FONTE ÚNICA da versão: app.json (expo.version).
 *
 * Você muda só a versão no app.json e este script propaga para:
 *   - app.json: android.versionCode (derivado do semver)
 *   - android/app/build.gradle: versionName + versionCode
 *   - android/app/src/main/res/values/strings.xml: expo_runtime_version
 *   - package.json: version
 *
 * versionCode derivado do semver (monotônico): major*10000 + minor*100 + patch.
 * Roda automaticamente antes do build (build:firestick).
 *
 * ── runtimeVersion: SEPARADO da versão, de propósito ────────────────────────
 *
 * O expo-updates só entrega um update OTA a um binário cujo runtimeVersion seja
 * IGUAL. Enquanto ele acompanhava `version`, todo release mudava o runtime — e
 * o OTA nunca entregava nada a ninguém. Na prática o app tinha dois mecanismos
 * de atualização e um deles estava morto: até uma correção só de JS obrigava
 * todo mundo a baixar um APK de ~36 MB.
 *
 * Agora `expo.runtimeVersion` é a versão do NATIVO e só muda quando o nativo
 * muda. A regra é mecânica:
 *
 *   mexeu em android/, patches/, ou numa dependência com código nativo
 *     → `node scripts/sync-version.js <versão> --native`   (exige APK novo)
 *   mexeu só em JS/TS/assets
 *     → `node scripts/sync-version.js <versão>`            (sai por OTA)
 *
 * Errar para o lado seguro é não bumpar demais: um runtime novo à toa só
 * significa um APK desnecessário. Errar para o lado errado — publicar OTA de JS
 * que depende de nativo novo — entrega um bundle incompatível a quem tem o
 * binário velho. Na dúvida, use --native.
 *
 * Uso:
 *   node scripts/sync-version.js               # sincroniza a partir do app.json
 *   node scripts/sync-version.js 1.2.0         # define a versão e sincroniza
 *   node scripts/sync-version.js 1.2.0 --native  # + incrementa o runtimeVersion
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const gradlePath = path.join(root, 'android/app/build.gradle');
const stringsPath = path.join(root, 'android/app/src/main/res/values/strings.xml');
const pkgPath = path.join(root, 'package.json');

const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const args = process.argv.slice(2);
const bumpNative = args.includes('--native');

// Versão: argumento (se passado) ou a que já está no app.json
const argVersion = args.find((a) => !a.startsWith('--'));
const version = (argVersion || app.expo.version || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`✗ versão inválida: "${version}" (use M.m.p, ex.: 1.2.0)`);
  process.exit(1);
}
const [maj, min, pat] = version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = maj * 10000 + min * 100 + pat;

// runtimeVersion — só muda com --native. Formato "native-N": string arbitrária
// (o expo-updates não interpreta nada), legível o bastante para ninguém confundir
// com a versão do app ao ler um manifesto.
const prevRuntime = app.expo.runtimeVersion || 'native-1';
let runtimeVersion = prevRuntime;
if (bumpNative) {
  const n = parseInt(String(prevRuntime).replace(/^native-/, ''), 10);
  runtimeVersion = `native-${Number.isFinite(n) ? n + 1 : 1}`;
}

// app.json
app.expo.version = version;
app.expo.runtimeVersion = runtimeVersion;
app.expo.android = app.expo.android || {};
app.expo.android.versionCode = versionCode;
fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n');

// build.gradle
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle
  .replace(/versionName\s+".*?"/, `versionName "${version}"`)
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
fs.writeFileSync(gradlePath, gradle);

// strings.xml
let strings = fs.readFileSync(stringsPath, 'utf8');
strings = strings.replace(
  /(<string name="expo_runtime_version">)[^<]*(<\/string>)/,
  `$1${runtimeVersion}$2`,
);
fs.writeFileSync(stringsPath, strings);

// package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// arquivo TS gerado — versão "assada" no bundle JS (não depende de Constants em runtime)
const genDir = path.join(root, 'src/generated');
fs.mkdirSync(genDir, { recursive: true });
fs.writeFileSync(
  path.join(genDir, 'appVersion.ts'),
  `// AUTO-GERADO por scripts/sync-version.js — não editar à mão.\n` +
  `export const APP_VERSION = '${version}';\n` +
  `export const BUILD_NUMBER = ${versionCode};\n`,
);

console.log(`✓ versão sincronizada: ${version} (versionCode ${versionCode})`);
console.log('  → app.json · build.gradle · strings.xml · package.json · src/generated/appVersion.ts');
if (bumpNative) {
  console.log(`✓ runtimeVersion: ${prevRuntime} → ${runtimeVersion} — este release EXIGE APK novo (OTA não alcança builds antigos)`);
} else {
  console.log(`· runtimeVersion: ${runtimeVersion} (inalterado) — release compatível por OTA com quem já tem este runtime`);
  console.log('  Mexeu em android/, patches/ ou dependência nativa? Rode de novo com --native.');
}
