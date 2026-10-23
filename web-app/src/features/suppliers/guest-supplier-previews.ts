import type { Supplier } from "@/services/contracts";

const location = (
  id: string,
  supplierAtLocation: string,
  building: string,
): Supplier["locations"][number] => ({
  id,
  supplierAtLocation,
  building,
  floor: 1,
  locationDescription: "Log in to view pickup details.",
  latitude: null,
  longitude: null,
  opensAt: "00:00",
  closesAt: "00:00",
  isOpenOvernight: false,
  imageUrl: null,
});

export const guestSupplierPreviews: Supplier[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Anna's x Soup Union",
    category: "FOOD",
    locations: [
      location(
        "20000000-0000-4000-8000-000000000001",
        "Anna's x Soup Union@Central Library",
        "Central Library",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "NUS Co-op",
    category: "SHOPPING",
    locations: [
      location(
        "20000000-0000-4000-8000-000000000002",
        "NUS Co-op@Central Library",
        "Central Library",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Printer @ Com 2",
    category: "PRINTING",
    locations: [
      location(
        "20000000-0000-4000-8000-000000000003",
        "Printer @ Com 2@Com 2",
        "Com 2",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Cool Spot",
    category: "FOOD",
    locations: [
      location(
        "20000000-0000-4000-8000-000000000004",
        "Cool Spot@Com2",
        "Com2",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    name: "InstaChef",
    category: "FOOD",
    locations: [
      location(
        "20000000-0000-4000-8000-000000000005",
        "InstaChef@Terrace",
        "Terrace",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    name: "Cafe+ Robot Cafe",
    category: "FOOD_COFFEE",
    locations: [
      location(
        "20000000-0000-4000-8000-000000000006",
        "Cafe+ Robot Cafe@Central Library",
        "Central Library",
      ),
    ],
  },
];
