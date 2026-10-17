import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Client } from 'pg';

export interface OutletSeparation {
  locationId: string;
  name: string;
}

// This maintenance operation changes ownership, not pickup-location identities.
// Require the complete list so unrelated outlets cannot be moved accidentally.
export async function separateSupplierOutlets(
  client: Client,
  supplierId: string,
  outlets: OutletSeparation[],
  apply = false,
): Promise<unknown[]> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(supplierId) || outlets.length < 2) {
    throw new Error('Provide a supplier UUID and at least two outlets.');
  }
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const outlet of outlets) {
    if (
      !uuid.test(outlet.locationId) ||
      !outlet.name.trim() ||
      outlet.name.trim().length > 160
    ) {
      throw new Error(
        'Each outlet needs a UUID and a name of 1–160 characters.',
      );
    }
    if (
      ids.has(outlet.locationId) ||
      names.has(outlet.name.trim().toLowerCase())
    ) {
      throw new Error('Outlet IDs and supplier names must be distinct.');
    }
    ids.add(outlet.locationId);
    names.add(outlet.name.trim().toLowerCase());
  }

  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    const supplier = await client.query<{
      name: string;
      category: string;
      is_active: boolean;
    }>(
      'SELECT name, category, is_active FROM suppliers WHERE id = $1 FOR UPDATE',
      [supplierId],
    );
    const owner = supplier.rows[0];
    if (!owner) throw new Error('Supplier not found.');
    const locations = await client.query<{
      id: string;
      building: string;
      floor: number | null;
    }>(
      'SELECT id, building, floor FROM supplier_locations WHERE supplier_id = $1 ORDER BY id FOR UPDATE',
      [supplierId],
    );
    if (
      locations.rows.length !== outlets.length ||
      locations.rows.some((location) => !ids.has(location.id))
    ) {
      throw new Error(
        'The plan must include every current outlet of this supplier, exactly once.',
      );
    }
    const conflicts = await client.query(
      'SELECT name FROM suppliers WHERE id <> $1 AND name = ANY($2::citext[])',
      [supplierId, outlets.map((outlet) => outlet.name.trim())],
    );
    if (conflicts.rowCount)
      throw new Error('One of the proposed supplier names is already in use.');
    const plan = outlets.map((outlet, index) => ({
      ...outlet,
      name: outlet.name.trim(),
      supplierId: index === 0 ? supplierId : randomUUID(),
      building: locations.rows.find(
        (location) => location.id === outlet.locationId,
      )!.building,
      floor: locations.rows.find(
        (location) => location.id === outlet.locationId,
      )!.floor,
    }));
    if (apply) {
      for (const [index, outlet] of plan.entries()) {
        if (index === 0) {
          await client.query(
            'UPDATE suppliers SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [outlet.name, supplierId],
          );
        } else {
          await client.query(
            'INSERT INTO suppliers (id, name, category, is_active, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
            [outlet.supplierId, outlet.name, owner.category, owner.is_active],
          );
        }
        await client.query(
          'UPDATE supplier_locations SET supplier_id = $1, supplier_at_location = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND supplier_id = $4',
          [
            outlet.supplierId,
            `${outlet.name}@${outlet.building}`,
            outlet.locationId,
            supplierId,
          ],
        );
      }
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  (await import('dotenv')).config({ quiet: true });
  const { values } = parseArgs({
    options: {
      'supplier-id': { type: 'string' },
      outlet: { type: 'string', multiple: true },
      apply: { type: 'boolean', default: false },
    },
  });
  const outlets = (values.outlet ?? []).map((value) => {
    const separator = value.indexOf('=');
    if (separator < 0)
      throw new Error('Use --outlet "location-uuid=New supplier name".');
    return {
      locationId: value.slice(0, separator),
      name: value.slice(separator + 1),
    };
  });
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const plan = await separateSupplierOutlets(
      client,
      values['supplier-id'] ?? '',
      outlets,
      values.apply,
    );
    console.log(
      values.apply
        ? 'Separated suppliers; existing location IDs preserved.'
        : 'Preview only; no changes saved. Add --apply to execute.',
    );
    console.table(plan);
  } finally {
    await client.end();
  }
}
