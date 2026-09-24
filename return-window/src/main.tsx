import React, { useState, useEffect, FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
  useAction,
} from "convex/react";
import { api } from "../convex/_generated/api";
import { Doc } from "../convex/_generated/dataModel";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Package,
  CalendarDays,
  Check,
  Copy,
  Link,
  Clock,
  ArrowRight,
  Undo2,
} from "lucide-react";
import { daysLeft, localToday, ical, stages, Stage } from "./domain";
import "./style.css";
const client = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const labels: Record<Stage, string> = {
  decide: "To decide",
  pack: "Ready to pack",
  sent: "Sent back",
  refunded: "Refund received",
  kept: "Keeping it",
};
const makeToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
function App() {
  const [token, setToken] = useState(location.hash.slice(1));
  const [currency, setCurrency] = useState("INR");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("active");
  const [selected, setSelected] = useState<string | null>(null);
  const valid = /^[a-f0-9]{64}$/.test(token);
  const board = useQuery(api.returns.load, valid ? { token } : "skip");
  const create = useMutation(api.returns.create);
  const add = useMutation(api.returns.add);
  const update = useMutation(api.returns.update);
  const erase = useMutation(api.returns.erase);
  const capture = useAction(api.policies.capture);
  useEffect(() => {
    const h = () => {
      setToken(location.hash.slice(1));
      setSelected(null);
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const t = makeToken();
      await create({ token: t, currency });
      location.hash = t;
      setToken(t);
      setAdding(true);
    } catch {
      setError("Your board could not be created. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(msg);
    } catch {
      setError("Copy failed. Select and copy the text yourself.");
    }
  }
  async function deleteBoard() {
    if (
      !confirm(
        "Delete this board and all its purchases? Everyone with the link will lose access. This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      await erase({ token });
      location.hash = "";
      setToken("");
      setNotice("Board deleted. Its old link no longer works.");
    } catch {
      setError("Deletion failed. Your board is still available.");
    } finally {
      setBusy(false);
    }
  }
  const today = localToday();
  const items = board?.items ?? [];
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: board?.currency ?? currency,
      maximumFractionDigits: 2,
    }).format(n / 100);
  const active = items.filter((x) => !["refunded", "kept"].includes(x.stage));
  const due = active.filter(
    (x) => x.stage !== "sent" && daysLeft(x.due, today) <= 3,
  );
  const atRisk = active.reduce((s, x) => s + x.amount, 0);
  const recovered = items
    .filter((x) => x.stage === "refunded")
    .reduce((s, x) => s + x.amount, 0);
  const visible = items
    .filter(
      (x) =>
        filter === "all" ||
        (filter === "active"
          ? active.includes(x)
          : ["refunded", "kept"].includes(x.stage)),
    )
    .sort((a, b) => a.due.localeCompare(b.due));
  const item = items.find((x) => x._id === selected);
  async function addItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await add({
        token,
        requestId:
          form.dataset.requestId ??
          (form.dataset.requestId = crypto.randomUUID()),
        name: String(f.get("name")),
        shop: String(f.get("shop")),
        amount: Math.round(Number(f.get("amount")) * 100),
        due: String(f.get("due")),
        policyUrl: String(f.get("policyUrl")),
      });
      setAdding(false);
      setNotice("Purchase saved. Your board is up to date.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveItem(p: Doc<"purchases">, stage: string, note: string) {
    setBusy(true);
    setError("");
    try {
      await update({ token, id: p._id, expectedAt: p.updatedAt, stage, note });
      setNotice("Return updated for everyone with this board link.");
      setSelected(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <a className="brand" href={location.pathname}>
          <Undo2 size={24} />
          <span>
            return window<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-note">A little less life admin.</span>
        {board && (
          <button
            className="quiet"
            onClick={() =>
              copy(
                location.href,
                "Board link copied. Share only with people you trust.",
              )
            }
          >
            <Link size={16} /> Share board
          </button>
        )}
      </header>
      {!valid ? (
        <main className="landing">
          <section>
            <div className="eyebrow">FOR THE THINGS THAT DIDN’T QUITE FIT</div>
            <h1>
              Keep the receipt.
              <br />
              Lose the mental load.
            </h1>
            <p className="intro">
              One shared place for return deadlines, parcels, and refunds. Get
              the money back. Get on with your day.
            </p>
            <div className="start-row">
              <label>
                Board currency
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option>INR</option>
                  <option>USD</option>
                  <option>GBP</option>
                  <option>EUR</option>
                </select>
              </label>
              <button className="primary" disabled={busy} onClick={start}>
                {busy ? "Creating…" : "Start my return board"}
                <ArrowRight size={18} />
              </button>
            </div>
            <p className="small">
              No account needed. Keep your private board link safe.
              <br />
              Anyone with the link can view and edit your board.
            </p>
          </section>
          <aside className="preview" aria-label="Example return board">
            <div className="preview-top">
              <span>THE RETURN PILE</span>
              <span>Example</span>
            </div>
            <div className="parcel">
              <Package size={72} strokeWidth={1} />
              <div className="parcel-label">
                BACK
                <br />
                TO SENDER <ArrowUpRight size={20} />
              </div>
            </div>
            <div className="example-item">
              <div>
                <b>The almost-right trainers</b>
                <span>Ready to pack</span>
              </div>
              <span className="badge">2 days left</span>
            </div>
            <div className="example-item">
              <div>
                <b>That extra desk lamp</b>
                <span>Refund received</span>
              </div>
              <Check size={20} />
            </div>
            <div className="preview-bottom">
              Fewer “I meant to return that” moments.
            </div>
          </aside>
        </main>
      ) : board === undefined ? (
        <main className="loading">Opening your board…</main>
      ) : board === null ? (
        <main className="loading">
          <h1>We couldn’t find this board.</h1>
          <p>Check your saved link, or start a new board.</p>
          <a href={location.pathname}>Start again</a>
        </main>
      ) : (
        <main className="workspace">
          <div className="board-heading">
            <div className="eyebrow">
              YOUR RETURN BOARD <span className="live-dot" /> LIVE
            </div>
            <h1>A clear path back.</h1>
            <p>Decide, pack, send. Keep every refund in sight.</p>
          </div>
          <div className="summary">
            <div className="total">
              <span>Still in the return pile</span>
              <strong>{money(atRisk)}</strong>
              <small>
                {active.length} active{" "}
                {active.length === 1 ? "purchase" : "purchases"}
              </small>
            </div>
            <div className="recovered">
              <Check size={19} />
              <div>
                <strong>{money(recovered)}</strong>
                <span>marked as refunded</span>
              </div>
            </div>
            <div className="due-soon">
              <Clock size={19} />
              <div>
                <strong>{due.length} need a look</strong>
                <span>due within 3 days or overdue</span>
              </div>
            </div>
          </div>
          <div className="list-toolbar">
            <nav aria-label="Filter purchases">
              {[
                ["active", "In progress"],
                ["done", "Finished"],
                ["all", "All purchases"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={filter === v ? "tab selected" : "tab"}
                  onClick={() => setFilter(v)}
                >
                  {l}
                </button>
              ))}
            </nav>
            <button
              className="primary"
              onClick={() => {
                setAdding(true);
                setError("");
              }}
            >
              <Plus size={18} /> Add purchase
            </button>
          </div>
          <div className="purchase-list">
            {visible.length ? (
              visible.map((p) => (
                <button
                  key={p._id}
                  className="purchase"
                  onClick={() => {
                    setSelected(p._id);
                    setError("");
                  }}
                >
                  <span className="item-icon">
                    <Package size={22} />
                  </span>
                  <span className="item-name">
                    <b>{p.name}</b>
                    <small>
                      {p.shop} · {labels[p.stage as Stage]}
                    </small>
                  </span>
                  <span
                    className={
                      "deadline " + (daysLeft(p.due, today) < 0 ? "late" : "")
                    }
                  >
                    <b>
                      {["refunded", "kept"].includes(p.stage)
                        ? labels[p.stage as Stage]
                        : p.stage === "sent"
                          ? "Awaiting refund"
                          : daysLeft(p.due, today) < 0
                            ? `${-daysLeft(p.due, today)} days overdue`
                            : daysLeft(p.due, today) === 0
                              ? "Due today"
                              : `${daysLeft(p.due, today)} days left`}
                    </b>
                    <small>Deadline {p.due}</small>
                  </span>
                  <strong className="amount">{money(p.amount)}</strong>
                  <ArrowUpRight size={18} />
                </button>
              ))
            ) : (
              <div className="empty">
                <Package size={42} strokeWidth={1} />
                <h2>
                  {filter === "done"
                    ? "Your finished returns will live here."
                    : "Give that return pile a plan."}
                </h2>
                <p>
                  {filter === "done"
                    ? "Mark a refund received or an item kept to close the loop."
                    : "Add a purchase and its confirmed return deadline to get started."}
                </p>
              </div>
            )}
          </div>
          <p className="board-foot">
            Use the deadline in the shop’s policy. This board tracks your dates;
            it does not verify return eligibility.
          </p>
          <button className="quiet" disabled={busy} onClick={deleteBoard}>
            Delete this board
          </button>
        </main>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {error && !adding && !item && (
        <div className="error global" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {adding && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
            className="dialog"
          >
            <button className="back" onClick={() => !busy && setAdding(false)}>
              <ArrowLeft size={16} /> Back to board
            </button>
            <h2 id="add-title">Add to the return pile.</h2>
            <p>Use the final return date shown by the shop.</p>
            <form onSubmit={addItem}>
              <label>
                What did you buy?
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="e.g. Linen shirt"
                  autoFocus
                />
              </label>
              <div className="two-col">
                <label>
                  Shop
                  <input
                    name="shop"
                    required
                    maxLength={80}
                    placeholder="Shop name"
                  />
                </label>
                <label>
                  Amount ({board?.currency})
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    required
                    placeholder="0.00"
                  />
                </label>
              </div>
              <label>
                Confirmed return deadline
                <input name="due" type="date" required />
              </label>
              <label>
                Return policy link <span>(optional)</span>
                <input
                  name="policyUrl"
                  type="url"
                  maxLength={2000}
                  placeholder="https://shop.com/returns"
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary wide" disabled={busy}>
                {busy ? "Saving…" : "Save purchase"}
                <ArrowRight size={18} />
              </button>
            </form>
          </section>
        </div>
      )}
      {item && (
        <Detail
          key={item._id}
          item={item}
          money={money(item.amount)}
          busy={busy}
          error={error}
          close={() => !busy && setSelected(null)}
          save={saveItem}
          copy={copy}
          capture={async () => {
            try {
              await capture({ token, id: item._id });
            } catch {
              setError(
                "Policy capture is unavailable. Open the shop policy instead.",
              );
            }
          }}
        />
      )}
      <footer>
        <span>Return Window</span>
        <span>Built for the small things that add up.</span>
      </footer>
    </>
  );
}
function message(e: unknown) {
  const s = e instanceof Error ? e.message : "";
  return s.includes("another tab")
    ? "This item changed elsewhere. Your draft is unchanged. Copy your notes, then close and reopen this item to review the latest version."
    : s.includes("100 purchases")
      ? "This board has reached 100 purchases."
      : s.includes("valid return deadline")
        ? "Choose a valid return date."
        : "Could not save. Your changes are still here. Please try again.";
}
function Detail({
  item: p,
  money,
  busy,
  error,
  close,
  save,
  copy,
  capture,
}: {
  item: Doc<"purchases">;
  money: string;
  busy: boolean;
  error: string;
  close: () => void;
  save: (p: Doc<"purchases">, stage: string, note: string) => void;
  copy: (s: string, m: string) => void;
  capture: () => Promise<void>;
}) {
  const [capturing, setCapturing] = useState(false);
  const [original] = useState(p);
  const [stage, setStage] = useState(p.stage);
  const [note, setNote] = useState(p.note);
  const draft = `Hello ${p.shop},\n\nI would like to return ${p.name} (${money}). My recorded return deadline is ${p.due}. Please confirm eligibility and the return instructions.\n\nThank you.`;
  function calendar() {
    const url = URL.createObjectURL(
      new Blob([ical(p.name, p.due)], { type: "text/calendar" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "return-deadline.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        className="dialog"
      >
        <button className="back" onClick={close}>
          <ArrowLeft size={16} /> Back to board
        </button>
        <div className="detail-head">
          <Package size={32} />
          <span>
            {p.shop} · {money}
          </span>
        </div>
        <h2 id="detail-title">{p.name}</h2>
        {p.updatedAt !== original.updatedAt && (
          <p className="error" role="status">
            Someone updated this return. Your draft is still here. Copy your
            notes before closing and reopening it.
          </p>
        )}
        <p>
          Return deadline: <b>{p.due}</b>
        </p>
        <label>
          Where are we up to?
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => (
              <option value={s} key={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes for the next person
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="Parcel location, tracking number, or next step…"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary wide"
          disabled={busy}
          onClick={() => save(original, stage, note)}
        >
          {busy ? "Saving…" : "Save return update"}
          <Check size={18} />
        </button>
        <div className="tools">
          <button onClick={calendar}>
            <CalendarDays size={17} /> Calendar reminder
          </button>
          {p.policyUrl && (
            <a href={p.policyUrl} target="_blank" rel="noopener noreferrer">
              Shop policy
              <ArrowUpRight size={15} />
            </a>
          )}
        </div>
        {p.policyUrl && (
          <section className="policy-evidence">
            <h3>Keep the policy with the parcel.</h3>
            <p className="small">
              Capture the public shop page with Firecrawl. Your deadline stays
              unchanged. Check exclusions with the shop.
            </p>
            {p.policyText ? (
              <details>
                <summary>
                  Saved policy ·{" "}
                  {new Date(p.policyFetchedAt!).toLocaleDateString()}
                </summary>
                <pre className="policy-text">{p.policyText}</pre>
                <small>
                  First 18,000 characters. Open the shop page for the complete
                  current policy.
                </small>
              </details>
            ) : (
              <button
                className="quiet"
                disabled={capturing}
                onClick={async () => {
                  setCapturing(true);
                  try {
                    await capture();
                  } finally {
                    setCapturing(false);
                  }
                }}
              >
                {capturing ? "Reading shop policy…" : "Save policy evidence"}
              </button>
            )}
            {p.policyError && (
              <p role="alert" className="error">
                {p.policyError}
              </p>
            )}
          </section>
        )}
        <details>
          <summary>Need to ask the shop?</summary>
          <p className="draft">{draft}</p>
          <button
            className="quiet"
            onClick={() =>
              copy(draft, "Draft copied. Review it before sending to the shop.")
            }
          >
            <Copy size={16} /> Copy draft
          </button>
          <small>Nothing is sent from this app.</small>
        </details>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={client}>
      <App />
    </ConvexProvider>
  </React.StrictMode>,
);
