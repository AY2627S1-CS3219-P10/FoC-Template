import { ErrandDetail } from "@/features/errands/errand-detail";
export const metadata = { title: "Errand details" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <ErrandDetail id={(await params).id} />; }
