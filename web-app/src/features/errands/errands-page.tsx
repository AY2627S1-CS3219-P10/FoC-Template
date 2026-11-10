/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of errands page rendering and interaction code (ErrandsPage).
 * Author review: Validated ErrandsPage state updates, click handlers, request results in web-app/errands-page.tsx; refined JSX layout and user-facing wording. Additional review item: Check loading and error states, and displayed values after successful actions.
 */

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, authenticatedRequest, request } from "@/services/api";
import type { ErrandPreview } from "@/services/contracts";
import { ErrandStatus } from "./errand-status";

type ErrandState = {
  viewer?: string;
  key?: string;
  scope?: string;
  loaded?: boolean;
  errands: ErrandPreview[];
  busy: boolean;
  error: string;
  more: boolean;
};

export function ErrandsPage() {
  const auth = useAuth();
  const viewer = auth.user?.id ?? "guest";
  const [state, setState] = useState<ErrandState>({
    errands: [],
    busy: true,
    error: "",
    more: false,
  });
  const [attempt, setAttempt] = useState(0);
  const [offset, setOffset] = useState(0);
  const [scope, setScope] = useState("open");
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [savingStars, setSavingStars] = useState<string[]>([]);
  const starRequests = useRef(new Set<string>());
  const [starError, setStarError] = useState("");

  async function toggleStar(errand: ErrandPreview) {
    if (starRequests.current.has(errand.id)) return;
    starRequests.current.add(errand.id);
    setSavingStars((ids) => [...ids, errand.id]);
    setStarError("");
    try {
      const result = await authenticatedRequest<{ isStarred: boolean }>(
        `errands/${errand.id}/star`,
        {},
        errand.isStarred ? "DELETE" : "POST",
      );
      setState((previous) => previous.viewer !== viewer ? previous : ({
        ...previous,
        errands: previous.errands.map((item) => item.id === errand.id ? { ...item, isStarred: result.isStarred } : item),
      }));
      if (!result.isStarred && scope === "starred" && state.errands.filter((item) => item.isStarred).length === 1 && offset > 0) {
        setOffset((value) => Math.max(0, value - 20));
      }
    } catch (error) {
      setStarError(error instanceof Error ? error.message : "Unable to save your star. Try again.");
    } finally {
      starRequests.current.delete(errand.id);
      setSavingStars((ids) => ids.filter((id) => id !== errand.id));
    }
  }

  useEffect(() => {
    if (auth.loading) return;
    const timer = setInterval(() => setAttempt((value) => value + 1), 20_000);
    return () => clearInterval(timer);
  }, [auth.loading, viewer]);

  useEffect(() => {
    if (auth.loading) return;
    let active = true;
    const visibleScope = auth.user ? scope : "open";
    const load = auth.user ? authenticatedRequest : request;
    const key = JSON.stringify([viewer, visibleScope, offset, sort]);

    void Promise.resolve().then(async () => {
      if (!active) return;
      setState((previous) => previous.key === key
        ? previous
        : previous.viewer === viewer && previous.loaded
          ? { ...previous, busy: true, error: "" }
          : { viewer, errands: [], busy: true, error: "", more: false });
      try {
        const errands = await load<ErrandPreview[]>(
          `errands?limit=21&offset=${offset}&scope=${visibleScope}&sort=${sort}`,
        );
        if (active) {
          setState({
            viewer,
            key,
            scope: visibleScope,
            loaded: true,
            errands: errands.slice(0, 20),
            busy: false,
            error: "",
            more: errands.length > 20,
          });
        }
      } catch (failure) {
        if (active) {
          const missingGuestPreview =
            failure instanceof ApiError &&
            failure.status === 404 &&
            failure.message.includes("errand-previews");
          setState({
            viewer,
            key,
            scope: visibleScope,
            loaded: true,
            errands: [],
            busy: false,
            error: missingGuestPreview
              ? ""
              : failure instanceof Error
                ? failure.message
                : "Unable to load errands.",
            more: false,
          });
        }
      }
    });

    return () => {
      active = false;
    };
  }, [auth.loading, auth.user, viewer, offset, attempt, scope, sort]);

  const current =
    state.viewer === viewer
      ? state
      : { errands: [], busy: true, error: "", more: false };
  const displayedScope = "scope" in current ? current.scope ?? scope : scope;

  if (auth.loading) {
    return (
      <div className="empty-state" role="status">
        Checking your session…
      </div>
    );
  }

  const description = !auth.user
    ? "See what your neighbours need. Log in when you want to view or accept an errand."
    : scope === "starred"
      ? "Your saved errands. Stars are private to your account. Only errands you can still view appear here."
    : scope === "open"
      ? "See what your neighbours need. These errands are open and waiting for a courier."
      : scope === "assigned"
        ? "Track the errands you have accepted and update their delivery status."
        : auth.user.isAdmin
          ? "Review all requests and remove errands when needed."
          : "View and manage your errand requests.";

  const search = query.trim().toLowerCase();
  const eligibleErrands = current.errands.filter((errand) =>
    displayedScope !== "starred" || !auth.user || (errand.isStarred && errand.status !== "COMPLETED" && errand.status !== "EXPIRED"),
  );
  const visibleErrands = eligibleErrands.filter((errand) =>
    `${errand.description} ${errand.pickupSupplierName} ${errand.pickupLocationLabel} ${errand.deliveryDestination}`
      .toLowerCase()
      .includes(search),
  );
  const selectedErrand =
    visibleErrands.find((errand) => errand.id === selectedId) ??
    visibleErrands[0];

  return (
    <section className="errands-page">
      <div className="errands-hero">
        <p className="eyebrow">LEND A HAND ON CAMPUS</p>
        <h1 aria-label="Errands">Find an errand that fits your day.</h1>
        <p>{description}</p>
      </div>

      <div className="errand-control-panel">
        <div className="errand-search-row">
          <label className="errand-search">
            <Icon name="search" />
            <span className="sr-only">Search errands</span>
            <input
              type="search"
              placeholder="Search by errand, supplier, or campus location…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {query && (
            <button
              className="errand-clear-search"
              onClick={() => setQuery("")}
            >
              Clear
            </button>
          )}
          <button
            className="button button-dark"
            aria-label="Refresh errands"
            disabled={current.busy}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Refresh
          </button>
        </div>

        <div className="errand-filter-bar">
          <div className="errand-scope-tabs" aria-label="Errand views">
            <button
              aria-pressed={scope === "open"}
              onClick={() => {
                setScope("open");
                setOffset(0);
                setSelectedId("");
              }}
            >
              Open errands
            </button>
            {auth.user && (
              <>
                <button
                  aria-pressed={scope === "starred"}
                  onClick={() => {
                    setScope("starred");
                    setOffset(0);
                    setSelectedId("");
                  }}
                >
                  ★ Starred errands
                </button>
                <button
                  aria-pressed={scope === "manage"}
                  onClick={() => {
                    setScope("manage");
                    setOffset(0);
                    setSelectedId("");
                  }}
                >
                  {auth.user.isAdmin ? "All requests" : "My requests"}
                </button>
                <button
                  aria-pressed={scope === "assigned"}
                  onClick={() => {
                    setScope("assigned");
                    setOffset(0);
                    setSelectedId("");
                  }}
                >
                  My deliveries
                </button>
              </>
            )}
          </div>
          <label className="errand-sort">
            <span>Sort by</span>
            <select
              aria-label="Sort errands"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setOffset(0);
                setSelectedId("");
              }}
            >
              <optgroup label="Creation time">
                <option value="newest">Latest to oldest</option>
                <option value="oldest">Oldest to latest</option>
              </optgroup>
              <optgroup label="Offered credits">
                <option value="credits-highest">Credits: max to min</option>
                <option value="credits-lowest">Credits: min to max</option>
              </optgroup>
            </select>
          </label>
        </div>
      </div>

      {!auth.user && (
        <aside className="guest-errands-notice">
          <div>
            <strong>Browse what your campus community needs.</strong>
            <p>Log in to open an errand, view its details, or accept it.</p>
            {auth.error && <p role="alert">{auth.error}</p>}
          </div>
          <Link className="button button-dark" href="/login">
            Log in
          </Link>
        </aside>
      )}

      {starError && <p role="alert">{starError}</p>}
      <div className="errand-view-results" aria-busy={current.busy}>
      {current.busy && !("loaded" in current && current.loaded) ? (
        <p className="empty-state" role="status">
          Loading open errands…
        </p>
      ) : current.error ? (
        <div className="empty-state">
          <p role="alert">{current.error}</p>
          <button
            className="button button-dark"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry errands
          </button>
        </div>
      ) : visibleErrands.length === 0 ? (
        <div className="empty-state">
          <Icon name="bag" />
          <h2>
            {eligibleErrands.length > 0
              ? "No errands match your search"
              : displayedScope === "starred"
                ? "No starred errands to show"
              : displayedScope === "open"
                ? "No open errands right now"
                : "No requests to show"}
          </h2>
          <p>
            {eligibleErrands.length > 0
              ? "Try a different keyword or clear your search."
              : displayedScope === "starred"
                ? "Star errands you are interested in from Open errands. They will appear here while you can still view them."
                : "Check back soon for new requests from your campus community."}
          </p>
        </div>
      ) : (
        <div className="errand-board" inert={current.busy}>
          <div className="errand-results">
            <div className="errand-results-heading">
              <strong>
                {visibleErrands.length}{" "}
                {visibleErrands.length === 1 ? "errand" : "errands"}
              </strong>
              <span>Page {offset / 20 + 1}</span>
            </div>
            <div className="errand-list">
              {visibleErrands.map((errand) => (
                <article
                  className={`errand-list-card ${selectedErrand?.id === errand.id ? "selected" : ""}`}
                  key={errand.id}
                >
                  {auth.user ? (
                    <>
                      <button
                        className="errand-select-button errand-select-desktop"
                        onClick={() => setSelectedId(errand.id)}
                        aria-label={`Preview errand: ${errand.description}`}
                      >
                        <ErrandCardContent errand={errand} />
                      </button>
                      <Link
                        className="errand-select-button errand-select-mobile"
                        href={`/errands/${errand.id}`}
                        aria-label={`View errand: ${errand.description}`}
                      >
                        <ErrandCardContent errand={errand} />
                      </Link>
                    </>
                  ) : (
                    <div className="errand-select-button">
                      <ErrandCardContent errand={errand} />
                    </div>
                  )}
                  <div className="errand-list-action">
                    {auth.user && displayedScope !== "assigned" && errand.status !== "EXPIRED" && errand.status !== "COMPLETED" && (
                      <button
                        className="errand-star-button"
                        title={errand.isStarred ? "Unstar" : "Star"}
                        aria-label={`${errand.isStarred ? "Unstar" : "Star"} errand: ${errand.description}`}
                        aria-pressed={Boolean(errand.isStarred)}
                        disabled={savingStars.includes(errand.id)}
                        onClick={() => void toggleStar(errand)}
                      >
                        <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24">
                          <path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" />
                        </svg>
                      </button>
                    )}
                    <Link
                      className="text-link"
                      href={auth.user ? `/errands/${errand.id}` : "/login"}
                      aria-label={
                        auth.user
                          ? `View errand: ${errand.description}`
                          : `Log in to view errand: ${errand.description}`
                      }
                    >
                      {auth.user ? "View details" : "Log in to view details"}{" "}
                      <Icon name="arrow" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            <div className="errand-pagination">
              <button
                className="button button-light"
                disabled={offset === 0}
                onClick={() => {
                  setOffset((value) => Math.max(0, value - 20));
                  setSelectedId("");
                }}
              >
                Previous
              </button>
              <span>Page {offset / 20 + 1}</span>
              <button
                className="button button-light"
                disabled={!current.more}
                onClick={() => {
                  setOffset((value) => value + 20);
                  setSelectedId("");
                }}
              >
                Next
              </button>
            </div>
          </div>

          <aside
            className="errand-preview"
            aria-label="Selected errand preview"
          >
            <div className="errand-preview-top">
              <ErrandStatus status={selectedErrand.status} />
              <span
                className="header-credits"
                aria-label={`${selectedErrand.offeredCredits.toLocaleString()} credits offered`}
              >
                <Icon name="coin" />
                <span>{selectedErrand.offeredCredits.toLocaleString()}</span>
              </span>
            </div>
            <h2>{selectedErrand.description}</h2>
            <p className="errand-preview-supplier">
              {selectedErrand.pickupSupplierName}
            </p>
            <dl>
              <div>
                <dt>
                  <Icon name="pin" /> Pickup location
                </dt>
                <dd>{selectedErrand.pickupLocationLabel}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="arrow" /> Deliver to
                </dt>
                <dd>{selectedErrand.deliveryDestination}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="clock" /> Posted
                </dt>
                <dd>
                  {new Intl.DateTimeFormat("en-SG", {
                    dateStyle: "medium",
                  }).format(new Date(selectedErrand.createdAt))}
                </dd>
              </div>
            </dl>
            <Link
              className="button button-dark"
              href={auth.user ? `/errands/${selectedErrand.id}` : "/login"}
            >
              {auth.user ? "View full details" : "Log in to view details"}{" "}
              <Icon name="arrow" />
            </Link>
            <div className="errand-preview-about">
              <h3>About this errand</h3>
              <p>
                Review the pickup and delivery route, offered credits, and
                current status before deciding your next step.
              </p>
            </div>
          </aside>
        </div>
      )}
      </div>
    </section>
  );
}

function ErrandCardContent({ errand }: { errand: ErrandPreview }) {
  return (
    <>
      <div className="errand-card-heading">
        <h2>{errand.description}</h2>
        <span
          className="header-credits"
          aria-label={`${errand.offeredCredits.toLocaleString()} credits offered`}
        >
          <Icon name="coin" />
          <span>{errand.offeredCredits.toLocaleString()}</span>
        </span>
      </div>
      <p className="errand-list-supplier">{errand.pickupSupplierName}</p>
      <div className="errand-list-meta">
        <span>
          <Icon name="pin" /> {errand.pickupLocationLabel}
        </span>
        <span>
          <Icon name="arrow" /> {errand.deliveryDestination}
        </span>
      </div>
      <div className="errand-list-footer">
        <ErrandStatus status={errand.status} />
        <span>
          {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(
            new Date(errand.createdAt),
          )}
        </span>
      </div>
    </>
  );
}
