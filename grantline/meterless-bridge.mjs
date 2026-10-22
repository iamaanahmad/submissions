// Grantline's local bridge to the unmodified Meterless World Model reference.
// Its Apache-2.0 source and license live in vendor/meterless.
import { WorldModel } from './vendor/meterless/world-model.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const report = JSON.parse(input);
const world = new WorldModel({ namespace: 'grantline-review', storage: 'memory' });
const at = `${report.evaluated_on}T00:00:00.000Z`;
const source = { kind: 'manual', at, by: 'grantline-review' };
const org = await world.upsertEntity({
  type: 'organization',
  externalKey: { system: 'grantline', id: report.organization },
  name: report.organization,
  source,
});

for (const [index, result] of report.results.entries()) {
  const grant = await world.upsertEntity({
    type: 'grant',
    externalKey: { system: 'grantline', id: result.id },
    name: result.title,
    attrs: { funder: result.funder, source_url: result.source_url, deadline: result.deadline },
    source: { ...source, url: result.source_url },
  });
  // A repeated source ID is one grant, but each review still needs its own trace.
  const review = await world.upsertEntity({
    type: 'review',
    externalKey: { system: 'grantline', id: `${report.evaluated_on}:${index + 1}` },
    name: `${result.title} review ${index + 1}`,
    attrs: { source_id: result.id, score: result.score },
    source: { ...source, url: result.source_url },
  });
  await world.assertFact({
    about: review.id, predicate: 'review_status', value: result.status,
    confidence: 1, source: { ...source, url: result.source_url },
  });
  await world.assertFact({
    about: review.id, predicate: 'review_reasons', value: result.reasons,
    confidence: 1, source: { ...source, url: result.source_url },
  });
  await world.relate({
    from: org.id, to: review.id, type: 'ran-review', source,
  });
  await world.relate({
    from: review.id, to: grant.id, type: 'reviews', source,
  });
}

const shape = world.stateShape();
process.stdout.write(JSON.stringify({
  engine: 'Meterless World Model reference',
  entity_count: shape.entities.length,
  relation_count: shape.relationships.length,
  fact_count: shape.facts.length,
  event_count: world.events().length,
  snapshot: shape,
}));
