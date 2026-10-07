import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { validDate, safeUrl, stages } from "../src/domain";
async function digest(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error("Invalid board link.");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function clean(s: string, max: number, label: string) {
  s = s.trim();
  if (!s || s.length > max)
    throw Error(`${label} must contain 1–${max} characters.`);
  return s;
}
export const load = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const hash = await digest(token);
    const board = await ctx.db
      .query("boards")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!board) return null;
    return {
      currency: board.currency,
      items: await ctx.db
        .query("purchases")
        .withIndex("by_board", (q) => q.eq("boardId", board._id))
        .take(101),
    };
  },
});
export const create = mutation({
  args: { token: v.string(), currency: v.string() },
  handler: async (ctx, { token, currency }) => {
    if (!["INR", "USD", "GBP", "EUR"].includes(currency))
      throw Error("Choose a supported currency.");
    const hash = await digest(token);
    const existing = await ctx.db
      .query("boards")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (existing) return;
    await ctx.db.insert("boards", { hash, currency, createdAt: Date.now() });
  },
});
export const add = mutation({
  args: {
    token: v.string(),
    requestId: v.string(),
    name: v.string(),
    shop: v.string(),
    amount: v.number(),
    due: v.string(),
    policyUrl: v.string(),
  },
  handler: async (ctx, a) => {
    const hash = await digest(a.token);
    const b = await ctx.db
      .query("boards")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!b) throw Error("Board not found.");
    const requestId = clean(a.requestId, 64, "Request");
    const old = await ctx.db
      .query("purchases")
      .withIndex("by_request", (q) =>
        q.eq("boardId", b._id).eq("requestId", requestId),
      )
      .unique();
    if (old) return old._id;
    const items = await ctx.db
      .query("purchases")
      .withIndex("by_board", (q) => q.eq("boardId", b._id))
      .take(100);
    if (items.length >= 100)
      throw Error("This board has reached 100 purchases.");
    if (!Number.isSafeInteger(a.amount) || a.amount < 1 || a.amount > 100000000)
      throw Error("Enter an amount between 0.01 and 1,000,000.");
    if (a.policyUrl.length > 2000) throw Error("Policy link is too long.");
    if (!validDate(a.due)) throw Error("Choose a valid return deadline.");
    return await ctx.db.insert("purchases", {
      boardId: b._id,
      requestId,
      name: clean(a.name, 100, "Item"),
      shop: clean(a.shop, 80, "Shop"),
      amount: a.amount,
      due: a.due,
      policyUrl: safeUrl(a.policyUrl),
      stage: "decide",
      note: "",
      updatedAt: Date.now(),
    });
  },
});
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("purchases"),
    expectedAt: v.number(),
    stage: v.string(),
    note: v.string(),
  },
  handler: async (ctx, a) => {
    const hash = await digest(a.token);
    const b = await ctx.db
      .query("boards")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    const p = await ctx.db.get(a.id);
    if (!b || !p || p.boardId !== b._id) throw Error("Item not found.");
    if (!stages.includes(a.stage as any) || a.note.length > 1000)
      throw Error("Invalid update.");
    if (p.stage === a.stage && p.note === a.note.trim()) return;
    if (p.updatedAt !== a.expectedAt)
      throw Error(
        "This item changed in another tab. Read the latest version and try again.",
      );
    await ctx.db.patch(a.id, {
      stage: a.stage,
      note: a.note.trim(),
      updatedAt: Math.max(Date.now(), p.updatedAt + 1),
    });
  },
});

export const erase = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const hash = await digest(token);
    const b = await ctx.db
      .query("boards")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!b) return;
    const items = await ctx.db
      .query("purchases")
      .withIndex("by_board", (q) => q.eq("boardId", b._id))
      .take(101);
    for (const p of items) await ctx.db.delete(p._id);
    await ctx.db.delete(b._id);
  },
});

export const reservePolicy = internalMutation({
  args: { token: v.string(), id: v.id("purchases") },
  handler: async (ctx, a) => {
    const hash = await digest(a.token);
    const b = await ctx.db
      .query("boards")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    const p = await ctx.db.get(a.id);
    if (!b || !p || p.boardId !== b._id) throw Error("Item not found.");
    if (p.policyText) return null;
    if (!p.policyUrl) throw Error("Add a policy link first.");
    if (p.policyRequestedAt && Date.now() - p.policyRequestedAt < 60000)
      throw Error("Please wait a minute before retrying.");
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_key", (q) => q.eq("key", "policy-demo-budget"))
      .unique();
    if ((usage?.count ?? 0) >= 100)
      throw Error(
        "Free policy captures are used up. Open the shop policy instead.",
      );
    if (usage) await ctx.db.patch(usage._id, { count: usage.count + 1 });
    else await ctx.db.insert("usage", { key: "policy-demo-budget", count: 1 });
    await ctx.db.patch(p._id, {
      policyRequestedAt: Date.now(),
      policyError: undefined,
    });
    return { url: p.policyUrl };
  },
});
export const finishPolicy = internalMutation({
  args: { id: v.id("purchases"), text: v.string(), error: v.string() },
  handler: async (ctx, a) => {
    if (!(await ctx.db.get(a.id))) return;
    await ctx.db.patch(a.id, {
      policyText: a.text || undefined,
      policyFetchedAt: a.text ? Date.now() : undefined,
      policyError: a.error || undefined,
    });
  },
});
