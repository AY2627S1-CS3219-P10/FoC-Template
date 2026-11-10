<!-- AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md. -->
# Supplier Service

Owns suppliers, campus pickup locations, categories, and availability state.
The seed CSV under `data/` is represented by the service-owned database
migration; image paths remain catalog metadata.

## Multiple category tags

Supplier responses now include `categories`, a nonempty array containing any of
`FOOD`, `BEVERAGES`, `PRINTING`, and `SHOPPING`. A cafe selling food and drinks has
`["FOOD", "BEVERAGES"]` and should match either filter. Drinks-only suppliers may
have `["BEVERAGES"]`. The browse API accepts an optional single tag:

```http
GET /api/suppliers?category=FOOD
GET /api/suppliers?category=BEVERAGES
```

A supplier with both tags appears in either result. Omitting `category` lists all
active suppliers with active pickup locations. Invalid, empty, repeated, or legacy
combined filter values return 400. The frontend still needs separate buttons and
must either forward the filter or check membership in the response array.

Admin POST/PATCH requests accept `categories` instead of `category`. PATCH replaces
the complete set of tags; omitting classification leaves it unchanged. Duplicate,
empty, null, or unknown tags return 400. Supplying both fields returns 400. Example:

```json
{ "categories": ["FOOD", "BEVERAGES"] }
```

The single `category` field remains available for existing clients and legacy
admin writes. `FOOD_COFFEE` maps to both tags; other legacy values map to one tag.
Responses project tags back to a legacy category with priority BEVERAGES
(`FOOD_COFFEE`), FOOD, PRINTING, then SHOPPING. A legacy classification write
replaces all tags, so new clients should send only `categories`. The new tags never
include `FOOD_COFFEE`.

Possible-duplicate checks match any overlapping tag in the same building/floor.
Adding another outlet to an existing supplier requires the same complete tag set,
regardless of input order. Category changes and location moves retain the existing
serializable transaction/retry protections.

Apply `20261108000100_supplier_category_tags` before deploying this code:

```sh
pnpm prisma:validate
pnpm db:migrate:deploy
pnpm prisma:generate
```

The migration maps existing `FOOD_COFFEE` records to both tags and preserves every
supplier/outlet UUID. FOOD, PRINTING, and SHOPPING retain their original tags;
broader reclassification needs a catalog review rather than guesses about menus.
The follow-up `20261109000100_correct_cafe_categories` migration explicitly keeps
Starbucks, Poonsti Cafe, The Coffee Bean and Tea Leaf, and TOMORO COFFEE under both
Food and Beverages, and places Wonderful Cafe (CDE and S16) under Food only.
The seed CSV uses the same classifications for future imports.
The next migration, `20261109000200_refine_food_beverage_categories`, puts Cool
Spot, Mr Bean / Do Qoo, Nine Fresh, Fine Food, Flavours @ UTown and Central Square
@ YIH under both tags, and Mixue, CHAGEE and Cafe+ Robot Cafe under Beverages only.
CSV Type accepts `Beverages` and `Food/Beverages` as well as legacy `Food/Coffee`.
Migration `20261109000300_add_techno_edge` ensures he by He Brews has both tags and
adds Techno Edge with both tags and a pickup location at CDE. Techno Edge's weekday
hours and weekend exceptions come from the [NUS dining directory](https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/kent-ridge/).
Unverified floor and coordinates remain null; existing Techno Edge outlets, if any,
are preserved. The CSV contains the same entry for fresh imports.
CSV reimports derive tags from the CSV Type and replace matching suppliers' tags;
outlet separation copies the original tag set. No live database is migrated just
by checking out the code. For an application rollback, leave the column and data
intact and stop legacy writers that do not populate categories; restore the previous
database schema only via a reviewed forward migration after backing up tag data.

The PostgreSQL integration suite needs a disposable, empty database. It applies
all migrations and deletes fixtures; never point it at the local app database:

```sh
SUPPLIER_OUTLET_TEST_URL=postgresql://localhost/disposable_supplier_tests pnpm test --runTestsByPath tests/integration/outlet-identity.spec.ts
```

## Current scope

The database foundation is initialized with PostgreSQL 18, Prisma ORM 7, and
service-owned migrations. They create suppliers and pickup locations, then load
all 75 suppliers and their CSV pickup-location records from
`../data/csv/supplier-seed-data.csv`. A location may have an unknown floor or
coordinates when the source does not publish them; the browse API explicitly
returns those values as `null` rather than fabricating details.

Each location stores a stable UUID for service-to-service references and the
supplier name as its display label. Building and floor remain separate fields,
so clients can render labels such as `NUS Co-op · Central Library · Floor 1`
without repeating the building. The label is a catalog attribute, not an
order-service foreign key or a user-entered free-text source of truth.

The read API is implemented as `GET /api/suppliers`. It returns active suppliers
that have at least one active pickup location, with inactive records filtered by
the repository. Both students and administrators may use this operation.

Administrators may create a new supplier and its first pickup location with
`POST /api/admin/suppliers`. The supplier and location are created atomically;
the request identifies a location from `GET /api/suppliers/campus-locations`,
and the service resolves its building and coordinates. Admins therefore do not
enter latitude or longitude. The service also derives the supplier display
label and overnight-hours flag. A case-insensitive existing supplier name adds
an outlet to that supplier instead of creating a second supplier. Its complete tag set
must match. Overlapping tags, building and floor returns HTTP 409 with
`POSSIBLE_SUPPLIER_DUPLICATE` and public match details, including names and
location descriptions. The admin can use an existing outlet, edit it, or
explicitly confirm a different physical pickup point. Setting
`confirmDistinctOutlet: true` permits creation only with a distinguishing
description; matching descriptions (case/whitespace insensitive) remain blocked.
The same supplier can have multiple pickup points on the same floor. A unique
constraint on supplier, case-insensitive building, floor and description
also protects exact duplicates; unknown floors compare equal.
Display labels are no longer unique; outlet UUIDs remain the identifiers.
Creation runs in a
serializable transaction with bounded retries for concurrent writes.

The repository rechecks matches inside serializable transactions for creates,
location changes and category changes, with retries for concurrent writes.
Edits can use the same confirmation field after reviewing matches. Confirmation
is cleared in the client whenever form details change. No name-similarity
threshold is used. Existing entries and errand location IDs are preserved.

Administrators may update a supplier's name and/or category tags with
`PATCH /api/admin/suppliers/:supplierId`. Renaming a supplier also updates every
associated supplier display label in the same atomic database operation. An
empty update returns HTTP 400, an unknown supplier returns HTTP 404, and a name
conflict returns HTTP 409.

Administrators may permanently delete a supplier with
`DELETE /api/admin/suppliers/:supplierId`. Its pickup locations are deleted
first and then the supplier is deleted in the same database transaction. The
operation returns HTTP 204; a subsequent request for the same supplier returns
HTTP 404. Deleting the record releases its unique name, so an administrator can
create a replacement supplier with the same name.

Administrators may replace any subset of a pickup location's details with
`PATCH /api/admin/suppliers/:supplierId/locations/:locationId`. The existing
location row and UUID are retained for historical errand references, while the
old field values are overwritten. The supplier display label remains aligned
with its owner, and changing either business-hours field
recalculates the overnight-hours flag. Reactivation is not implemented;
additional outlets are added through the create endpoint using the existing
supplier name.

Example request:

```json
{
  "name": "Starbucks",
  "categories": ["FOOD", "BEVERAGES"],
  "location": {
    "campusLocationId": "20000000-0000-4000-8000-000000000008",
    "floor": 1,
    "locationDescription": "Near the main entrance",
    "opensAt": "08:00",
    "closesAt": "20:00",
    "imageUrl": "https://example.com/starbucks-utown.jpg"
  }
}
```

Example update request:

```json
{
  "name": "Starbucks Coffee",
  "categories": ["FOOD", "BEVERAGES"]
}
```

Example location move request:

```json
{
  "campusLocationId": "20000000-0000-4000-8000-000000000019",
  "floor": 2,
  "locationDescription": "Beside the main entrance"
}
```

## Authentication and RBAC contract

Supplier Service verifies short-lived JWT access tokens issued by User Service.
The client must send the token as `Authorization: Bearer <token>`. Verification
is restricted to HS256 and checks the configured issuer, audience, signature,
and expiry. The token payload must include:

```json
{
  "sub": "4a84f480-b1cb-4b81-b632-8bb49034b9e7",
  "sid": "e414b596-4ba2-4c43-841b-0fa699164faa",
  "isAdmin": false
}
```

Supplier Service converts `isAdmin` into its own `STUDENT` or `ADMIN` role and
enforces route permissions locally. The read endpoint permits both roles, while
supplier creation, supplier or location updates, and deletion require `ADMIN`.

The User Service and Supplier Service must receive the same
`JWT_ACCESS_TOKEN_SECRET` value and use the `foc-user-service` issuer. Supplier
Service verifies the User Service contract's `foc-api` audience. The secret is
deployment configuration and must never be committed.

## Local database commands

### Separate independently operated shops

Independent businesses should have distinct supplier names and records. A
shared brand can continue to have multiple outlets. If independent shops were
previously grouped under one supplier, preview their separation with:

```sh
node scripts/separate-supplier-outlets.ts --supplier-id SUPPLIER_UUID \
  --outlet 'LOCATION_UUID_4=CLB Printing — Level 4' \
  --outlet 'LOCATION_UUID_5=CLB Printing — Level 5'
```

Replace the placeholders with the existing UUIDs. The plan must list every
outlet of that supplier exactly once. Add `--apply` to commit the separation
atomically. This preserves all outlet UUIDs, hours, floor details and historical
errand references. Existing errand name snapshots are not rewritten. New
supplier records automatically appear as separate cards in both catalogs.

### Start the local database

Run these commands from `supplier-service/`:

```text
corepack pnpm install
docker compose up -d database
corepack pnpm db:migrate:deploy
corepack pnpm start:dev
```

Copy `.env.example` to `.env` before running Prisma commands. PostgreSQL is
exposed on port `5434` by default, avoiding the user service's `5433` port.
The OpenAPI UI is available at `/api/docs` when the service is running.
Operational probes are available at `GET /api/health/live` (process liveness)
and `GET /api/health/ready` (database readiness).

## Intended internal layout

- `src/api/`: inbound transport adapters
- `src/application/`: supplier and pickup-location use cases
- `src/domain/`: supplier, location, and availability rules
- `src/infrastructure/`: repositories and external providers
- `migrations/`: supplier-service-owned database changes
- `tests/unit/` and `tests/integration/`: isolated verification

The order service may store supplier and pickup-location identifiers needed for
an errand, but this service remains the authority for their availability.

## Reimport the complete CSV

CSV imports and administrator inputs trim leading/trailing whitespace and collapse
repeated whitespace in supplier names, buildings and pickup descriptions before
matching and saving. Thus `A  Hot Hideout ` matches `A Hot Hideout` when the stored
record uses the normalized spelling. Genuine name differences are not merged.
The importer also trims surrounding whitespace from other CSV cells.

This change does not merge, delete or reassign existing records. Previously stored
whitespace variants may still appear separately and need a reviewed cleanup that
preserves pickup IDs referenced by errands. Existing records with non-normalized
names/buildings/descriptions are not automatically reconciled.

The default CSV is unchanged; to validate or import another file explicitly, use
`node scripts/seed-csv-locations.mjs --file /path/to/suppliers.csv --check` or omit
`--check` to import it into the configured database.

From the Supplier Service directory:

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
node scripts/seed-csv-locations.mjs --check
pnpm db:seed:csv
```

The import validates every row of data/csv/supplier-seed-data.csv before opening a transaction, upserts suppliers by name, and reuses pickup IDs by supplier/building/floor/description (including unknown floors). Missing floors/coordinates stay null. Repeat imports create no duplicate pickup points; custom records and existing availability settings are preserved. CSV metadata is authoritative for matching records. Back up the database before intentionally replacing catalog metadata.
