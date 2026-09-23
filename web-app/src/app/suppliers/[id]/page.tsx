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
