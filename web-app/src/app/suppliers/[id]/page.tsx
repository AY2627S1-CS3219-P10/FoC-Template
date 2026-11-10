/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of page rendering and interaction code (metadata, SupplierPage).
 * Author review: Validated metadata, SupplierPage rendered content, props usage in web-app/page.tsx; refined JSX layout and user-facing wording.
 */

import { SupplierCatalog } from "@/features/suppliers/supplier-catalog";
export const metadata = { title: "Supplier pickup locations" };
export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierCatalog supplierId={id} />;
}
