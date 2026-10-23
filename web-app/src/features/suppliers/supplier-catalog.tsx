"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, authenticatedRequest } from "@/services/api";
import { categoryLabels, type Supplier } from "@/services/contracts";
import { outletAddress, supplierCards } from "./outlet-display";

type CatalogView = "cards" | "list";
const VIEW_STORAGE_KEY = "foc-supplier-catalog-view-v2";

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
  const [view, setView] = useState<CatalogView>("list");

  useEffect(() => {
    void Promise.resolve().then(() => {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "cards" || saved === "list") setView(saved);
    });
  }, []);

  function chooseView(nextView: CatalogView) {
    setView(nextView);
    window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
  }

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
            <article
              className="detail-card"
              key={location.id}
              id={`outlet-${location.id}`}
            >
              <h2>{location.building}</h2>
              <p className="location-label">{location.supplierAtLocation}</p>
              <div className="route">
                <Icon name="pin" />
                <p>
                  {location.floor === null
                    ? "Floor not specified"
                    : `Floor ${location.floor}`}{" "}
                  · {location.locationDescription}
                </p>
              </div>
              <p className="location-hours">
                <Icon name="clock" />
                {location.opensAt}–{location.closesAt}
                {location.isOpenOvernight ? " (next day)" : ""}
              </p>
            </article>
          ))}
        </div>
      </section>
    );
  }
  const search = query.trim().toLowerCase();
  const filtered = supplierCards(suppliers).filter(
    ({ supplier, title, locations }) =>
      (category === "ALL" || supplier.category === category) &&
      `${title} ${locations.map((location) => `${outletAddress(location)} ${location.supplierAtLocation}`).join(" ")}`
        .toLowerCase()
        .includes(search),
  );
  return (
    <section className="browse-page">
      <div className="catalog-hero">
        <p className="eyebrow">AROUND THE CORNER</p>
        <h1>
          Your campus. <em>Your favourites.</em>
        </h1>
        <p>Explore available suppliers and find a pickup spot near you.</p>
      </div>
      <div className="supplier-control-panel">
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
          <div className="supplier-refresh-action">
            <button className="button button-dark" onClick={retry}>
              Refresh suppliers
            </button>
          </div>
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
          <div className="supplier-view-options">
            <p aria-live="polite">
              {filtered.length}{" "}
              {filtered.length === 1 ? "supplier" : "suppliers"}
            </p>
            <div
              className="view-switch"
              role="group"
              aria-label="Supplier layout"
            >
              <button
                aria-pressed={view === "cards"}
                onClick={() => chooseView("cards")}
              >
                <Icon name="grid" /> Cards
              </button>
              <button
                aria-pressed={view === "list"}
                onClick={() => chooseView("list")}
              >
                <Icon name="list" /> List
              </button>
            </div>
          </div>
        </div>
      </div>
      {filtered.length ? (
        view === "cards" ? (
          <div className="supplier-grid">
            {filtered.map(({ id, supplier, title, locations, href }) => (
              <article className="supplier-card" key={id}>
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
                  <Link href={href}>{title}</Link>
                </h2>
                <dl className="supplier-card-details">
                  <div>
                    <dt>Campus locations</dt>
                    <dd>
                      <Icon name="pin" />
                      {locations
                        .map((location) => location.building)
                        .join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Pickup points</dt>
                    <dd>
                      {locations.length}{" "}
                      {locations.length === 1 ? "location" : "locations"}
                    </dd>
                  </div>
                </dl>
                <div className="card-footer">
                  <Link
                    className="text-link"
                    href={href}
                    aria-label={`View locations: ${title}`}
                  >
                    View locations <Icon name="arrow" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="supplier-table-wrap">
            <table className="supplier-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Category</th>
                  <th>Campus locations</th>
                  <th>Pickup points</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ id, supplier, title, locations, href }) => (
                  <tr key={id}>
                    <td>
                      <Link className="supplier-list-name" href={href}>
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
                        <strong>{title}</strong>
                      </Link>
                    </td>
                    <td>
                      <span className="category-label">
                        {categoryLabels[supplier.category]}
                      </span>
                    </td>
                    <td>
                      {locations
                        .map((location) => location.building)
                        .join(" · ")}
                    </td>
                    <td>
                      {locations.length}{" "}
                      {locations.length === 1 ? "location" : "locations"}
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={href}
                        aria-label={`View locations: ${title}`}
                      >
                        View <Icon name="arrow" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
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
