export interface SupplierMatch {
  supplierId: string;
  supplierName: string;
  locationId: string;
  building: string;
  floor: number | null;
  locationDescription: string;
}

// Only forward the public fields needed to compare outlets, never raw error objects.
export function supplierMatches(value: unknown): SupplierMatch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.supplierId !== "string" ||
      typeof entry.supplierName !== "string" ||
      typeof entry.locationId !== "string" ||
      typeof entry.building !== "string" ||
      !(
        entry.floor === null ||
        (typeof entry.floor === "number" && Number.isInteger(entry.floor))
      ) ||
      typeof entry.locationDescription !== "string"
    )
      return [];
    return [
      {
        supplierId: entry.supplierId,
        supplierName: entry.supplierName,
        locationId: entry.locationId,
        building: entry.building,
        floor: entry.floor,
        locationDescription: entry.locationDescription,
      },
    ];
  });
}
