"use client";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { CreateErrand } from "./create-errand";
export function CreateErrandPage() {
  const auth = useAuth();
  return (
    <section>
      <Link href="/errands">← Browse errands</Link>
      {auth.loading ? (
        <p role="status">Checking your session…</p>
      ) : auth.error ? (
        <>
          <p role="alert">{auth.error}</p>
          <button
            className="button button-dark"
            onClick={() => void auth.reload()}
          >
            Try again
          </button>
        </>
      ) : !auth.user ? (
        <div className="empty-state">
          <h1>Log in to create an errand</h1>
          <p>Log in to create a campus errand.</p>
          <Link className="button button-dark" href="/login">
            Log in
          </Link>
        </div>
      ) : (
        <CreateErrand key={auth.user.id} onCreated={() => {}} />
      )}
    </section>
  );
}
