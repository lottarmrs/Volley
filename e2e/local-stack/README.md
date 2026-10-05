# Pilha local para testes com várias contas

Supabase de verdade em Docker (auth, REST, tempo real) nas portas 59321–59329, para rodar a
jornada com contas reais: quem organiza com MFA, membros pela tela e pela API, várias telas ao
mesmo tempo. Nada aqui fala com produção.

1. Subir a pilha: `npx supabase start --workdir e2e/local-stack`
2. Aplicar o esquema: `node --import tsx e2e/local-stack/aplicar-migrations.ts`
   (o `supabase start` não aplica `schema.sql`; este script aplica ele e as migrations, comando a
   comando, como o harness de `test:db`)
3. `.env.local` na raiz apontando para `http://127.0.0.1:59321` com a chave publicável local, e o
   app em `http://localhost:3300` (`npx vite --port 3300 --host 0.0.0.0`). A membro usa
   `http://127.0.0.1:3300`, outra origem, para ter login separado.
4. Contas: `e2e/fixtures/local-stack.accounts.example.json` (só valem nesta pilha). Quem organiza
   se cadastra pela tela na primeira vez; `preparar-escala.ts` cria as outras 69 e as fichas.
5. Rodar: `npx playwright test -c e2e/local-stack/playwright.config.ts`

Specs: `jornada-da-pelada` (lista, reserva, pagamento, sorteio, placar acompanhado, histórico),
`ao-vivo` (latência de cada ponto em três telas), `escala` (36 atletas em 6 times, 6x0 e 5x1) e
`liga` (6 times de 6 em pontos corridos, uma partida jogada até a classificação) e `sem-sinal`
(placar marcado sem sinal, fechar o app sem sinal e reabrir com sinal, envio da fila quando
volta e conflito com outra tela).
