"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { useAuth } from "@/features/auth/auth-provider";
import { authenticatedRequest } from "@/services/api";
import type { Errand } from "@/services/contracts";
export function ErrandsPage() {
  const auth = useAuth(); const userId = auth.user?.id;
  const [state, setState] = useState<{ userId?: string; errands: Errand[]; busy: boolean; error: string; more: boolean }>({ errands: [], busy: true, error: "", more: false });
  const [attempt, setAttempt] = useState(0); const [offset, setOffset] = useState(0);
  const [scope, setScope] = useState("open");
  const [sort, setSort] = useState("newest");
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setState({ userId, errands: [], busy: true, error: "", more: false });
      try {
        const errands = await authenticatedRequest<Errand[]>(`errands?limit=21&offset=${offset}&scope=${scope}&sort=${sort}`);
        if (active) setState({ userId, errands: errands.slice(0, 20), busy: false, error: "", more: errands.length > 20 });
      } catch (failure) { if (active) setState({ userId, errands: [], busy: false, error: failure instanceof Error ? failure.message : "Unable to load errands.", more: false }); }
    });
    return () => { active = false; };
  }, [userId, offset, attempt, scope, sort]);
  const current = state.userId === userId ? state : { errands: [], busy: true, error: "", more: false };
  if (auth.loading) return <div className="empty-state" role="status">Checking your session…</div>;
  if (auth.error) return <div className="empty-state"><h1>Errands</h1><p role="alert">{auth.error}</p><button className="button button-dark" onClick={() => void auth.reload()}>Try again</button></div>;
  if (!auth.user) return <div className="empty-state"><h1>Errands</h1><p>Log in to see open campus errands.</p><Link className="button button-dark" href="/login">Log in</Link></div>;
  return <section className="errands-page">
    <div className="section-heading"><div><p className="eyebrow">LEND A HAND ON CAMPUS</p><h1>Errands</h1><p className="page-description">{scope === "open" ? "See what your neighbours need. These errands are open and waiting for a courier." : auth.user.isAdmin ? "Review all requests and remove errands when needed." : "View and manage your errand requests."}</p></div>
      <button className="button button-outline" disabled={current.busy} onClick={() => setAttempt((value) => value + 1)}>Refresh errands</button></div>
    <div className="filter-row"><button className="button button-light" aria-pressed={scope === "open"} onClick={() => { setScope("open"); setOffset(0); }}>Open errands</button><button className="button button-light" aria-pressed={scope === "manage"} onClick={() => { setScope("manage"); setOffset(0); }}>{auth.user.isAdmin ? "All requests" : "My requests"}</button></div>
    <label className="errand-sort">Sort errands<select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }}><optgroup label="Creation time"><option value="newest">Latest to oldest</option><option value="oldest">Oldest to latest</option></optgroup><optgroup label="Offered credits"><option value="credits-highest">Credits: max to min</option><option value="credits-lowest">Credits: min to max</option></optgroup></select></label>
    {current.busy ? <p className="empty-state" role="status">Loading open errands…</p> : current.error ? <div className="empty-state"><p role="alert">{current.error}</p><button className="button button-dark" onClick={() => setAttempt((value) => value + 1)}>Retry errands</button></div> : current.errands.length === 0 ? <div className="empty-state"><Icon name="bag" /><h2>{scope === "open" ? "No open errands right now" : "No requests to show"}</h2><p>Check back soon for new requests from your campus community.</p></div> :
      <div className="errand-grid">{current.errands.map((errand) => <article className="errand-card" key={errand.id}>
        <div className="errand-card-heading"><h2>{errand.description}</h2><span className="header-credits" aria-label={`${errand.offeredCredits.toLocaleString()} credits offered`}><Icon name="coin" /><span>{errand.offeredCredits.toLocaleString()}</span></span></div>
        <dl><div><dt><Icon name="pin" /> Pickup location</dt><dd>{errand.pickupLocationLabel}</dd></div>
          <div><dt><Icon name="arrow" /> Deliver to</dt><dd>{errand.deliveryDestination}</dd></div></dl>
        <Link className="text-link" href={`/errands/${errand.id}`} aria-label={`View errand: ${errand.description}`}>View details <Icon name="arrow" /></Link>
      </article>)}</div>}
    {!current.busy && !current.error && <div className="errand-pagination"><button className="button button-light" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 20))}>Previous</button><span>Page {offset / 20 + 1}</span><button className="button button-light" disabled={!current.more} onClick={() => setOffset((value) => value + 20)}>Next</button></div>}
  </section>;
}
