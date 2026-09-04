/**
 * Resolvedor de módulos para os scripts de checagem.
 * Uso: `node --import ./scripts/ts-register.mjs scripts/check-algo.mjs`
 *
 * Node ESM exige extensão explícita no import; Metro e o TypeScript não. Sem
 * isto, um check só consegue importar módulos-folha — qualquer arquivo que faça
 * `from '../utils/channelUtils'` ou `from '../types'` quebra, e é justamente a
 * lógica com dependências que mais precisa de teste.
 *
 * Só mexe em caminho relativo sem extensão; o resto segue o resolvedor padrão.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js', '.mjs'];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      for (const ext of CANDIDATES) {
        if (existsSync(base + ext)) {
          return nextResolve(pathToFileURL(base + ext).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
