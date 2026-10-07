/// <reference types="node" />
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
export const capture = action({
  args: { token: v.string(), id: v.id("purchases") },
  handler: async (ctx, a): Promise<void> => {
    const reserved = await ctx.runMutation(internal.returns.reservePolicy, a);
    if (!reserved) return;
    try {
      const key = process.env.FIRECRAWL_API_KEY;
      if (!key) throw Error("Unavailable");
      const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: reserved.url,
          formats: ["markdown"],
          onlyMainContent: true,
          timeout: 30000,
        }),
        signal: AbortSignal.timeout(35000),
      });
      if (!response.ok) throw Error("Unavailable");
      const data = await response.json();
      if (
        !data.success ||
        typeof data.data?.markdown !== "string" ||
        !data.data.markdown.trim()
      )
        throw Error("Empty policy");
      await ctx.runMutation(internal.returns.finishPolicy, {
        id: a.id,
        text: data.data.markdown.slice(0, 18000),
        error: "",
      });
    } catch {
      await ctx.runMutation(internal.returns.finishPolicy, {
        id: a.id,
        text: "",
        error:
          "We could not capture this page. Open the shop policy and confirm the date yourself.",
      });
    }
  },
});
