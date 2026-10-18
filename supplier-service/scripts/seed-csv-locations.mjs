import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

// Parse quoted commas, escaped quotes, CRLF and quoted multiline descriptions.
function parseCsv(text) {
  const records = []; let record = []; let cell = ''; let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index <= source.length; index += 1) {
    const character = source[index] ?? '\n';
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { record.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      record.push(cell); if (record.some(value => value !== '')) records.push(record);
      record = []; cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  return records;
}
const columns = ['Name', 'Type', 'Building', 'Floor', 'Location Description', 'Latitude', 'Longitude', 'StartingTime', 'ClosingTime', 'ImageURL'];
const categories = { Food: 'FOOD', 'Food/Coffee': 'FOOD_COFFEE', Shopping: 'SHOPPING', Printing: 'PRINTING' };
function number(value, label, row, minimum, maximum, integer = false) {
  if (!value) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum || (integer && !Number.isInteger(result))) throw new Error(`CSV row ${row}: invalid ${label}.`);
  return result;
}
function time(value, row) {
  const match = /^([01]\d|2[0-3])([0-5]\d)hrs$/.exec(value);
  if (!match) throw new Error(`CSV row ${row}: invalid opening/closing time.`);
  return `${match[1]}:${match[2]}`;
}
const records = parseCsv(await readFile(resolve(import.meta.dirname, '../../data/csv/supplier-seed-data.csv'), 'utf8'));
if (JSON.stringify(records.shift()) !== JSON.stringify(columns)) throw new Error('Unexpected CSV columns.');
const rows = records.map((cells, index) => {
  const row = index + 2;
  if (cells.length !== columns.length) throw new Error(`CSV row ${row}: incorrect column count.`);
  const [name, type, building, floor, description, latitude, longitude, opens, closes, imageUrl] = cells;
  if (!name.trim() || !building.trim() || !description.trim() || !categories[type]) throw new Error(`CSV row ${row}: missing name/building/description or unknown category.`);
  return { name, category: categories[type], building, floor: number(floor, 'floor', row, -100, 1000, true), description, latitude: number(latitude, 'latitude', row, -90, 90), longitude: number(longitude, 'longitude', row, -180, 180), opens: time(opens, row), closes: time(closes, row), imageUrl: imageUrl || null };
});
if (process.argv.includes('--check')) { console.log(`Validated all ${rows.length} CSV supplier/location rows.`); process.exit(0); }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let created = 0, updated = 0;
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('supplier-csv-seed'))");
  for (const row of rows) {
    const supplier = await client.query(`INSERT INTO suppliers (id,name,category,updated_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET category=EXCLUDED.category,updated_at=CURRENT_TIMESTAMP RETURNING id`, [randomUUID(), row.name, row.category]);
    const supplierId = supplier.rows[0].id;
    const existing = await client.query(`SELECT id FROM supplier_locations WHERE supplier_id=$1 AND building=$2 AND floor IS NOT DISTINCT FROM $3::integer AND location_description=$4 FOR UPDATE`, [supplierId, row.building, row.floor, row.description]);
    if (existing.rows.length > 1) throw new Error('Duplicate existing pickup points require review before seeding.');
    const values = [existing.rows[0]?.id ?? randomUUID(), supplierId, `${row.name}@${row.building}`, row.building, row.floor, row.description, row.latitude, row.longitude, row.opens, row.closes, row.closes < row.opens, row.imageUrl];
    if (existing.rows.length) {
      await client.query(`UPDATE supplier_locations SET supplier_at_location=$3,building=$4,floor=$5,location_description=$6,latitude=$7,longitude=$8,opens_at=$9,closes_at=$10,is_open_overnight=$11,image_url=$12,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND supplier_id=$2`, values);
      updated += 1;
    } else {
      await client.query(`INSERT INTO supplier_locations (id,supplier_id,supplier_at_location,building,floor,location_description,latitude,longitude,opens_at,closes_at,is_open_overnight,image_url,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP)`, values);
      created += 1;
    }
  }
  await client.query('COMMIT');
  console.log(`Seeded all ${rows.length} CSV rows: ${created} pickup locations created, ${updated} updated. Existing IDs, availability settings and custom suppliers preserved.`);
} catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
