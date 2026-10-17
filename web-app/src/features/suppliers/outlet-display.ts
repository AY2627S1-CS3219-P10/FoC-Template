import type { PickupLocation, Supplier } from "@/services/contracts";

export function supplierCards(suppliers: Supplier[]) {
  return suppliers.flatMap((supplier) => {
    const floors = new Map<string, Set<number>>();
    for (const location of supplier.locations) {
      if (location.floor === null) continue;
      const building = location.building.trim().toLowerCase();
      if (!floors.has(building)) floors.set(building, new Set());
      floors.get(building)!.add(location.floor);
    }
    const splitLocations = supplier.locations.filter(
      (location) =>
        location.floor !== null &&
        (floors.get(location.building.trim().toLowerCase())?.size ?? 0) > 1,
    );
    const splitIds = new Set(splitLocations.map((location) => location.id));
    const groupedLocations = supplier.locations.filter(
      (location) => !splitIds.has(location.id),
    );
    return [
      ...(groupedLocations.length
        ? [
            {
              id: supplier.id,
              supplier,
              title: supplier.name,
              locations: groupedLocations,
              href: `/suppliers/${supplier.id}`,
            },
          ]
        : []),
      ...splitLocations.map((location) => ({
        id: location.id,
        supplier,
        title: outletTitle(supplier.name, location),
        locations: [location],
        href: `/suppliers/${supplier.id}#outlet-${location.id}`,
      })),
    ];
  });
}

export function outletTitle(name: string, location: PickupLocation): string {
  if (location.floor === null) return `${name} — ${location.building}`;
  // Preserve names that an administrator has already qualified with the floor.
  if (new RegExp(`(?:Level|Floor)\\s*${location.floor}$`, "i").test(name)) {
    return name;
  }
  return `${name} — Level ${location.floor}`;
}

export function outletAddress(location: PickupLocation): string {
  return `${location.building} · ${location.floor === null ? "Floor not specified" : `Floor ${location.floor}`}`;
}
