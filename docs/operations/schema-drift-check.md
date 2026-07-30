# Conferir `schema.sql` contra o banco real

`supabase/migrations/schema.sql` é o retrato consolidado do banco. Ele não é gerado
automaticamente, então diverge em silêncio: uma migration aplicada em produção não
atualiza o arquivo sozinha. Um arquivo consolidado que mente é pior que nenhum — quem
reconstrói o banco confia nele.

Não dá para automatizar isso no `npm test`. O ambiente de desenvolvimento tem apenas a
URL e a chave anônima; comparar exige ler `pg_proc`, o que precisa de acesso privilegiado.
O procedimento abaixo é manual, via MCP do Supabase.

## Quando rodar

Antes de qualquer corte ou reconstrução de banco, e depois de uma sequência de migrations
aplicadas direto em produção.

## Passo 1 — tirar as assinaturas do banco

```sql
select string_agg(p.proname || '|' ||
         md5(translate(lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s', '', 'g')),
                       'áàâãéêíóôõúüçñ', 'aaaaeeiooouucn')), E'\n' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f';
```

A normalização remove espaço, comentário e acento **de propósito**. Sem isso o
resultado afoga em ruído: numa conferência de 2026-07-30, 13 das 16 divergências
aparentes eram só acento e comentário, e as 3 reais quase passaram despercebidas.

## Passo 2 — comparar com o arquivo

Salve a saída como `prod.txt` (uma linha `nome|hash`) e rode:

```js
// node compara.cjs prod.txt
const fs = require('fs'), crypto = require('crypto');
const s = fs.readFileSync('supabase/migrations/schema.sql', 'utf8');
const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\([\s\S]*?\bas\s+(\$[a-z_]*\$)([\s\S]*?)\2/gi;
const bodies = {};
let m; while ((m = re.exec(s)) !== null) bodies[m[1].toLowerCase()] = m[3];
const de = 'áàâãéêíóôõúüçñ', para = 'aaaaeeiooouucn';
const fold = t => [...t].map(c => { const i = de.indexOf(c); return i < 0 ? c : para[i]; }).join('');
const norm = t => crypto.createHash('md5')
  .update(fold(t.toLowerCase().replace(/--[^\n]*/g, '').replace(/\s/g, ''))).digest('hex');
for (const linha of fs.readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const [nome, hash] = linha.trim().split('|');
  if (!(nome in bodies)) console.log('AUSENTE  ', nome);
  else if (norm(bodies[nome]) !== hash) console.log('DIVERGE  ', nome);
}
```

Silêncio significa que as duas fontes concordam.

## Passo 3 — cuidado com o que a comparação NÃO cobre

Ela olha só o corpo das funções. Ficam de fora: tabelas, colunas, políticas RLS, grants,
índices, triggers comuns e **event triggers**. Foi justamente um event trigger
(`ensure_rls`) que passou despercebido por mais tempo — a função `rls_auto_enable`
nunca tinha sido versionada, e com ela sumiria a rede que liga RLS em toda tabela nova.

Para grants e políticas, prefira consultar `has_table_privilege` e `pg_policies`
diretamente quando o assunto for sensível.

## Última conferência

2026-07-30 — 56 funções em produção, 56 batendo. Três correções aplicadas ao arquivo
naquele dia (`handle_new_user` sem o recálculo de carreira no claim, `reset_product_data`
apontando para uma tabela inexistente, `rls_auto_enable` e seu event trigger ausentes),
todas cobertas por teste em `src/infra/supabase/schema.test.ts`.

Divergência conhecida e deliberadamente não corrigida: as mensagens de erro em produção
estão sem acento (`'O papel so pode ser alterado...'`) enquanto o `schema.sql` as tem
acentuadas. É texto que o usuário vê. Corrigir mexe em várias funções de uma vez e é
decisão de produto, não de sincronização.
