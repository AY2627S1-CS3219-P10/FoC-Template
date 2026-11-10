/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of guest supplier previews code (guestSupplierPreviews).
 * Author review: Validated guestSupplierPreviews existing type members and constant values in web-app/guest-supplier-previews.ts; edited naming and formatting for readability.
 */

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
    categories: ["FOOD"],
    locations: [
      location(
        "20000000-0000-4000-8000-000000000001",
        "Anna's x Soup Union",
        "Central Library",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "NUS Co-op",
    category: "SHOPPING",
    categories: ["SHOPPING"],
    locations: [
      location(
        "20000000-0000-4000-8000-000000000002",
        "NUS Co-op",
        "Central Library",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Printer @ Com 2",
    category: "PRINTING",
    categories: ["PRINTING"],
    locations: [
      location(
        "20000000-0000-4000-8000-000000000003",
        "Printer @ Com 2",
        "Com 2",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Cool Spot",
    category: "FOOD_COFFEE",
    categories: ["FOOD", "BEVERAGES"],
    locations: [
      location(
        "20000000-0000-4000-8000-000000000004",
        "Com 2",
        "Cool Spot",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    name: "InstaChef",
    category: "FOOD",
    categories: ["FOOD"],
    locations: [
      location(
        "20000000-0000-4000-8000-000000000005",
        "InstaChef",
        "Terrace",
      ),
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    name: "Cafe+ Robot Cafe",
    category: "FOOD_COFFEE",
    categories: ["BEVERAGES"],
    locations: [
      location(
        "20000000-0000-4000-8000-000000000006",
        "Cafe+ Robot Cafe",
        "Central Library",
      ),
    ],
  },
];
