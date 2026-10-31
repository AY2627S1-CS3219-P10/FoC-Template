"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, authenticatedRequest } from "@/services/api";
import type { SupplierMatch } from "@/services/supplier-matches";
import {
  outletAddress,
  supplierCards,
  supplierImageUrl,
} from "@/features/suppliers/outlet-display";
import {
  type CampusLocation,
  categoryLabels,
  type PickupLocation,
  type Profile,
  type Supplier,
} from "@/services/contracts";

type Account = Pick<
  Profile,
  "id" | "username" | "email" | "status" | "isAdmin"
>;
type Editor =
  | { kind: "create" }
  | { kind: "supplier"; supplier: Supplier }
  | { kind: "location"; supplier: Supplier; location: PickupLocation };
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to complete the request. Please try again.";

function AdminSupplierImage({
  locations,
  title,
}: {
  locations: PickupLocation[];
  title: string;
}) {
  const imageUrl = supplierImageUrl(
    locations.find((location) => location.imageUrl)?.imageUrl ?? null,
  );
  return imageUrl ? (
    <div
      className="admin-card-image"
      role="img"
      aria-label={`${title} supplier`}
      style={{ backgroundImage: `url("${imageUrl}")` }}
    />
  ) : (
    <div
      className="admin-card-image admin-card-image-empty"
      role="img"
      aria-label={`No image available for ${title}`}
    />
  );
}

export function AdminDashboard() {
  const { user, loading, error, reload } = useAuth();
  if (loading)
    return (
      <div className="empty-state" role="status">
        Loading your account…
      </div>
    );
  if (error)
    return (
      <div className="empty-state">
        <p role="alert">{error}</p>
        <button className="button button-dark" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    );
  if (!user)
    return (
      <div className="empty-state">
        <h1>Log in to continue</h1>
        <p>An administrator account is required.</p>
        <Link className="button button-dark" href="/login">
          Log in
        </Link>
      </div>
    );
  if (!user.isAdmin)
    return (
      <div className="empty-state">
        <h1>Administrator access required</h1>
        <p>
          Your account does not have permission to manage suppliers or accounts.
        </p>
        <Link href="/suppliers" className="button button-dark">
          Browse suppliers
        </Link>
      </div>
    );
  return <Dashboard key={user.id} user={user} />;
}

function Dashboard({ user }: { user: Profile }) {
  const [tab, setTab] = useState<"suppliers" | "accounts">("suppliers");
  return (
    <section className="admin-page">
      <p className="eyebrow">CAMPUS ADMINISTRATION</p>
      <h1>Admin dashboard</h1>
      <p className="page-description">
        Welcome, {user.username}. Manage campus suppliers and administrator
        access.
      </p>
      <div className="admin-tabs" role="group" aria-label="Dashboard sections">
        <button
          className={`button ${tab === "suppliers" ? "button-dark" : "button-outline"}`}
          aria-pressed={tab === "suppliers"}
          onClick={() => setTab("suppliers")}
        >
          Suppliers
        </button>
        <button
          className={`button ${tab === "accounts" ? "button-dark" : "button-outline"}`}
          aria-pressed={tab === "accounts"}
          onClick={() => setTab("accounts")}
        >
          Accounts & privileges
        </button>
      </div>
      {tab === "suppliers" ? (
        <SupplierManagement />
      ) : (
        <AccountManagement userId={user.id} />
      )}
    </section>
  );
}

function SupplierManagement() {
  const [campusLocations, setCampusLocations] = useState<CampusLocation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<
    "ALL" | Supplier["category"]
  >("ALL");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [supplierCatalog, locationCatalog] = await Promise.all([
        authenticatedRequest<Supplier[]>("admin/suppliers"),
        authenticatedRequest<CampusLocation[]>(
          "admin/suppliers/campus-locations",
        ),
      ]);
      setSuppliers(supplierCatalog);
      setCampusLocations(locationCatalog);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function remove() {
    if (!supplierToDelete) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `admin/suppliers/${supplierToDelete.id}`,
        undefined,
        "DELETE",
      );
      setSuppliers((current) =>
        current.filter((supplier) => supplier.id !== supplierToDelete.id),
      );
      setNotice(
        `${supplierToDelete.name} and its pickup locations were deleted.`,
      );
      setSupplierToDelete(null);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  if (editor)
    return (
      <SupplierEditor
        key={
          editor.kind === "create"
            ? "create"
            : editor.kind === "location"
              ? editor.location.id
              : editor.supplier.id
        }
        campusLocations={campusLocations}
        editor={editor}
        onUseExisting={(match) => {
          setEditor(null);
          setSearch(match.supplierName);
          setNotice(
            `Using existing outlet: ${match.supplierName} · ${match.building} · ${match.locationDescription}. No duplicate was created.`,
          );
        }}
        onEditExisting={(match) => {
          const owner = suppliers.find(
            (candidate) => candidate.id === match.supplierId,
          );
          const pickup = owner?.locations.find(
            (candidate) => candidate.id === match.locationId,
          );
          if (owner && pickup)
            setEditor({ kind: "location", supplier: owner, location: pickup });
          else
            setError(
              "This outlet has changed. Return to the list and refresh before editing it.",
            );
        }}
        onCancel={() => setEditor(null)}
        onSaved={async () => {
          setEditor(null);
          setNotice(
            editor.kind === "create" ? "Supplier created." : "Changes saved.",
          );
          await load();
        }}
      />
    );
  const filtered = supplierCards(suppliers).filter(
    ({ supplier, title, locations }) =>
      (category === "ALL" || supplier.category === category) &&
      `${title} ${categoryLabels[supplier.category]} ${locations.map(outletAddress).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="admin-heading">
        <div>
          <h2>Supplier management</h2>
          <p>Manage active suppliers and their pickup locations.</p>
        </div>
        <button
          className="button button-dark"
          onClick={() => {
            setNotice("");
            setEditor({ kind: "create" });
          }}
        >
          Add supplier
        </button>
      </div>
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className="admin-error">
          {error}{" "}
          <button onClick={() => void load()}>Retry loading suppliers</button>
        </div>
      )}
      {supplierToDelete && (
        <section className="admin-confirm" aria-label="Confirm deletion">
          <h3>Delete {supplierToDelete.name} permanently?</h3>
          <p>
            This permanently removes the supplier and all its pickup locations.
            You can create a new supplier with the same name afterwards.
          </p>
          <div className="admin-actions">
            <button
              className="button admin-danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Confirm deletion"}
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setSupplierToDelete(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <label className="admin-search">
        Filter suppliers
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Supplier name or building"
        />
      </label>
      <div
        className="admin-category-filters category-filters"
        aria-label="Filter suppliers by category"
      >
        <button
          type="button"
          aria-pressed={category === "ALL"}
          onClick={() => setCategory("ALL")}
        >
          All suppliers
        </button>
        {Object.entries(categoryLabels).map(([value, label]) => (
          <button
            type="button"
            aria-pressed={category === value}
            key={value}
            onClick={() => setCategory(value as Supplier["category"])}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <p role="status">Loading suppliers…</p>
      ) : filtered.length === 0 ? (
        <p>No suppliers found.</p>
      ) : (
        <div className="admin-list">
          {filtered.map(({ id, supplier, title, locations }) => (
            <article className="admin-card" key={id}>
              <AdminSupplierImage locations={locations} title={title} />
              <div className="admin-card-content">
                <div className="admin-heading">
                  <div>
                    <span className="eyebrow">
                      {categoryLabels[supplier.category]}
                    </span>
                    <h3>{title}</h3>
                  </div>
                  <div className="admin-actions">
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => setEditor({ kind: "supplier", supplier })}
                    >
                      {locations.length < supplier.locations.length
                        ? "Edit supplier (all outlets)"
                        : "Edit supplier"}
                    </button>
                    <button
                      className="button admin-danger"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setSupplierToDelete(supplier);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      {locations.length < supplier.locations.length
                        ? "Delete supplier (all outlets)"
                        : "Delete"}
                    </button>
                  </div>
                </div>
                {locations.map((location) => (
                  <div className="admin-location" key={location.id}>
                    <div>
                      <strong>{outletAddress(location)}</strong>
                      <p>{location.locationDescription}</p>
                      <p>
                        {location.opensAt}–{location.closesAt}
                        {location.isOpenOvernight ? " (overnight)" : ""}
                      </p>
                    </div>
                    <button
                      className="button button-outline"
                      onClick={() =>
                        setEditor({ kind: "location", supplier, location })
                      }
                    >
                      Edit pickup location
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function SupplierEditor({
  campusLocations,
  editor,
  onCancel,
  onSaved,
  onUseExisting,
  onEditExisting,
}: {
  campusLocations: CampusLocation[];
  editor: Editor;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onUseExisting: (match: SupplierMatch) => void;
  onEditExisting: (match: SupplierMatch) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<SupplierMatch[]>([]);
  const [confirmedSeparate, setConfirmedSeparate] = useState(false);
  const supplier = editor.kind === "create" ? undefined : editor.supplier;
  const location = editor.kind === "location" ? editor.location : undefined;
  const selectedCampusLocationId = location
    ? campusLocations.find(
        (candidate) => candidate.building === location.building,
      )?.id
    : undefined;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const confirmDistinctOutlet =
      matches.length > 0 &&
      confirmedSeparate &&
      submitter instanceof HTMLButtonElement &&
      submitter.name === "confirmSeparate";

    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const supplierInput = { name: text("name"), category: text("category") };
    const confirmation = confirmDistinctOutlet
      ? { confirmDistinctOutlet: true }
      : {};
    const locationInput = {
      campusLocationId: text("campusLocationId"),
      floor: Number(text("floor")),
      locationDescription: text("locationDescription"),
      opensAt: text("opensAt"),
      closesAt: text("closesAt"),
      imageUrl:
        text("imageUrl") || (editor.kind === "create" ? undefined : null),
    };
    try {
      if (editor.kind === "create")
        await authenticatedRequest(
          "admin/suppliers",
          {
            ...supplierInput,
            location: locationInput,
            ...confirmation,
          },
          "POST",
        );
      else if (editor.kind === "supplier")
        await authenticatedRequest(
          `admin/suppliers/${editor.supplier.id}`,
          { ...supplierInput, ...confirmation },
          "PATCH",
        );
      else
        await authenticatedRequest(
          `admin/suppliers/${editor.supplier.id}/locations/${editor.location.id}`,
          { ...locationInput, ...confirmation },
          "PATCH",
        );
      await onSaved();
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === "POSSIBLE_SUPPLIER_DUPLICATE" &&
        failure.matches.length
      ) {
        setMatches(failure.matches);
        setConfirmedSeparate(false);
      } else setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-editor-card">
      <header className="admin-editor-header">
        <span className="eyebrow">
          {editor.kind === "location"
            ? "Pickup location"
            : "Supplier details"}
        </span>
        <h2>
          {editor.kind === "create"
            ? "Add supplier"
            : editor.kind === "supplier"
              ? `Edit ${supplier?.name}`
              : `Edit pickup location · ${supplier?.name}`}
        </h2>
        <p>
          {editor.kind === "create"
            ? "Add a supplier or a new outlet for an existing supplier. Use the existing supplier name when adding another building or floor."
            : "Review and update the details below."}
        </p>
      </header>
      <form
        className="admin-form"
        onSubmit={submit}
        onChange={() => {
          setError("");
          setMatches([]);
          setConfirmedSeparate(false);
        }}
      >
        <fieldset disabled={busy}>
          {editor.kind !== "location" && (
            <div className="admin-form-grid">
              <label>
                Supplier name
                <input
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={supplier?.name}
                />
              </label>
              <label>
                Category
                <select
                  name="category"
                  defaultValue={supplier?.category ?? "FOOD"}
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {editor.kind !== "supplier" && (
            <>
              <h3>Pickup location</h3>
              <div className="admin-form-grid">
                <label>
                  Building
                  <select
                    name="campusLocationId"
                    required
                    defaultValue={selectedCampusLocationId ?? ""}
                  >
                    <option value="" disabled>
                      Select an NUS campus location
                    </option>
                    {campusLocations.map((campusLocation) => (
                      <option key={campusLocation.id} value={campusLocation.id}>
                        {campusLocation.building}
                      </option>
                    ))}
                  </select>
                  <small>
                    Coordinates are filled automatically by the Supplier
                    Service.
                  </small>
                </label>
                <label>
                  Floor
                  <input
                    name="floor"
                    type="number"
                    min={0}
                    step={1}
                    required
                    defaultValue={location?.floor ?? 0}
                  />
                </label>
                <label className="admin-span">
                  Location description (exact pickup point)
                  <textarea
                    name="locationDescription"
                    required
                    maxLength={500}
                    defaultValue={location?.locationDescription}
                    placeholder="e.g. Beside the lift lobby, opposite the study area"
                  />
                </label>
                <label>
                  Opening time
                  <input
                    name="opensAt"
                    type="time"
                    required
                    defaultValue={location?.opensAt}
                  />
                </label>
                <label>
                  Closing time
                  <input
                    name="closesAt"
                    type="time"
                    required
                    defaultValue={location?.closesAt}
                  />
                </label>
                <label className="admin-span">
                  Image URL (optional)
                  <input
                    name="imageUrl"
                    type="url"
                    maxLength={2048}
                    pattern="https?://.*"
                    defaultValue={location?.imageUrl ?? ""}
                  />
                  <small>
                    Use an HTTP or HTTPS URL. Leave blank to remove the image.
                  </small>
                </label>
              </div>
              <p>
                Hours use campus local time. Closing before opening indicates
                overnight hours.
              </p>
            </>
          )}
        </fieldset>
        {matches.length > 0 && (
          <section
            className="admin-confirm"
            aria-label="Review matching outlets"
            role="region"
          >
            <h3>We found existing outlets on this floor</h3>
            <p>Compare the pickup descriptions before adding another entry.</p>
            {matches.map((match) => (
              <article className="admin-location" key={match.locationId}>
                <div>
                  <strong>{match.supplierName}</strong>
                  <p>
                    {match.building} ·{" "}
                    {match.floor === null
                      ? "Floor not specified"
                      : `Floor ${match.floor}`}
                  </p>
                  <p>{match.locationDescription}</p>
                </div>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => onUseExisting(match)}
                  >
                    Use existing outlet
                  </button>
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => onEditExisting(match)}
                  >
                    Edit existing outlet
                  </button>
                </div>
              </article>
            ))}
            <p>
              For a separate pickup point, give its exact physical location in
              the description above. Changing any field will request a fresh
              match check.
            </p>
            <label className="admin-confirm-checkbox">
              <input
                type="checkbox"
                checked={confirmedSeparate}
                disabled={busy}
                onChange={(event) => {
                  event.stopPropagation();
                  setConfirmedSeparate(event.target.checked);
                }}
              />
              <span>
                I confirm this is a different physical pickup point, described
                clearly above.
              </span>
            </label>
          </section>
        )}
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <div className="admin-actions">
          <button
            type="submit"
            name={matches.length ? "confirmSeparate" : "save"}
            className="button button-dark"
            disabled={busy || (matches.length > 0 && !confirmedSeparate)}
          >
            {busy
              ? "Saving…"
              : matches.length > 0
                ? "Confirm separate pickup point"
                : editor.kind === "create"
                  ? "Create supplier"
                  : "Save changes"}
          </button>
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

function AccountManagement({ userId }: { userId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<Account | null>(null);
  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    setTarget(null);
    try {
      setAccounts(
        await authenticatedRequest<Account[]>(
          `admin/accounts?search=${encodeURIComponent(query)}`,
        ),
      );
    } catch (failure) {
      setAccounts([]);
      setError(message(failure));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => load(""));
  }, [load]);
  async function changeRole() {
    if (!target) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `admin/accounts/${target.id}/administrator`,
        { isAdmin: !target.isAdmin },
        "PATCH",
      );
      setAccounts((current) =>
        current.map((a) =>
          a.id === target.id ? { ...a, isAdmin: !target.isAdmin } : a,
        ),
      );
      setNotice(
        `${target.username} is now ${target.isAdmin ? "a student" : "an administrator"}. Their active sessions have been revoked.`,
      );
      setTarget(null);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Accounts & privileges</h2>
      <p>
        Find accounts by username or email. Up to 50 results are shown; refine
        your search to find a specific account.
      </p>
      <form
        className="admin-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load(search);
        }}
      >
        <label className="admin-search">
          Search accounts
          <input
            type="search"
            maxLength={254}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="button button-dark" disabled={loading || busy}>
          Search
        </button>
      </form>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {target && (
        <section
          className="admin-confirm"
          aria-label="Confirm privilege change"
        >
          <h3>
            {target.isAdmin
              ? "Remove administrator access"
              : "Grant administrator access"}{" "}
            for {target.username}?
          </h3>
          <p>{target.email}</p>
          <p>
            Changing privileges signs this user out of all active sessions.
            Administrators can manage suppliers and other accounts’ privileges.
          </p>
          <div className="admin-actions">
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void changeRole()}
            >
              {busy ? "Updating…" : "Confirm privilege change"}
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <p>
        You cannot change your own administrator status. The system must retain
        at least one administrator.
      </p>
      {loading ? (
        <p role="status">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <p>No accounts found.</p>
      ) : (
        <div className="admin-list">
          {accounts.map((account) => (
            <article className="admin-card admin-heading" key={account.id}>
              <div>
                <h3>
                  {account.username}
                  {account.id === userId ? " (you)" : ""}
                </h3>
                <p>{account.email}</p>
                <p>
                  {account.isAdmin ? "Administrator" : "Student"} ·{" "}
                  {account.status}
                </p>
              </div>
              <button
                className="button button-outline"
                disabled={busy || account.id === userId}
                onClick={() => {
                  setTarget(account);
                  setError("");
                }}
              >
                {account.isAdmin ? "Remove admin access" : "Make administrator"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
