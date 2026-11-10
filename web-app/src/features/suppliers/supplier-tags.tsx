/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of supplier-tag rendering.
 * Author review: Checked SupplierTags tag labels, rendering conditions, and props usage; refined JSX formatting and displayed text.
 */

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
