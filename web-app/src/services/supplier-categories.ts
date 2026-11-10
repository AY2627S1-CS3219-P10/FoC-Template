/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of client-side supplier category conversion helpers.
 * Author review: Validated supplierCategories, supplierCategoryText input values and returned results in supplier-categories.ts; edited naming and formatting for readability.
 */

import {
  categoryLabels,
  type Supplier,
  type SupplierCategory,
} from "./contracts";

export function supplierCategories(supplier: Supplier): SupplierCategory[] {
  return (
    supplier.categories ??
    (supplier.category === "FOOD_COFFEE"
      ? ["FOOD", "BEVERAGES"]
      : [supplier.category])
  );
}

export function supplierCategoryText(supplier: Supplier): string {
  return supplierCategories(supplier)
    .map((category) => categoryLabels[category])
    .join(" · ");
}
