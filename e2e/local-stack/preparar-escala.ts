import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { API_URL, api, chaveLocal, contas, rpc } from './atores';

const admin = createClient(API_URL, chaveLocal('SECRET_KEY'), { auth: { persistSession: false } });

const POSICOES = [
  ...Array(12).fill('levantador'),
  ...Array(12).fill('central'),
  ...Array(24).fill('ponteiro'),
  ...Array(12).fill('oposto'),
  ...Array(10).fill('libero'),
];

async function main() {
  const novos: string[] = [];
  for (let n = 13; n <= 70; n += 1) {
    const nome = `Atleta ${String(n).padStart(2, '0')}`;
    const email = `atleta${n}@volley.test`;
    if (!contas.contas.some((c) => c.email === email)) {
      const { error } = await admin.auth.admin.createUser({
        email,
        password: contas.senha,
        email_confirm: true,
        user_metadata: { name: nome },
      });
      if (error && !/already/i.test(error.message)) throw error;
      contas.contas.push({ nome, email, papel: 'membro' });
      novos.push(nome);
    }
  }
  writeFileSync(
    new URL('../fixtures/local-stack.accounts.example.json', import.meta.url),
    JSON.stringify(contas, null, 2) + '\n',
  );
  console.log('contas novas', novos.length);

  const org = await api('Organizador');
  const { data: comunidade } = await org
    .from('communities')
    .select('id')
    .eq('name', 'Pelada Local')
    .single();
  const codigo = await rpc<string>('Organizador', 'generate_join_code', {
    target_community_id: comunidade!.id,
  });
  for (const nome of novos) {
    await rpc(nome, 'request_to_join_community', { p_code: codigo });
  }
  const { data: pendentes } = await org
    .from('community_members')
    .select('id')
    .eq('community_id', comunidade!.id)
    .eq('status', 'pending');
  for (const p of pendentes ?? []) {
    await rpc('Organizador', 'approve_join_request', { p_member_id: p.id });
  }
  console.log('aprovados', (pendentes ?? []).length);

  const { data: membros } = await admin
    .from('community_members')
    .select('user_id')
    .eq('community_id', comunidade!.id)
    .eq('status', 'active');
  const ids = (membros ?? []).map((m) => m.user_id);
  const { data: atletas } = await admin
    .from('players')
    .select('id, user_id')
    .in('user_id', ids)
    .order('created_at');
  let i = 0;
  for (const atleta of atletas ?? []) {
    const nivel = 3 + (i % 6);
    const atributos = Object.fromEntries(
      ['saque', 'recepcao', 'levantamento', 'ataque', 'bloqueio', 'defesa'].map((k, j) => [
        k,
        Math.min(10, nivel + ((i + j) % 3)),
      ]),
    );
    await admin
      .from('players')
      .update({
        gender: i % 3 === 0 ? 'F' : 'M',
        primary_position: POSICOES[i % POSICOES.length],
        height: 165 + (i % 25),
        dominant_hand: 'right',
        attributes: atributos,
      })
      .eq('id', atleta.id);
    i += 1;
  }
  console.log('fichas', i);
}

await main();
