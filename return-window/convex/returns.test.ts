/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { validDate, daysLeft, safeUrl, ical } from "../src/domain";
const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./convex.config.ts",
]);
const token = "a".repeat(64),
  other = "b".repeat(64);
const input = {
  token,
  requestId: "first",
  name: "Test shoes",
  shop: "Test shop",
  amount: 4999,
  due: "2026-09-22",
  policyUrl: "https://example.com/returns",
};
describe("private shared board", () => {
  it("creates once and isolates other links", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    await t.mutation(api.returns.create, { token, currency: "USD" });
    expect((await t.query(api.returns.load, { token }))?.currency).toBe("INR");
    expect(await t.query(api.returns.load, { token: other })).toBeNull();
  });
  it("deduplicates a retried purchase", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    const a = await t.mutation(api.returns.add, input);
    const b = await t.mutation(api.returns.add, input);
    expect(a).toBe(b);
    expect((await t.query(api.returns.load, { token }))?.items).toHaveLength(1);
  });
  it("rejects writes from another board", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    await t.mutation(api.returns.create, { token: other, currency: "INR" });
    const id = await t.mutation(api.returns.add, input);
    await expect(
      t.mutation(api.returns.update, {
        token: other,
        id,
        expectedAt: 0,
        stage: "refunded",
        note: "",
      }),
    ).rejects.toThrow("Item not found");
  });
  it("rejects stale writes without losing the saved change", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    const id = await t.mutation(api.returns.add, input);
    const p = (await t.query(api.returns.load, { token }))!.items[0];
    await t.mutation(api.returns.update, {
      token,
      id,
      expectedAt: p.updatedAt,
      stage: "pack",
      note: "By the door",
    });
    await expect(
      t.mutation(api.returns.update, {
        token,
        id,
        expectedAt: p.updatedAt,
        stage: "sent",
        note: "stale",
      }),
    ).rejects.toThrow("another tab");
    expect((await t.query(api.returns.load, { token }))!.items[0].note).toBe(
      "By the door",
    );
  });
  it("rejects invalid dates, amounts and executable links", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    for (const patch of [
      { due: "2026-02-30" },
      { amount: -1 },
      { amount: 1.5 },
      { policyUrl: "javascript:alert(1)" },
      { name: "" },
    ])
      await expect(
        t.mutation(api.returns.add, { ...input, ...patch }),
      ).rejects.toThrow();
    expect((await t.query(api.returns.load, { token }))!.items).toHaveLength(0);
  });
  it("deletes only the requested board and invalidates its link", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    await t.mutation(api.returns.create, { token: other, currency: "USD" });
    await t.mutation(api.returns.add, input);
    await t.mutation(api.returns.erase, { token });
    expect(await t.query(api.returns.load, { token })).toBeNull();
    expect((await t.query(api.returns.load, { token: other }))?.currency).toBe(
      "USD",
    );
    expect(
      await t.run((ctx) => ctx.db.query("purchases").collect()),
    ).toHaveLength(0);
  });
  it("rejects malformed capability tokens", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.returns.load, { token: "guess" })).rejects.toThrow(
      "Invalid board",
    );
  });
});
describe("dates and exports", () => {
  it("validates leap dates and year boundaries", () => {
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2026-02-29")).toBe(false);
    expect(daysLeft("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysLeft("2026-09-18", "2026-09-19")).toBe(-1);
  });
  it("exports an all-day calendar event and escapes content", () => {
    const s = ical("Shirt, navy; size M", "2026-09-22");
    expect(s).toContain("DTSTART;VALUE=DATE:20260922");
    expect(s).toContain("Shirt\\, navy\\; size M");
  });
  it("rejects embedded credentials and preserves safe links", () => {
    expect(() => safeUrl("https://me:secret@example.com")).toThrow();
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
});

describe("policy capture controls", () => {
  it("requires ownership and reserves each capture once", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    const id = await t.mutation(api.returns.add, input);
    await expect(
      t.mutation(internal.returns.reservePolicy, { token: other, id }),
    ).rejects.toThrow("Item not found");
    expect(
      await t.mutation(internal.returns.reservePolicy, { token, id }),
    ).toEqual({ url: input.policyUrl });
    await expect(
      t.mutation(internal.returns.reservePolicy, { token, id }),
    ).rejects.toThrow("wait a minute");
    await t.mutation(internal.returns.finishPolicy, {
      id,
      text: "Return within 30 days",
      error: "",
    });
    expect(
      await t.mutation(internal.returns.reservePolicy, { token, id }),
    ).toBeNull();
    expect((await t.query(api.returns.load, { token }))!.items[0].due).toBe(
      input.due,
    );
  });
  it("stops external requests at the free demo budget", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    const id = await t.mutation(api.returns.add, input);
    await t.run((ctx) =>
      ctx.db.insert("usage", { key: "policy-demo-budget", count: 100 }),
    );
    await expect(
      t.mutation(internal.returns.reservePolicy, { token, id }),
    ).rejects.toThrow("used up");
  });
  it("records capture failure without claiming saved evidence", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.returns.create, { token, currency: "INR" });
    const id = await t.mutation(api.returns.add, input);
    await t.mutation(internal.returns.finishPolicy, {
      id,
      text: "",
      error: "Unavailable",
    });
    const p = (await t.query(api.returns.load, { token }))!.items[0];
    expect(p.policyText).toBeUndefined();
    expect(p.policyError).toBe("Unavailable");
    expect(p.due).toBe(input.due);
  });
});
