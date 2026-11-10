// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
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
