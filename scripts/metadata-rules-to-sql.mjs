// Converts scripts/metadata-rules.json into the equivalent SQL the bulk
// endpoint would run, for replaying against remote D1 via
// `wrangler d1 execute mossly-content --remote --file <out>`.
import { readFileSync, writeFileSync } from 'node:fs'

const { rules } = JSON.parse(readFileSync(new URL('./metadata-rules.json', import.meta.url), 'utf8'))

const q = (v) => `'${String(v).replaceAll("'", "''")}'`

const statements = rules.map(({ match, set }) => {
  const sets = Object.entries(set)
    .map(([field, value]) => `${field} = ${value === null ? 'NULL' : q(value)}`)
    .join(', ')
  const where = match.value === null ? `${match.field} IS NULL` : `${match.field} = ${q(match.value)}`
  return `UPDATE photos SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${where};`
})

const out = new URL('./metadata-rules.sql', import.meta.url)
writeFileSync(out, statements.join('\n') + '\n')
console.log(`${statements.length} statements written to scripts/metadata-rules.sql`)
