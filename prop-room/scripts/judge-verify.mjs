import assert from 'node:assert/strict';
import {analyze, alternatives, readiness, validateSaved} from '../src/lib/engine.mjs';

// Public fictional records only. This check never writes to Sanity.
const endpoint = new URL('https://gdohz22j.api.sanity.io/v2025-02-19/data/query/production');
endpoint.searchParams.set('perspective', 'published');
endpoint.searchParams.set('query', `{
  "production": *[_id == "production-last-platform"][0],
  "props": *[_type == "prop"],
  "scenes": *[_type == "scene"] | order(order asc),
  "cues": *[_type == "cue"]{..., "propId": prop._ref, "sceneId": scene._ref} | order(start asc)
}`);

try {
  const response = await fetch(endpoint, {signal: AbortSignal.timeout(10000)});
  assert.equal(response.status, 200, `Sanity returned HTTP ${response.status}`);
  const {result: data} = await response.json();
  assert.equal(data?.production?._id, 'production-last-platform', 'Published production is missing');
  assert.equal(data.props?.length, 5, 'Expected five published props');
  assert.equal(data.scenes?.length, 3, 'Expected three published scenes');
  assert.equal(data.cues?.length, 6, 'Expected six published cues');
  for (const list of [data.props, data.scenes, data.cues]) {
    assert.equal(new Set(list.map(item => item._id)).size, list.length, 'Document IDs must be unique');
  }
  for (const prop of data.props) {
    assert.ok(Number.isFinite(prop.resetMinutes) && prop.resetMinutes >= 0, 'Invalid prop reset time');
  }
  assert.ok(validateSaved({version: 1, cues: data.cues}, data), 'Published cue fields or references are invalid');
  assert.deepEqual(analyze(data.cues, data.props).map(issue => issue.type).sort(), ['overlap', 'reset']);

  const rehearsal = structuredClone(data.cues);
  const substitutions = [];
  for (const id of ['cue-03', 'cue-05']) {
    const cue = rehearsal.find(item => item._id === id);
    assert.ok(cue, `Missing demonstration cue ${id}`);
    const spare = alternatives(cue, rehearsal, data.props)[0];
    assert.ok(spare, `No safe substitute for ${id}`);
    substitutions.push({cue: id, from: cue.propId, to: spare._id});
    cue.propId = spare._id;
    cue.confirmed = false;
  }
  assert.equal(analyze(rehearsal, data.props).length, 0, 'Substitutions must resolve both conflicts');
  assert.equal(readiness(rehearsal, data.props).ready, false, 'Unconfirmed handoffs must block readiness');
  rehearsal.forEach(cue => { cue.confirmed = true; });
  assert.equal(readiness(rehearsal, data.props).ready, true);
  const recovered = validateSaved(JSON.parse(JSON.stringify({version: 1, cues: rehearsal})), data);
  assert.deepEqual(recovered, rehearsal, 'Rehearsal must survive serialization');
  console.log(JSON.stringify({
    status: 'passed', checkedAt: new Date().toISOString(), source: endpoint.origin,
    publishedDocuments: 15, conflictsBefore: 2, conflictsAfter: 0,
    confirmedHandoffs: 6, substitutions, writes: 0,
    limits: 'Checks live data and engine behavior. Does not test browser storage, hosting, or contest submission.'
  }, null, 2));
} catch (error) {
  console.error(`Live judge check failed: ${error.message}`);
  console.error('No offline fallback was used. Check connectivity and published sample records, then retry.');
  process.exitCode = 1;
}
