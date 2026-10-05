import { Client } from 'pg';
import { loadMigrations, splitSqlStatements } from '../../src/test/db/harness';

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:59322/postgres',
});
await client.connect();
const falhas: string[] = [];
for (const migration of loadMigrations()) {
  for (const [indice, comando] of splitSqlStatements(migration.sql).entries()) {
    try {
      await client.query(comando);
    } catch (error) {
      falhas.push(`${migration.name}#${indice}: ${(error as Error).message}`);
    }
  }
}
const inesperadas = falhas.filter((f) => !/already exists|cannot change return type/.test(f));
console.log(
  `aplicado; ${falhas.length} comandos repetidos ignorados, ${inesperadas.length} falhas novas`,
);
for (const f of inesperadas) console.log(' -', f.slice(0, 200));
await client.end();
