# Production authoring

The demo reads public documents from Sanity project gdohz22j, dataset production. No write credentials ship to visitors. The initial sample was written through the authenticated Sanity API; its temporary editor token was revoked after seeding.

For editorial authoring, create a standard Sanity Studio with the official Sanity CLI, select this project and dataset, and import schemaTypes from schema.js into schema.types. Studio uses Sanity's authenticated access; only project members can edit. The workbench reads published documents on load. Local rehearsal changes deliberately do not write to shared data.

The schema models physical props, ordered scenes, timed cues with references, crew handoffs, and a production with ordered cue references. Reset time belongs to the physical prop. Timing collisions need cross-document checks and are enforced by the workbench engine; schema validation handles required references and valid intervals.
