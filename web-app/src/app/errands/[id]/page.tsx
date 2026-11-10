/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of page rendering and interaction code (metadata, Page).
 * Author review: Validated metadata, Page rendered content, props usage in web-app/page.tsx; refined JSX layout and user-facing wording (web-app/src/app/errands/[id]/page.tsx).
 */

import { ErrandDetail } from "@/features/errands/errand-detail";
export const metadata = { title: "Errand details" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <ErrandDetail id={(await params).id} />; }
