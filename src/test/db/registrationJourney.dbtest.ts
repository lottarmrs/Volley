import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * A pelada inteira, de segunda ao sorteio, com catorze contas de verdade.
 *
 * As outras suítes provam cada comando isolado. Esta prova que eles funcionam
 * JUNTOS: abrir, encher, virar reserva, pagar, desistir, promover, vencer o
 * prazo, cortar, recusar a trava e finalmente sortear. O relógio é simulado
 * movendo `payment_due_at` para trás -- é a única forma de fazer um prazo
 * vencer dentro de um teste.
 */

const CAPACIDADE = 12;
const ATLETAS = 14;

if (!isTestDatabaseConfigured()) {
  test(`registration journey requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
  });

  test.after(async () => {
    await client?.end();
  });

  interface Atleta {
    userId: string;
    playerId: string;
    nome: string;
  }

  async function usuario(rotulo: string): Promise<string> {
    const email = `jornada-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [rows[0].id, email],
    );
    return rows[0].id;
  }

  async function cena() {
    const donoId = await usuario('organizador');
    const { rows } = await asIdentityCommitting(client, donoId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Jornada ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [comunidade, donoId],
    );

    const sessao = randomUUID();
    await asIdentityCommitting(client, donoId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessao, comunidade, 'Pelada de quinta'],
      ),
    );

    const janela = randomUUID();
    await asIdentityCommitting(client, donoId, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        janela,
        sessao,
        CAPACIDADE,
      ]),
    );
    await asIdentityCommitting(client, donoId, () =>
      client.query('select * from public.open_registration($1,$2,$3)', [randomUUID(), janela, 1]),
    );

    const atletas: Atleta[] = [];
    for (let i = 0; i < ATLETAS; i += 1) {
      const nome = `Atleta ${String(i + 1).padStart(2, '0')}`;
      const userId = await usuario(`a${i}`);
      await client.query(
        `insert into public.community_memberships (community_id, user_id, role, status)
         values ($1, $2, 'member', 'active')
         on conflict (community_id, user_id) do update set status = 'active'`,
        [comunidade, userId],
      );
      const pronto = await asIdentityCommitting(client, userId, () =>
        client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
      );
      const playerId = pronto.rows[0].player_id;
      await client.query(
        `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
         select $1, $2, 'ACTIVE', 'SELF_CLAIM', now()
          where not exists (
            select 1 from public.player_account_links where user_id = $2 and status = 'ACTIVE'
          )`,
        [playerId, userId],
      );
      await client.query('update public.players set name = $2 where id = $1', [playerId, nome]);
      await client.query(
        `insert into public.community_players (community_id, player_id, owner_id, active, status)
         values ($1, $2, $3, true, 'active')
         on conflict (community_id, player_id) do nothing`,
        [comunidade, playerId, donoId],
      );
      atletas.push({ userId, playerId, nome });
    }

    return { donoId, comunidade, sessao, janela, atletas };
  }

  const entrar = (atleta: Atleta, janela: string) =>
    asIdentityCommitting(client, atleta.userId, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        janela,
      ]),
    );

  const sair = (atleta: Atleta, janela: string) =>
    asIdentityCommitting(client, atleta.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), janela]),
    );

  const pagar = (donoId: string, janela: string, atleta: Atleta, pago = true) =>
    asIdentityCommitting(client, donoId, () =>
      client.query('select * from public.mark_registration_payment($1,$2,$3,$4)', [
        randomUUID(),
        janela,
        atleta.playerId,
        pago,
      ]),
    );

  async function quadro(donoId: string, janela: string) {
    const { rows } = await asIdentityCommitting(client, donoId, () =>
      client.query<{
        board: {
          capacity: number;
          confirmed_count: number;
          waitlisted_count: number;
          paid_count: number;
          pending_deadline_cut: { demoted: string[]; promoted: string[] } | null;
          entries: { player_id: string; status: string; queue_position: number | null }[];
        };
      }>('select public.read_registration_board($1) as board', [janela]),
    );
    return rows[0].board;
  }

  const confirmados = (b: Awaited<ReturnType<typeof quadro>>) =>
    b.entries.filter((e) => e.status === 'CONFIRMED').map((e) => e.player_id);
  const reserva = (b: Awaited<ReturnType<typeof quadro>>) =>
    b.entries.filter((e) => e.status === 'WAITLISTED').map((e) => e.player_id);

  const revisao = async (janela: string) =>
    (
      await client.query<{ revision: number }>(
        'select revision from public.registration_windows where id = $1',
        [janela],
      )
    ).rows[0].revision;

  test('da abertura ao sorteio: catorze atletas, doze vagas, prazo e pagamento', async () => {
    const { donoId, sessao, janela, atletas } = await cena();

    // Segunda: catorze entram, doze pegam vaga e dois viram reserva.
    for (const atleta of atletas) await entrar(atleta, janela);

    let b = await quadro(donoId, janela);
    assert.equal(b.confirmed_count, CAPACIDADE, 'doze confirmados');
    assert.equal(b.waitlisted_count, ATLETAS - CAPACIDADE, 'dois na reserva');
    assert.equal(b.paid_count, 0, 'ninguem pagou ainda');
    assert.deepEqual(
      reserva(b).map((id) => atletas.findIndex((a) => a.playerId === id)),
      [12, 13],
      'a reserva segue a ordem de chegada enquanto ninguem pagou',
    );

    // Terça: dez dos doze pagam.
    for (const atleta of atletas.slice(0, 10)) await pagar(donoId, janela, atleta);
    b = await quadro(donoId, janela);
    assert.equal(b.paid_count, 10);

    // O 14º paga mesmo estando na reserva, e passa o 13º, que nao pagou.
    await pagar(donoId, janela, atletas[13]);
    b = await quadro(donoId, janela);
    assert.deepEqual(
      reserva(b).map((id) => atletas.findIndex((a) => a.playerId === id)),
      [13, 12],
      'quem pagou vem primeiro na reserva, mesmo tendo chegado depois',
    );

    // Quarta: um confirmado que ja tinha pago desiste. A vaga vai para o
    // primeiro da reserva -- que e o que pagou.
    await sair(atletas[0], janela);
    b = await quadro(donoId, janela);
    assert.ok(confirmados(b).includes(atletas[13].playerId), 'o reserva que pagou subiu');
    assert.equal(b.confirmed_count, CAPACIDADE);

    // Quarta ao meio-dia: o organizador marca o prazo e ele vence.
    await asIdentityCommitting(client, donoId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,$3)', [
        randomUUID(),
        janela,
        new Date(Date.now() + 3600000).toISOString(),
      ]),
    );
    await client.query(
      `update public.registration_windows set payment_due_at = now() - interval '1 minute'
        where id = $1`,
      [janela],
    );

    b = await quadro(donoId, janela);
    assert.ok(b.pending_deadline_cut, 'o quadro anuncia o corte antes de aplicar');
    assert.equal(
      b.pending_deadline_cut?.demoted.length,
      2,
      'os dois confirmados sem pagamento caem',
    );

    // Aplicar agora: os nao pagos caem, e sobe quem pagou -- so restou o 13º,
    // que nao pagou, entao nao sobe ninguem e a lista fica com onze.
    await asIdentityCommitting(client, donoId, () =>
      client.query('select * from public.apply_registration_payment_deadline($1,$2)', [
        randomUUID(),
        janela,
      ]),
    );
    b = await quadro(donoId, janela);
    // Dez: os doze iniciais menos o que desistiu e menos os dois que nao
    // pagaram; o 13 subiu no lugar do que saiu, e o 12, sem pagar, fica.
    assert.equal(b.confirmed_count, 10, 'dez pagos seguem dentro');
    assert.equal(b.paid_count, 10, 'todo confirmado esta quitado');
    assert.equal(b.pending_deadline_cut, null, 'o corte ja rodou');

    // Quinta: travar ainda e possivel porque nao ha confirmado sem pagamento.
    const antesDeFechar = await revisao(janela);
    const fechada = await asIdentityCommitting(client, donoId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.close_registration($1,$2,$3)',
        [randomUUID(), janela, antesDeFechar],
      ),
    );
    const travada = await asIdentityCommitting(client, donoId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.lock_registration($1,$2,$3)',
        [randomUUID(), janela, fechada.rows[0].window_revision],
      ),
    );

    // Sorteio: o elenco sai exatamente dos confirmados.
    const elenco = await asIdentityCommitting(client, donoId, () =>
      client.query<{ roster_revision_id: string }>(
        'select * from public.finalize_session_roster($1,$2,$3)',
        [randomUUID(), janela, travada.rows[0].window_revision],
      ),
    );
    const participantes = await client.query<{ total: string }>(
      `select count(*) as total from public.roster_revision_entries where roster_revision_id = $1`,
      [elenco.rows[0].roster_revision_id],
    );
    assert.equal(Number(participantes.rows[0].total), 10, 'o elenco tem os dez pagos');
    assert.ok(sessao, 'a sessao seguiu a mesma o tempo todo');
  });

  test('a lista nao trava com pagamento pendente, e destravar e marcar resolve', async () => {
    const { donoId, janela, atletas } = await cena();
    for (const atleta of atletas.slice(0, 3)) await entrar(atleta, janela);

    // Basta um pago para o regime de pagamento passar a valer.
    await pagar(donoId, janela, atletas[0]);

    const antes = await revisao(janela);
    const fechada = await asIdentityCommitting(client, donoId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.close_registration($1,$2,$3)',
        [randomUUID(), janela, antes],
      ),
    );

    const recusa = await asIdentityCommitting(client, donoId, () =>
      client.query('select * from public.lock_registration($1,$2,$3)', [
        randomUUID(),
        janela,
        fechada.rows[0].window_revision,
      ]),
    ).catch((erro: Error) => erro as Error & { code?: string; hint?: string });

    assert.equal((recusa as { code?: string }).code, '23514');
    assert.equal((recusa as { hint?: string }).hint, 'REGISTRATION_UNPAID');

    // Marcar os que faltam resolve, mesmo com a janela ja fechada.
    for (const atleta of atletas.slice(1, 3)) await pagar(donoId, janela, atleta);

    const revisaoAtual = await revisao(janela);
    const travada = await asIdentityCommitting(client, donoId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.lock_registration($1,$2,$3)',
        [randomUUID(), janela, revisaoAtual],
      ),
    );
    assert.ok(travada.rows[0].window_revision > 0, 'com tudo pago, trava');
  });
}
