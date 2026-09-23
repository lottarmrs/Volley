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

const MIGRATION = '20260923120000_registration_payment.sql';

if (!isTestDatabaseConfigured()) {
  test(`registration payment requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
  });

  test.after(async () => {
    await client?.end();
  });

  async function newUser(label: string): Promise<string> {
    const email = `${label}-${randomUUID()}@test.local`;
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

  async function newAthlete(
    ownerId: string,
    communityId: string,
    userId: string,
    name: string,
  ): Promise<string> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
    const { rows } = await asIdentityCommitting(client, userId, () =>
      client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
    );
    const playerId = rows[0].player_id;
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       select $1, $2, 'ACTIVE', 'SELF_CLAIM', now()
        where not exists (
          select 1 from public.player_account_links where user_id = $2 and status = 'ACTIVE'
        )`,
      [playerId, userId],
    );
    await client.query('update public.players set name = $2 where id = $1', [playerId, name]);
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')
       on conflict (community_id, player_id) do nothing`,
      [communityId, playerId, ownerId],
    );
    return playerId;
  }

  async function fixture(capacity: number) {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Pagamento ${randomUUID()}`,
      ]),
    );
    const communityId = rows[0].id;
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, ownerId],
    );
    const sessionId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessionId, communityId, 'Pelada de quinta'],
      ),
    );
    const windowId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        windowId,
        sessionId,
        capacity,
      ]),
    );
    const revision = (
      await asIdentityCommitting(client, ownerId, () =>
        client.query<{ window_revision: number }>(
          'select * from public.open_registration($1,$2,$3)',
          [randomUUID(), windowId, 1],
        ),
      )
    ).rows[0].window_revision;
    return { ownerId, communityId, sessionId, windowId, revision };
  }

  async function inscrever(
    f: { ownerId: string; communityId: string; windowId: string },
    label: string,
  ): Promise<{ userId: string; playerId: string }> {
    const userId = await newUser(label);
    const playerId = await newAthlete(f.ownerId, f.communityId, userId, `Atleta ${label}`);
    await asIdentityCommitting(client, userId, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        f.windowId,
      ]),
    );
    return { userId, playerId };
  }

  async function marcarPagoDireto(windowId: string, playerId: string): Promise<void> {
    await client.query(
      `update public.registration_entries
          set paid_at = now(), payment_lapsed_at = null
        where registration_window_id = $1 and player_id = $2`,
      [windowId, playerId],
    );
  }

  async function reserva(windowId: string): Promise<string[]> {
    const { rows } = await client.query<{ player_id: string }>(
      `select player_id from app_private.registration_reserve_order($1) order by posicao`,
      [windowId],
    );
    return rows.map((row) => row.player_id);
  }

  async function statusDe(windowId: string, playerId: string): Promise<string> {
    const { rows } = await client.query<{ status: string }>(
      `select status from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, playerId],
    );
    return rows[0].status;
  }

  test('quem pagou vem antes na reserva, e o organizador pode fixar alguém no topo', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');
    const d = await inscrever(f, 'd');

    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED');
    assert.deepEqual(await reserva(f.windowId), [b.playerId, c.playerId, d.playerId]);

    await marcarPagoDireto(f.windowId, d.playerId);
    await marcarPagoDireto(f.windowId, c.playerId);
    assert.deepEqual(
      await reserva(f.windowId),
      [d.playerId, c.playerId, b.playerId],
      'pagos primeiro, na ordem em que pagaram',
    );

    await client.query(
      `update public.registration_entries set reserve_rank = 0
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.deepEqual(
      await reserva(f.windowId),
      [b.playerId, d.playerId, c.playerId],
      'quem o organizador fixa vem antes de todo mundo',
    );
  });

  test('quem perdeu o prazo fica no fim da reserva', async () => {
    const f = await fixture(1);
    await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await client.query(
      `update public.registration_entries set payment_lapsed_at = now()
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.deepEqual(await reserva(f.windowId), [c.playerId, b.playerId]);
  });

  test('passado o prazo, a promoção só sobe quem pagou', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await client.query(
      `update public.registration_windows set payment_due_at = now() - interval '1 hour'
        where id = $1`,
      [f.windowId],
    );
    await marcarPagoDireto(f.windowId, c.playerId);

    await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    assert.equal(await statusDe(f.windowId, c.playerId), 'CONFIRMED', 'o pago sobe');
    assert.equal(await statusDe(f.windowId, b.playerId), 'WAITLISTED', 'o não pago não sobe');
  });

  test('antes do prazo, a promoção segue a ordem da reserva sem exigir pagamento', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');

    await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    assert.equal(await statusDe(f.windowId, b.playerId), 'CONFIRMED');
  });

  async function venceuOPrazo(windowId: string): Promise<void> {
    await client.query(
      `update public.registration_windows set payment_due_at = now() - interval '1 hour'
        where id = $1`,
      [windowId],
    );
  }

  async function cortar(windowId: string): Promise<boolean> {
    const { rows } = await client.query<{ cortou: boolean }>(
      'select app_private.apply_payment_deadline($1) as cortou',
      [windowId],
    );
    return rows[0].cortou;
  }

  test('o corte rebaixa quem não pagou e sobe quem pagou', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await marcarPagoDireto(f.windowId, a.playerId);
    await marcarPagoDireto(f.windowId, c.playerId);
    await venceuOPrazo(f.windowId);

    assert.equal(await cortar(f.windowId), true);
    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED', 'pago segue dentro');
    assert.equal(await statusDe(f.windowId, c.playerId), 'CONFIRMED', 'pago da reserva sobe');
    assert.equal(await statusDe(f.windowId, b.playerId), 'WAITLISTED', 'não pago cai');

    const { rows } = await client.query<{ payment_lapsed_at: string | null }>(
      `select payment_lapsed_at from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.notEqual(rows[0].payment_lapsed_at, null);
  });

  test('o corte não roda duas vezes para o mesmo prazo', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await venceuOPrazo(f.windowId);

    assert.equal(await cortar(f.windowId), true);
    assert.equal(await cortar(f.windowId), false, 'segunda chamada não faz nada');
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');
  });

  test('marcar como pago depois do corte devolve a vaga que ficou vazia', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await venceuOPrazo(f.windowId);
    await cortar(f.windowId);
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');

    await marcarPagoDireto(f.windowId, a.playerId);
    await client.query('select app_private.promote_waitlist_to_capacity($1)', [f.windowId]);

    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED');
  });

  test('sem prazo, no futuro, ou com a janela fechada, nada é cortado', async () => {
    const semPrazo = await fixture(1);
    await inscrever(semPrazo, 'a');
    assert.equal(await cortar(semPrazo.windowId), false, 'sem prazo');

    const futuro = await fixture(1);
    await inscrever(futuro, 'b');
    await client.query(
      `update public.registration_windows set payment_due_at = now() + interval '1 day'
        where id = $1`,
      [futuro.windowId],
    );
    assert.equal(await cortar(futuro.windowId), false, 'prazo no futuro');

    const fechada = await fixture(1);
    const c = await inscrever(fechada, 'c');
    await venceuOPrazo(fechada.windowId);
    await client.query(`update public.registration_windows set status = 'CLOSED' where id = $1`, [
      fechada.windowId,
    ]);
    assert.equal(await cortar(fechada.windowId), false, 'janela fechada');
    assert.equal(await statusDe(fechada.windowId, c.playerId), 'CONFIRMED');
  });

  async function marcar(
    actorId: string,
    windowId: string,
    playerId: string,
    pago: boolean,
  ): Promise<number> {
    const { rows } = await asIdentityCommitting(client, actorId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.mark_registration_payment($1,$2,$3,$4)',
        [randomUUID(), windowId, playerId, pago],
      ),
    );
    return rows[0].window_revision;
  }

  test('repetir o mesmo comando de pagamento não sobe a revisão de novo', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    const comando = randomUUID();

    const primeira = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.mark_registration_payment($1,$2,$3,true)',
        [comando, f.windowId, a.playerId],
      ),
    );
    const segunda = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.mark_registration_payment($1,$2,$3,true)',
        [comando, f.windowId, a.playerId],
      ),
    );
    assert.equal(segunda.rows[0].window_revision, primeira.rows[0].window_revision);
  });

  test('marcar pagamento aplica o corte pendente e promove quem acabou de pagar', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await venceuOPrazo(f.windowId);

    await marcar(f.ownerId, f.windowId, b.playerId, true);

    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED', 'o não pago caiu');
    assert.equal(await statusDe(f.windowId, b.playerId), 'CONFIRMED', 'o pago ocupou a vaga');
  });

  test('marcar como pago limpa o atraso e devolve a entrada à faixa dos pagos', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await venceuOPrazo(f.windowId);
    await cortar(f.windowId);
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');

    await marcar(f.ownerId, f.windowId, a.playerId, true);

    const { rows } = await client.query<{ payment_lapsed_at: string | null }>(
      `select payment_lapsed_at from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, a.playerId],
    );
    assert.equal(rows[0].payment_lapsed_at, null, 'o atraso foi limpo');
    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED', 'voltou para a vaga vazia');
    assert.equal(await statusDe(f.windowId, b.playerId), 'WAITLISTED');
  });

  test('desmarcar não rebaixa ninguém', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await marcar(f.ownerId, f.windowId, a.playerId, true);
    await marcar(f.ownerId, f.windowId, a.playerId, false);

    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED');
    const { rows } = await client.query<{ paid_at: string | null }>(
      `select paid_at from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, a.playerId],
    );
    assert.equal(rows[0].paid_at, null);
  });

  test('só quem organiza marca pagamento', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');

    const erro = await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.mark_registration_payment($1,$2,$3,true)', [
        randomUUID(),
        f.windowId,
        a.playerId,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((erro as { code?: string }).code, '42501');
  });

  test('o prazo precisa ser no futuro, e limpar é sempre permitido', async () => {
    const f = await fixture(1);

    const erro = await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        new Date(Date.now() - 60000).toISOString(),
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((erro as { code?: string }).code, '23514');

    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        new Date(Date.now() + 86400000).toISOString(),
      ]),
    );
    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,null)', [
        randomUUID(),
        f.windowId,
      ]),
    );
    const { rows } = await client.query<{ payment_due_at: string | null }>(
      'select payment_due_at from public.registration_windows where id = $1',
      [f.windowId],
    );
    assert.equal(rows[0].payment_due_at, null);
  });

  test('subir ao topo da reserva passa na frente até de quem pagou', async () => {
    const f = await fixture(1);
    await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await marcar(f.ownerId, f.windowId, c.playerId, true);
    assert.deepEqual(await reserva(f.windowId), [c.playerId, b.playerId]);

    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.boost_registration_reserve_entry($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        b.playerId,
      ]),
    );
    assert.deepEqual(await reserva(f.windowId), [b.playerId, c.playerId]);
  });

  test('o comando de aplicar agora corta e devolve a revisão nova', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    await venceuOPrazo(f.windowId);

    const antes = (
      await client.query<{ revision: number }>(
        'select revision from public.registration_windows where id = $1',
        [f.windowId],
      )
    ).rows[0].revision;

    const { rows } = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ window_revision: number }>(
        'select * from public.apply_registration_payment_deadline($1,$2)',
        [randomUUID(), f.windowId],
      ),
    );

    assert.equal(rows[0].window_revision, antes + 1);
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');
  });

  async function travar(
    actorId: string,
    windowId: string,
  ): Promise<{ ok: true; revision: number } | { ok: false; code?: string; hint?: string }> {
    const revision = (
      await client.query<{ revision: number }>(
        'select revision from public.registration_windows where id = $1',
        [windowId],
      )
    ).rows[0].revision;
    try {
      // OPEN -> CLOSED -> LOCKED: travar exige fechar antes, e e em fechar que o corte roda.
      const fechada = await asIdentityCommitting(client, actorId, () =>
        client.query<{ window_revision: number }>(
          'select * from public.close_registration($1,$2,$3)',
          [randomUUID(), windowId, revision],
        ),
      );
      const { rows } = await asIdentityCommitting(client, actorId, () =>
        client.query<{ window_revision: number }>(
          'select * from public.lock_registration($1,$2,$3)',
          [randomUUID(), windowId, fechada.rows[0].window_revision],
        ),
      );
      return { ok: true, revision: rows[0].window_revision };
    } catch (thrown) {
      const erro = thrown as { code?: string; hint?: string };
      return { ok: false, code: erro.code, hint: erro.hint };
    }
  }

  test('sem pagamento em uso, travar continua funcionando como antes', async () => {
    const f = await fixture(2);
    await inscrever(f, 'a');
    await inscrever(f, 'b');

    const resultado = await travar(f.ownerId, f.windowId);
    assert.equal(resultado.ok, true, 'a cadeia do sorteio nao pode ter quebrado');
  });

  test('com pagamento em uso, travar recusa enquanto faltar alguém', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    await inscrever(f, 'b');
    await marcar(f.ownerId, f.windowId, a.playerId, true);

    const recusa = await travar(f.ownerId, f.windowId);
    assert.equal(recusa.ok, false);
    assert.equal((recusa as { code?: string }).code, '23514');
    assert.equal((recusa as { hint?: string }).hint, 'REGISTRATION_UNPAID');
  });

  test('com todo mundo pago, travar passa', async () => {
    const f = await fixture(2);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await marcar(f.ownerId, f.windowId, a.playerId, true);
    await marcar(f.ownerId, f.windowId, b.playerId, true);

    const resultado = await travar(f.ownerId, f.windowId);
    assert.equal(resultado.ok, true);
  });

  test('um prazo definido basta para a guarda valer, mesmo sem ninguém pago', async () => {
    const f = await fixture(1);
    await inscrever(f, 'a');
    await asIdentityCommitting(client, f.ownerId, () =>
      client.query('select * from public.set_registration_payment_due($1,$2,$3)', [
        randomUUID(),
        f.windowId,
        new Date(Date.now() + 86400000).toISOString(),
      ]),
    );

    const recusa = await travar(f.ownerId, f.windowId);
    assert.equal(recusa.ok, false);
    assert.equal((recusa as { hint?: string }).hint, 'REGISTRATION_UNPAID');
  });

  test('fechar aplica o corte, e travar decide sobre a lista ja cortada', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    await marcar(f.ownerId, f.windowId, b.playerId, true);
    await venceuOPrazo(f.windowId);

    const resultado = await travar(f.ownerId, f.windowId);

    assert.equal(resultado.ok, true, 'depois do corte so sobra o pago, entao trava');
    assert.equal(await statusDe(f.windowId, a.playerId), 'WAITLISTED');
    assert.equal(await statusDe(f.windowId, b.playerId), 'CONFIRMED');
  });
}
