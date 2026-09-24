import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function arquivosDeComponente(raiz: string): string[] {
  return readdirSync(raiz).flatMap((entrada) => {
    const caminho = join(raiz, entrada);
    if (statSync(caminho).isDirectory()) return arquivosDeComponente(caminho);
    return caminho.endsWith('.tsx') ? [caminho] : [];
  });
}

/**
 * Medido no navegador em 2026-09-24: uma utilitaria do Tailwind vence uma regra
 * em `@layer base`, e o piso de toque vive em `@layer base` sob
 * `@media (pointer: coarse)`. Entao `sm:min-h-0` zerava o piso a partir de
 * 640px -- celular deitado e tablet. Eram 17 usos; o piso agora cobre altura e
 * largura sozinho, e nenhuma chamada precisa repeti-lo.
 */
test('AF-TOUCH-001: nenhuma utilitaria cancela o piso de toque de 44px', () => {
  const ofensores = arquivosDeComponente('src')
    .filter((caminho) => !/\.(test|spec|dbtest)\.tsx?$/.test(caminho))
    .flatMap((caminho) => {
      const linhas = readFileSync(caminho, 'utf8').split('\n');
      return linhas.flatMap((linha, indice) =>
        /\bsm:min-[hw]-0\b/.test(linha) ? [`${caminho}:${indice + 1}`] : [],
      );
    });

  assert.deepEqual(ofensores, []);
});

test('AF-TOUCH-002: o piso cobre altura e largura das variantes pequenas', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const piso = css.slice(css.indexOf('@media (pointer: coarse)'));

  for (const regra of ['.btn-xs', '.btn-sm', '.btn-square']) {
    assert.ok(piso.includes(regra), `${regra} deveria ter piso proprio`);
  }
  assert.ok(piso.includes('min-width: 44px'), 'o botao quadrado nasce 32px de largura');
});
