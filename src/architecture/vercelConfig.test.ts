import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const nginxConf = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');
const vercelPath = new URL('../../vercel.json', import.meta.url);

type VercelHeader = { key: string; value: string };
type VercelConfig = {
  rewrites?: { source: string; destination: string }[];
  headers?: { source: string; headers: VercelHeader[] }[];
};

function readVercelConfig(): VercelConfig {
  assert.ok(existsSync(vercelPath), 'vercel.json is missing');
  return JSON.parse(readFileSync(vercelPath, 'utf8'));
}

function nginxCsp(): string {
  const match = nginxConf.match(/set \$volley_csp "([^"]+)";/);
  assert.ok(match, 'nginx.conf lost its $volley_csp');
  return match[1];
}

function nginxHeader(name: string): string {
  const match = nginxConf.match(new RegExp(`add_header ${name} "([^"]+)";`));
  assert.ok(match, `nginx.conf lost ${name}`);
  return match[1];
}

function headersFor(config: VercelConfig, source: string): Record<string, string> {
  const rule = config.headers?.find((item) => item.source === source);
  assert.ok(rule, `vercel.json has no headers rule for ${source}`);
  return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
}

test('vercel.json serves index.html for app routes, like the nginx try_files fallback', () => {
  assert.deepEqual(readVercelConfig().rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});

test('vercel.json sends the same CSP and security headers as nginx.conf on every path', () => {
  const headers = headersFor(readVercelConfig(), '/(.*)');

  assert.equal(headers['Content-Security-Policy'], nginxCsp());
  for (const name of ['X-Frame-Options', 'X-XSS-Protection', 'X-Content-Type-Options']) {
    assert.equal(headers[name], nginxHeader(name), name);
  }
});

test('vercel.json caches hashed build assets as immutable', () => {
  const headers = headersFor(readVercelConfig(), '/assets/(.*)');

  assert.equal(headers['Cache-Control'], 'public, max-age=31536000, immutable');
});
