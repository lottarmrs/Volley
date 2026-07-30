/**
 * Dobra de acentos para comparacao de texto em portugues.
 *
 * Existia em quatro copias identicas (importacao de backup, deteccao de duplicata,
 * chave semantica do sync, chave do ledger de sync) e em nenhuma delas na busca —
 * justamente o unico lugar onde o usuario digita. Quem procurava "joao" nao achava
 * "Joao" cadastrado como "João".
 *
 * Nao usar para gerar handle: `slugify` (username.ts) troca tudo que nao e
 * alfanumerico por hifen. Aqui os espacos sao preservados, porque comparar nome
 * proprio precisa deles.
 */
export function foldForComparison(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Verdadeiro quando `query` aparece em `haystack` ignorando acento e caixa.
 * Query vazia casa com tudo, para o campo de busca em branco nao esconder a lista.
 */
export function matchesSearch(haystack: unknown, query: string): boolean {
  const needle = foldForComparison(query);
  if (!needle) return true;
  return foldForComparison(haystack).includes(needle);
}
