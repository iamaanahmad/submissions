# Prop Room

A theatre rehearsal workbench built with Astro and Sanity for the September 2026 DEV Sanity Challenge, Path Two.

## Run

Node 22.12 or later. Run npm ci, npm test, npm run dev. Production: npm run build; deploy dist to a static host. No secret is needed to read the public sample.

## Judge walkthrough

1. Load the board. It reads six published cues, three scenes and five props from Sanity. The source label identifies live versus offline data.
2. Review the conflicts. The ivory umbrella has only one minute to reset, but needs four. Assign the red umbrella. The brass lantern overlaps its earlier cue. Assign the tin lantern.
3. Confirm the four remaining handoffs. The board reports zero timing conflicts and six confirmed handoffs.
4. Add a cue or edit timing to create a new collision. Review the warning. Undo reverses the edit.
5. Refresh. The local rehearsal survives. Print the crew sheet, including unresolved warnings and reset notes.

## Sanity

Project gdohz22j, dataset production. Fifteen fictional documents were created for this entry: one production, three scenes, five props and six cues. studio/schema.js defines models and validation. scripts/seed.ndjson is an importable copy, and scripts/seed.mjs reproduces it. Do not import over an active production without checking document IDs.

The frontend makes a real public GROQ request on load. It rehearses changes locally and labels that boundary. It does not offer shared multi-user updates. Samples contain fictional names only. The initial editor token was revoked. No write key is embedded in source.

## Checks and limitations

npm test covers collisions, substitutions, exact reset boundaries, nested overlaps, handoff readiness, and invalid saved data. npm run build verifies the Astro bundle. The engine checks every pair of bookings for a physical prop, including nonadjacent nested bookings. This is a small rehearsal tool (100 cues maximum), not a full scheduling suite.

AI assisted the code, original sample data, design and documentation. No claims of real theatre adoption are made. Demo hosting is configured in .openai/hosting.json.
