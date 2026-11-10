import { categoryLabels, type Supplier } from "@/services/contracts";
import { supplierCategories } from "@/services/supplier-categories";

export function SupplierTags({ supplier }: { supplier: Supplier }) {
  return (
    <span className="supplier-tags">
      {supplierCategories(supplier).map((category) => (
        <span className="category-label" key={category}>
          {categoryLabels[category]}
        </span>
      ))}
    </span>
  );
}
