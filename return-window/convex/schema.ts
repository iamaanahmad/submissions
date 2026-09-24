import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  boards: defineTable({
    hash: v.string(),
    currency: v.string(),
    createdAt: v.number(),
  }).index("by_hash", ["hash"]),
  usage: defineTable({ key: v.string(), count: v.number() }).index("by_key", [
    "key",
  ]),
  purchases: defineTable({
    policyText: v.optional(v.string()),
    policyFetchedAt: v.optional(v.number()),
    policyRequestedAt: v.optional(v.number()),
    policyError: v.optional(v.string()),
    boardId: v.id("boards"),
    requestId: v.string(),
    name: v.string(),
    shop: v.string(),
    amount: v.number(),
    due: v.string(),
    stage: v.string(),
    note: v.string(),
    policyUrl: v.string(),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_request", ["boardId", "requestId"]),
});
