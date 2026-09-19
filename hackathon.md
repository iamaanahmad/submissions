# Hackathon log

- **Project:** Return Window
- **Event:** Convex All Gas Hackathon
- **What it does:** Shared household return tracking with deadlines, handoff notes, refund stages, and saved shop policies.
- **Live app:** https://brazen-newt-717.convex.site
- **Repo:** https://github.com/iamaanahmad/submissions
- **Frontend:** Convex static hosting
- **Convex deployment:** https://brazen-newt-717.convex.cloud
- **Components:** @convex-dev/static-hosting
- **Convex features:** schema, tables, indexes, queries, mutations, actions, realtime queries
- **Auth:** Other
- **AI models:** none
- **Started:** 2026-09-19T11:42:42Z
- **Last updated:** 2026-09-19T11:46:00Z

## Log

### 2026-09-19 - 6d51a00
Built the new Return Window app inside `return-window/`. Other projects in this repository are outside this entry. OpenAI Codex used the official Convex coding plugin. There is no runtime AI model or AgentMail integration.

Convex stores boards, purchases, and bounded policy-capture usage. Capability links grant shared access; their hashes stay server-side. Indexed queries, validated mutations, idempotent creation, and stale-update checks protect shared work. Firecrawl captures public shop policy text through a server-side action. Users set their own verified deadlines.

Deployed the backend and frontend. All 13 automated tests and the production build pass. Live browser checks verified creation, purchase addition, real Firecrawl capture, saved notes, refund totals, and updates in a separate browser context. This is deployment evidence, not a contest submission receipt.

### 2026-09-19 - working tree
Prepared public judge instructions and a short demonstration. Contest registration, personal eligibility, required social publication, and the submission receipt remain pending.
