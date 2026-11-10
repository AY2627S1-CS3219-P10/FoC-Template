/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of page rendering and interaction code (metadata, SuppliersPage).
 * Author review: Validated metadata, SuppliersPage rendered content, props usage in web-app/page.tsx; refined JSX layout and user-facing wording.
 */

import { SupplierCatalog } from "@/features/suppliers/supplier-catalog";
export const metadata = { title: "Campus suppliers" };
export default function SuppliersPage() {
  return <SupplierCatalog />;
}
