# Contract: supplier-service (port 3002)

Supplier Service owns suppliers, pickup locations and whether they are selectable for
new errands (D1 FR2). Order stores **snapshots** of the fields it needs, never the
catalogue. Verified against `supplier-service/` on 2026-10-18.

## Endpoints
Base URL `SUPPLIER_SERVICE_URL` (default `http://127.0.0.1:3002`), prefix `/api`. Auth:
local HS256 verification of the user's JWT (`sub`, `sid`, `isAdmin`); no revocation
check.

| Route | Source | Notes |
|---|---|---|
| `GET /api/suppliers` | `supplier-service/src/api/http/suppliers.controller.ts` `SuppliersController` | **active** suppliers with at least one active location; only active locations included. `isActive` itself is not returned. |
| `GET /api/suppliers/campus-locations` | same controller | locations deduplicated by building; not filtered by `isActive` — do not use for availability |
| `/api/admin/suppliers…` | `admin-suppliers.controller.ts` | admin CRUD; DELETE is a **hard delete** of the supplier and all locations |

### Response shape (`GET /api/suppliers`)
```
Supplier { id, name, category, locations: SupplierLocation[] }
category ∈ FOOD | FOOD_COFFEE | PRINTING | SHOPPING   (prisma/schema.prisma enum SupplierCategory)
SupplierLocation {                                    (src/api/http/dto/supplier-location.response.ts)
  id, supplierAtLocation, building, floor, locationDescription,
  latitude, longitude, opensAt "HH:mm", closesAt "HH:mm", isOpenOvernight, imageUrl|null
}
```

## How order uses it
- `src/infrastructure/service-clients.ts` `ServiceClients.pickup(id, token)` fetches the
  whole list and finds the location by id. Not found → 400 `PICKUP_UNAVAILABLE`
  (satisfies FR3.1.1 / FR2.4.1). There is **no** lookup-by-id endpoint.
- Snapshot on the errand: `pickupLocationId`, `pickupSupplierName` (`supplier.name`),
  `pickupLocationLabel` (`location.supplierAtLocation`). Snapshots matter because admin
  hard-delete would otherwise orphan errands.
- Not yet captured: supplier `category` (needed for FR8.2 expiry, C8), `building`
  (useful for filtering, C9).

## Gaps vs D1
- D1 FR2.1.2 / FR4.1.1 expect address line, postal code and unit number; supplier-service
  has building/floor/description/coordinates instead (C9).
- D1 FR8.2.1 categories (food, beverages, parcels, fragiles) do not match
  `SupplierCategory` (C8).
- Opening hours are not checked at errand creation; D1 does not require it.

## Events
None published.
