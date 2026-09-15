# Runbook — colocar o app em uso oficial

> Status: `CURRENT-OPERATIONAL / TRILHA-A`
>
> Owner: `Platform Operations`
>
> Last reviewed: `2026-09-15`
>
> Governing target: [`N2.21-operations-deploy.md`](../architecture/operations/N2.21-operations-deploy.md)

> Escrito em **2026-09-10**. Trilha A: colocar em produção o app que já existe e funciona, sem
> depender de terminar o programa C6 — que é uma refundação construída ao lado e hoje sustenta uma
> única funcionalidade viva. Ver [mapa de alcançabilidade](../architecture/execution/C6-REACHABILITY-MAP.md).

## O que já foi verificado nesta máquina

Não repita estes; eles estão feitos e a evidência é reprodutível.

| Verificação | Resultado |
| --- | --- |
| Suíte completa | 962 unitários, 283 UI, 664 de banco, build — verdes |
| **Suíte e2e, primeira execução** | **12/12** em Chromium, contra o dev server |
| Build de produção servido pelo `nginx.conf` real | app carrega, **zero violação de CSP** |
| Worker do balanceador sob o CSP de produção | **constrói e responde** com `worker-src 'self'` |
| Cadeia da porta de formação no bundle real | worker → porta → precheck → classificação, viva e correta |
| Ordem das migrations | 93 arquivos aplicam do zero num PostgreSQL limpo (é o que o harness faz a cada execução) |

**O que a suíte e2e NÃO prova:** são 12 testes, e oito são a mesma forma — "AccountGate bloqueia
visitante em /rota". Só três exercitam fluxo: início rápido, passos do wizard e placar ao vivo.
Balanceamento, torneio, ranking e sync **não têm cobertura e2e**. Não leia "12/12" como o app
inteiro validado.

## Passos

### 1. Provisionar o banco

Aplicar os 93 arquivos na ordem correta. **A ordem não é a alfabética do diretório** — `schema.sql`
vem primeiro e ordena por último:

```bash
ls supabase/migrations/*.sql | grep -v '/schema\.sql$' | sort | sed '1i supabase/migrations/schema.sql'
```

Com projeto vinculado, `supabase db push` resolve. Pelo SQL Editor, siga a saída acima.

Depois: confirmar a exposição da Data API para o schema `public`. Projetos novos do Supabase às
vezes não expõem tabelas recém-criadas mesmo com os grants corretos.

### 2. Configurar e construir

`cp .env.example .env`, preencher `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, depois
`npm run build`. O `Dockerfile` faz isso em dois estágios e serve pelo nginx.

⚠️ O `docker-compose.yml` publica na **porta 80** com `restart: always`. Confirme que é o que você
quer na máquina de destino antes de subir.

### 3. Testar o login — antes de qualquer outra coisa

Este é o único risco que não consegui verificar daqui, porque exige um Supabase real.

O CSP é novo. `script-src` e `frame-src` liberam `challenges.cloudflare.com` para o widget
Turnstile, mas **não verifiquei se o `api.js` do Turnstile faz requisição a partir do documento
principal**. Se fizer, o `connect-src` atual bloqueia e **o cadastro morre em silêncio** — sem erro
visível para o usuário.

Faça um cadastro real no container de produção, com o console aberto, e procure violação de CSP.
Se aparecer, acrescente `https://challenges.cloudflare.com` ao `connect-src` em `nginx.conf`.

### 4. Rodar a suíte e2e no ambiente

```bash
npx playwright install chromium   # necessário na primeira vez
npx playwright test
```

Ela sobe o próprio dev server e semeia o `localStorage` — não precisa de Supabase.

## Decisões que são suas, não trabalho meu

Nenhuma delas impede subir. Todas mudam o risco que você aceita.

**A9 — bucket de avatares público.** O bucket `avatars` é criado com `public = true`, e bucket
público é servido sem avaliar policy de `storage.objects`. Foto de proposta **ainda não aprovada** é
legível por quem souber a URL. É o único item aberto que eu chamaria de risco real a dado de
usuário. Fechar exige bucket privado com URL assinada, ou copiar o arquivo aprovado para um prefixo
realmente público na aprovação. Detalhes em `HANDOFF.md`.

**A6 — vazamento de nome.** Qualquer conta cria uma comunidade descartável, o que a torna owner, e
volta a ler o nome real de qualquer atleta por username exato.

**Apagar conta não funciona ponta a ponta**, e `reset_product_data` não funciona sobre dado real —
`sessions` tem seis filhos com `on delete restrict` que o reset não apaga, e a guarda de comunidade
target recusa apagar comunidade criada pelo produto atual. Além disso o gateway do reset não é
importado por nada. Se você tem obrigação de atender pedido de exclusão, resolva antes de abrir
para gente real.

## O que eu nunca fiz

Não apliquei migration em Supabase remoto, não implantei imagem, e não exercitei nenhum fluxo com
dado real de usuário. Tudo acima foi verificado com PostgreSQL descartável, build local e navegador
local.
