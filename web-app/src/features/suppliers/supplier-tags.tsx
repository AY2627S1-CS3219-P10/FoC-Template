// AI-assisted portions: supplier categories (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
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
