"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, authenticatedRequest } from "@/services/api";
import { categoryLabels, type Supplier } from "@/services/contracts";

export function SupplierCatalog({ supplierId }: { supplierId?: string }) {
  const auth = useAuth();
  const { reload } = auth;
  const userId = auth.user?.id;
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    authenticatedRequest<Supplier[]>("suppliers")
      .then((data) => {
        if (active) {
          setSuppliers(data);
          setBusy(false);
          setError("");
        }
      })
      .catch((failure) => {
        if (active) {
          setBusy(false);
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load suppliers.",
          );
          if (failure instanceof ApiError && failure.status === 401)
            void reload();
        }
      });
    return () => {
      active = false;
    };
  }, [userId, attempt, reload]);

  function retry() {
    setBusy(true);
    setError("");
    setAttempt((value) => value + 1);
  }
  if (auth.loading)
    return (
      <div className="empty-state" role="status">
        Checking your session…
      </div>
    );
  if (auth.error)
    return (
      <div className="empty-state">
        <h1>Unable to check your session</h1>
        <p role="alert">{auth.error}</p>
        <button
          className="button button-dark"
          onClick={() => void auth.reload()}
        >
          Try again
        </button>
      </div>
    );
  if (!auth.user)
    return (
      <div className="empty-state">
        <p className="eyebrow">YOUR CAMPUS FAVOURITES</p>
        <h1>Log in to explore suppliers.</h1>
        <p>
          Find campus shops, food spots, and their available pickup locations.
        </p>
        <Link className="button button-dark" href="/login">
          Log in
        </Link>
        <p>
          New here?{" "}
          <Link className="text-link" href="/register">
            Create an account
          </Link>
        </p>
      </div>
    );
  if (busy)
    return (
      <div className="empty-state" role="status">
        Loading campus suppliers…
      </div>
    );
  if (error)
    return (
      <div className="empty-state">
        <h1>Suppliers are unavailable</h1>
        <p role="alert">{error}</p>
        <button className="button button-dark" onClick={retry}>
          Try again
        </button>
      </div>
    );
  if (supplierId) {
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!supplier)
      return (
        <div className="empty-state">
          <h1>Supplier unavailable</h1>
          <p>This supplier is no longer in the active catalog.</p>
          <Link className="button button-dark" href="/suppliers">
            Back to suppliers
          </Link>
        </div>
      );
    return (
      <section className="detail-page">
        <Link className="text-link back-link" href="/suppliers">
          ← Back to suppliers
        </Link>
        <p className="eyebrow">{categoryLabels[supplier.category]}</p>
        <h1>{supplier.name}</h1>
        <p className="page-description">
          Available pickup locations · All hours in Singapore time.
        </p>
        <div className="location-grid">
          {supplier.locations.map((location) => (
            <article className="detail-card" key={location.id}>
              <h2>{location.building}</h2>
              <p className="location-label">{location.supplierAtLocation}</p>
              <div className="route">
                <Icon name="pin" />
                <p>
                  Floor {location.floor} · {location.locationDescription}
                </p>
              </div>
              <p className="location-hours">
                <Icon name="clock" />
                {location.opensAt}–{location.closesAt}
                {location.isOpenOvernight ? " (next day)" : ""}
              </p>
              <a
                className="text-link"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View pickup location on map <Icon name="arrow" />
              </a>
            </article>
          ))}
        </div>
      </section>
    );
  }
  const search = query.trim().toLowerCase();
  const filtered = suppliers.filter(
    (supplier) =>
      (category === "ALL" || supplier.category === category) &&
      `${supplier.name} ${supplier.locations.map((location) => `${location.building} ${location.supplierAtLocation}`).join(" ")}`
        .toLowerCase()
        .includes(search),
  );
  return (
    <section className="browse-page">
      <p className="eyebrow">AROUND THE CORNER</p>
      <h1>
        Your campus. <em>Your favourites.</em>
      </h1>
      <p className="page-description">
        Explore available suppliers and find a pickup spot near you.
      </p>
      <div className="browse-controls supplier-controls">
        <label className="search-field">
          <Icon name="search" />
          <span className="sr-only">Search suppliers</span>
          <input
            type="search"
            placeholder="Search a supplier or campus location…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button button-outline" onClick={retry}>
          Refresh suppliers
        </button>
      </div>
      <div className="filter-row">
        <div className="category-filters" aria-label="Filter by category">
          {[["ALL", "All suppliers"], ...Object.entries(categoryLabels)].map(
            ([value, label]) => (
              <button
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <p aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "supplier" : "suppliers"}
        </p>
      </div>
      {filtered.length ? (
        <div className="supplier-grid">
          {filtered.map((supplier) => (
            <article className="supplier-card" key={supplier.id}>
              <div className="card-top">
                <span
                  className={`category-icon ${supplier.category === "PRINTING" ? "lilac" : supplier.category === "SHOPPING" ? "peach" : "mint"}`}
                >
                  <Icon
                    name={
                      supplier.category === "PRINTING"
                        ? "print"
                        : supplier.category === "SHOPPING"
                          ? "bag"
                          : "coffee"
                    }
                  />
                </span>
                <span className="category-label">
                  {categoryLabels[supplier.category]}
                </span>
              </div>
              <h2>
                <Link href={`/suppliers/${supplier.id}`}>{supplier.name}</Link>
              </h2>
              <p>
                <Icon name="pin" />
                {supplier.locations
                  .map((location) => location.building)
                  .join(" · ")}
              </p>
              <div className="card-footer">
                <span>
                  {supplier.locations.length} pickup{" "}
                  {supplier.locations.length === 1 ? "location" : "locations"}
                </span>
                <Link
                  className="text-link"
                  href={`/suppliers/${supplier.id}`}
                  aria-label={`View locations: ${supplier.name}`}
                >
                  View locations <Icon name="arrow" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>
            {suppliers.length
              ? "No matching suppliers"
              : "No suppliers available yet"}
          </h2>
          <p>
            {suppliers.length
              ? "Try another search or category."
              : "Active suppliers will appear here when they become available."}
          </p>
          {suppliers.length > 0 && (
            <button
              className="button button-dark"
              onClick={() => {
                setQuery("");
                setCategory("ALL");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}
