import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

export const API_URL = 'http://127.0.0.1:59321';
let chaves: Record<string, string> | null = null;

export function chaveLocal(nome: 'PUBLISHABLE_KEY' | 'SECRET_KEY'): string {
  const doAmbiente = process.env[`LOCAL_SUPABASE_${nome}`];
  if (doAmbiente) return doAmbiente;
  if (!chaves) {
    const saida = execSync('npx supabase status --workdir e2e/local-stack -o env', {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
    });
    chaves = Object.fromEntries(
      saida
        .split('\n')
        .map((linha) => linha.trim())
        .map((linha) => /^([A-Z0-9_]+)="?(.*?)"?$/.exec(linha))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => [m[1], m[2]]),
    );
  }
  const valor = chaves[nome];
  if (!valor) throw new Error(`pilha local sem ${nome}; ela esta de pe?`);
  return valor;
}

interface Conta {
  nome: string;
  email: string;
  papel: string;
  totpSecret?: string;
}

export const contas = JSON.parse(
  readFileSync(new URL('../fixtures/local-stack.accounts.example.json', import.meta.url), 'utf8'),
) as { senha: string; contas: Conta[] };

export function conta(primeiroNome: string): Conta {
  const achada =
    contas.contas.find((c) => c.nome.split(' ')[0] === primeiroNome) ??
    contas.contas.find((c) => c.nome === primeiroNome);
  if (!achada) throw new Error(`conta ${primeiroNome} nao existe`);
  return achada;
}

export function totp(secret: string, agora = Date.now()): string {
  const alfa = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.toUpperCase()) bits += alfa.indexOf(ch).toString(2).padStart(5, '0');
  const chave = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(agora / 30000)));
  const h = createHmac('sha1', chave).update(contador).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const clientes = new Map<string, SupabaseClient>();

export async function api(primeiroNome: string): Promise<SupabaseClient> {
  const pronto = clientes.get(primeiroNome);
  if (pronto) return pronto;
  const c = conta(primeiroNome);
  const cliente = createClient(API_URL, chaveLocal('PUBLISHABLE_KEY'), {
    auth: { persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({
    email: c.email,
    password: contas.senha,
  });
  if (error) throw new Error(`${primeiroNome}: ${error.message}`);
  if (c.totpSecret) {
    const { data: fatores } = await cliente.auth.mfa.listFactors();
    const fator = fatores?.totp?.[0];
    if (fator) {
      const { error: mfa } = await cliente.auth.mfa.challengeAndVerify({
        factorId: fator.id,
        code: totp(c.totpSecret),
      });
      if (mfa) throw new Error(`${primeiroNome} MFA: ${mfa.message}`);
    }
  }
  clientes.set(primeiroNome, cliente);
  return cliente;
}

export async function rpc<T = unknown>(primeiroNome: string, fn: string, args: object): Promise<T> {
  const cliente = await api(primeiroNome);
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw new Error(`${primeiroNome} ${fn}: ${error.code} ${error.message}`);
  return data as T;
}

export async function entrarPelaTela(page: Page, primeiroNome: string): Promise<void> {
  const c = conta(primeiroNome);
  await page.goto('/entrar');
  await page.getByPlaceholder('exemplo@email.com').fill(c.email);
  await page.getByPlaceholder('••••••••').fill(contas.senha);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'), { timeout: 20_000 });
  for (let etapa = 0; etapa < 6; etapa += 1) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const caminho = new URL(page.url()).pathname;
    if (caminho.startsWith('/confirmar-mfa')) {
      if (!c.totpSecret) throw new Error(`${primeiroNome} pede MFA sem segredo de teste`);
      await page.locator('#challenge-code').click();
      await page.keyboard.type(totp(c.totpSecret));
      await page.getByRole('button', { name: /confirmar/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/confirmar-mfa'));
    } else if (caminho.startsWith('/escolher-username')) {
      await page.locator('input[type="text"]').first().fill(`${primeiroNome.toLowerCase()}-teste`);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/escolher-username'));
    } else if (caminho.startsWith('/completar-ficha')) {
      await page.getByText('Feminino', { exact: true }).click();
      await page.getByText('Ponteiro', { exact: true }).first().click();
      await page.locator('input[type="number"]').fill('170');
      await page.getByText('Destro', { exact: true }).click();
      await page.getByRole('button', { name: /continuar/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/completar-ficha'));
    } else {
      return;
    }
  }
}
