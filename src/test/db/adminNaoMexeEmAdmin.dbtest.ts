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
 * Admin nao mexe em admin (decisao de 2026-09-25, docs/PERMISSOES.md).
 *
 * O cargo de admin so e dado, tirado ou tocado pelo dono. Um admin continua gerindo quem
 * esta abaixo dele, mas nao rebaixa, nao remove, nao promove ninguem a admin e nao liga
 * nem desliga a organizacao de outro admin. Sem isso, dois admins podiam se tirar um ao
 * outro, e um admin podia criar outro que ele mesmo nao conseguiria desfazer.
 */

if (!isTestDatabaseConfigured()) {
  test(`admin nao mexe em admin requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function usuario(rotulo: string): Promise<string> {
    const email = `admin-${rotulo}-${randomUUID()}@test.local`;
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

  async function como(actor: string, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, async () => {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal2' }),
      ]);
      return client.query(sql, args);
    });
  }

  async function recusa(actor: string, sql: string, args: unknown[] = []) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string }) => {
      assert.equal(erro.code, '42501');
      return true;
    });
  }

  async function cena() {
    const dono = await usuario('dono');
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [`Admins ${randomUUID()}`, dono],
    );
    const comunidade = rows[0].id;

    const entra = async (rotulo: string, role: string) => {
      const id = await usuario(rotulo);
      await client.query(
        `insert into public.community_members (community_id, user_id, role, status)
         values ($1, $2, $3, 'active')`,
        [comunidade, id, role],
      );
      return id;
    };

    return {
      comunidade,
      dono,
      adminA: await entra('admin-a', 'admin'),
      adminB: await entra('admin-b', 'admin'),
      membro: await entra('membro', 'member'),
    };
  }

  async function linha(comunidade: string, userId: string) {
    const { rows } = await client.query<{ id: string; role: string }>(
      'select id, role from public.community_members where community_id = $1 and user_id = $2',
      [comunidade, userId],
    );
    return rows[0] ?? null;
  }

  const mudaCargo = 'select public.set_community_member_role($1, $2)';
  const remove = 'select public.remove_community_member($1)';
  const organiza = 'select public.set_community_organizer($1, $2, $3)';

  test('admin nao muda o cargo de outro admin', async () => {
    const c = await cena();
    const alvo = await linha(c.comunidade, c.adminB);

    await recusa(c.adminA, mudaCargo, [alvo.id, 'member']);
    assert.equal((await linha(c.comunidade, c.adminB)).role, 'admin');
  });

  test('admin nao remove outro admin', async () => {
    const c = await cena();
    const alvo = await linha(c.comunidade, c.adminB);

    await recusa(c.adminA, remove, [alvo.id]);
    assert.notEqual(await linha(c.comunidade, c.adminB), null);
  });

  test('admin nao promove ninguem a admin', async () => {
    const c = await cena();
    const alvo = await linha(c.comunidade, c.membro);

    await recusa(c.adminA, mudaCargo, [alvo.id, 'admin']);
    assert.equal((await linha(c.comunidade, c.membro)).role, 'member');
  });

  test('admin nao liga nem desliga a organizacao de outro admin', async () => {
    const c = await cena();

    await recusa(c.adminA, organiza, [c.comunidade, c.adminB, true]);
    await como(c.dono, organiza, [c.comunidade, c.adminB, true]);
    await recusa(c.adminA, organiza, [c.comunidade, c.adminB, false]);
  });

  test('o dono continua podendo tudo isso', async () => {
    const c = await cena();

    await como(c.dono, organiza, [c.comunidade, c.adminB, true]);
    await como(c.dono, organiza, [c.comunidade, c.adminB, false]);
    await como(c.dono, mudaCargo, [(await linha(c.comunidade, c.membro)).id, 'admin']);
    assert.equal((await linha(c.comunidade, c.membro)).role, 'admin');
    await como(c.dono, mudaCargo, [(await linha(c.comunidade, c.adminB)).id, 'member']);
    assert.equal((await linha(c.comunidade, c.adminB)).role, 'member');
    await como(c.dono, remove, [(await linha(c.comunidade, c.adminA)).id]);
    assert.equal(await linha(c.comunidade, c.adminA), null);
  });

  test('admin continua gerindo quem esta abaixo dele', async () => {
    const c = await cena();

    await como(c.adminA, organiza, [c.comunidade, c.membro, true]);
    await como(c.adminA, mudaCargo, [(await linha(c.comunidade, c.membro)).id, 'moderator']);
    assert.equal((await linha(c.comunidade, c.membro)).role, 'moderator');
    await como(c.adminA, remove, [(await linha(c.comunidade, c.membro)).id]);
    assert.equal(await linha(c.comunidade, c.membro), null);
  });
}
