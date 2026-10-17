import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import 'dotenv/config';

function parse(line) {
  const cells = []; let cell = ''; let quoted = false;
  for (let index = 0; index <= line.length; index += 1) {
    const character = line[index] ?? ',';
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (character === ',' && !quoted) { cells.push(cell); cell = ''; } else cell += character;
  }
  return cells;
}

const csv = await readFile(resolve(import.meta.dirname, '../../data/csv/supplier-seed-data.csv'), 'utf8');
const rows = csv.trim().split(/\r?\n/).slice(1).map(parse);
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  for (let index = 21; index < rows.length; index += 1) {
    const [name, , building, floor, description, latitude, longitude, opens, closes, imageUrl] = rows[index];
    const id = String(index + 1).padStart(3, '0');
    const time = (value) => (value ? `${value.slice(0, 2)}:${value.slice(2, 4)}` : null);
    await client.query(
      `INSERT INTO supplier_locations (id, supplier_id, supplier_at_location, building, floor, location_description, latitude, longitude, opens_at, closes_at, is_open_overnight, image_url, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET supplier_at_location=EXCLUDED.supplier_at_location, building=EXCLUDED.building, floor=EXCLUDED.floor, location_description=EXCLUDED.location_description, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, opens_at=EXCLUDED.opens_at, closes_at=EXCLUDED.closes_at, is_open_overnight=EXCLUDED.is_open_overnight, image_url=EXCLUDED.image_url, updated_at=CURRENT_TIMESTAMP`,
      [`20000000-0000-4000-8000-000000000${id}`, `10000000-0000-4000-8000-000000000${id}`, `${name}@${building}`, building, floor ? Number(floor) : null, description, latitude ? Number(latitude) : null, longitude ? Number(longitude) : null, time(opens), time(closes), closes < opens, imageUrl || null],
    );
  }
  await client.query('COMMIT');
  console.log(`Seeded ${rows.length - 21} CSV pickup locations.`);
} catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
