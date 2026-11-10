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
