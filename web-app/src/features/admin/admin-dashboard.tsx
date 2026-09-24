"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { authenticatedRequest } from "@/services/api";
import {
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deactivate, setDeactivate] = useState<Supplier | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSuppliers(await authenticatedRequest<Supplier[]>("admin/suppliers"));
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
    if (!deactivate) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await authenticatedRequest(
        `admin/suppliers/${deactivate.id}`,
        undefined,
        "DELETE",
      );
      setSuppliers((current) => current.filter((s) => s.id !== deactivate.id));
      setNotice(
        `${deactivate.name} and its pickup locations have been deactivated.`,
      );
      setDeactivate(null);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  if (editor)
    return (
      <SupplierEditor
        editor={editor}
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
  const filtered = suppliers.filter((s) =>
    `${s.name} ${s.locations.map((l) => l.building).join(" ")}`
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
      {deactivate && (
        <section className="admin-confirm" aria-label="Confirm deactivation">
          <h3>Deactivate {deactivate.name}?</h3>
          <p>
            This removes the supplier and all its pickup locations from the
            active catalog. Reactivation is not available here.
          </p>
          <div className="admin-actions">
            <button
              className="button admin-danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deactivating…" : "Confirm deactivation"}
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setDeactivate(null)}
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
      {loading ? (
        <p role="status">Loading suppliers…</p>
      ) : filtered.length === 0 ? (
        <p>No suppliers found.</p>
      ) : (
        <div className="admin-list">
          {filtered.map((supplier) => (
            <article className="admin-card" key={supplier.id}>
              <div className="admin-heading">
                <div>
                  <span className="eyebrow">
                    {categoryLabels[supplier.category]}
                  </span>
                  <h3>{supplier.name}</h3>
                </div>
                <div className="admin-actions">
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => setEditor({ kind: "supplier", supplier })}
                  >
                    Edit supplier
                  </button>
                  <button
                    className="button admin-danger"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setDeactivate(supplier);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
              {supplier.locations.map((location) => (
                <div className="admin-location" key={location.id}>
                  <div>
                    <strong>
                      {location.building} · Floor {location.floor}
                    </strong>
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
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function SupplierEditor({
  editor,
  onCancel,
  onSaved,
}: {
  editor: Editor;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supplier = editor.kind === "create" ? undefined : editor.supplier;
  const location = editor.kind === "location" ? editor.location : undefined;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const supplierInput = { name: text("name"), category: text("category") };
    const locationInput = {
      building: text("building"),
      floor: Number(text("floor")),
      locationDescription: text("locationDescription"),
      latitude: Number(text("latitude")),
      longitude: Number(text("longitude")),
      opensAt: text("opensAt"),
      closesAt: text("closesAt"),
      imageUrl:
        text("imageUrl") || (editor.kind === "create" ? undefined : null),
    };
    try {
      if (editor.kind === "create")
        await authenticatedRequest(
          "admin/suppliers",
          { ...supplierInput, location: locationInput },
          "POST",
        );
      else if (editor.kind === "supplier")
        await authenticatedRequest(
          `admin/suppliers/${editor.supplier.id}`,
          supplierInput,
          "PATCH",
        );
      else
        await authenticatedRequest(
          `admin/suppliers/${editor.supplier.id}/locations/${editor.location.id}`,
          locationInput,
          "PATCH",
        );
      await onSaved();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card">
      <h2>
        {editor.kind === "create"
          ? "Add supplier"
          : editor.kind === "supplier"
            ? `Edit ${supplier?.name}`
            : `Edit pickup location · ${supplier?.name}`}
      </h2>
      <p>
        {editor.kind === "create"
          ? "Create a supplier with its first pickup location."
          : "Update the details below."}
      </p>
      <form className="admin-form" onSubmit={submit}>
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
                  <input
                    name="building"
                    required
                    maxLength={160}
                    defaultValue={location?.building}
                  />
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
                  Location description
                  <textarea
                    name="locationDescription"
                    required
                    maxLength={500}
                    defaultValue={location?.locationDescription}
                  />
                </label>
                <label>
                  Latitude
                  <input
                    name="latitude"
                    type="number"
                    min={-90}
                    max={90}
                    step="any"
                    required
                    defaultValue={location?.latitude}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="longitude"
                    type="number"
                    min={-180}
                    max={180}
                    step="any"
                    required
                    defaultValue={location?.longitude}
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
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <div className="admin-actions">
          <button className="button button-dark" disabled={busy}>
            {busy
              ? "Saving…"
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
