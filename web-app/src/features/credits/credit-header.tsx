"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { useCredits } from "./credit-provider";

export function CreditHeader() {
  const { balance, loading, error } = useCredits();
  const pathname = usePathname();
  const amount = balance?.availableCredits.toLocaleString();
  const label = loading ? "Credits loading. View credits"
    : error ? "Credits unavailable. View credits"
    : `Credits: ${amount} available. View credits`;
  return (
    <Link href="/credits" className="header-credits" aria-label={label}
      aria-current={pathname === "/credits" ? "page" : undefined}
      title={label}>
      <Icon name="coin" />
      <span aria-hidden="true">{loading ? "…" : amount ?? "—"}</span>
    </Link>
  );
}
