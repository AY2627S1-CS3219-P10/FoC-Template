import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="eyebrow">A LITTLE DETOUR</p>
      <h1>We couldn’t find that page.</h1>
      <p>Head back to explore campus suppliers.</p>
      <Link href="/suppliers" className="button button-dark">
        Browse suppliers
      </Link>
    </div>
  );
}
