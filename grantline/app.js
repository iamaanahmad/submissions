let grants = [];
let sampleMode = false;
let latestReport = null;
let currentFilter = 'all';
const $ = (id) => document.getElementById(id);

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV has an unfinished quoted field.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV needs a header and at least one grant.');
  const keys = rows.shift().map(key => key.trim().replace(/^\uFEFF/, ''));
  return rows.map(values => Object.fromEntries(keys.map((key, index) => [key, (values[index] || '').trim()])));
}

function showError(message) { $('form-error').textContent = message || ''; }

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function renderCards() {
  const target = $('cards');
  target.replaceChildren();
  const filtered = latestReport.results.filter(row => currentFilter === 'all' || row.status === currentFilter);
  if (!filtered.length) target.append(make('p', 'caution', 'No decisions in this view.'));
  filtered.forEach((row, index) => {
    const card = make('article', 'card');
    const top = make('div', 'card-top');
    top.append(make('span', 'card-number', String(index + 1).padStart(2, '0')));
    const body = make('div', 'card-main');
    body.append(make('h4', '', row.title));
    const source = make('p', 'card-source');
    source.append(document.createTextNode(`${row.funder || 'Unknown funder'} · `));
    if (sampleMode) source.append(document.createTextNode('Fictional source'));
    else if (row.source_url && /^https?:\/\//i.test(row.source_url)) {
      const link = make('a', '', 'Open source ↗');
      link.href = row.source_url;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      source.append(link);
    } else source.append(document.createTextNode('No valid source'));
    body.append(source); top.append(body);
    top.append(make('span', `badge ${row.status === 'excluded' ? 'excluded' : ''}`, row.status === 'candidate' ? 'CANDIDATE' : 'EXCLUDED'));
    card.append(top);
    const details = make('div', 'card-details');
    row.reasons.forEach(reason => details.append(make('span', 'reason', reason)));
    if (row.status === 'candidate') details.append(make('span', 'score', `${row.score}/100`));
    card.append(details); target.append(card);
  });
}

function renderReport(report) {
  latestReport = report;
  $('empty-state').hidden = true;
  $('report').hidden = false;
  $('result-state').textContent = 'REVIEW COMPLETE';
  $('report-org').textContent = report.organization;
  $('candidate-count').textContent = report.candidates;
  $('excluded-count').textContent = report.excluded;
  $('review-date').textContent = report.evaluated_on;
  $('sample-warning').hidden = !sampleMode;
  renderCards();
}

$('grant-file').addEventListener('change', async (event) => {
  showError('');
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 1_000_000) { showError('Grant file must be under 1 MB.'); return; }
  try {
    const content = await file.text();
    const parsed = file.name.toLowerCase().endsWith('.json') ? JSON.parse(content) : parseCSV(content);
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 500) throw new Error('File needs 1 to 500 grant records.');
    grants = parsed;
    sampleMode = false;
    document.querySelector('.upload-note').textContent = `${grants.length} records loaded from ${file.name}.`;
  } catch (error) { grants = []; showError(error.message); }
});

$('sample-button').addEventListener('click', async () => {
  showError('');
  try {
    const response = await fetch('/api/demo');
    if (!response.ok) throw new Error('Could not load sample.');
    const demo = await response.json();
    $('org-name').value = demo.organization.name;
    $('org-region').value = demo.organization.region;
    $('org-focus').value = demo.organization.focus;
    $('org-need').value = demo.organization.funding_need;
    $('grant-file').value = '';
    grants = demo.grants;
    sampleMode = true;
    document.querySelector('.upload-note').textContent = `${grants.length} fictional records loaded for testing.`;
    $('brief-form').requestSubmit();
  } catch (error) { showError(error.message); }
});

$('brief-form').addEventListener('submit', async (event) => {
  event.preventDefault(); showError('');
  if (!grants.length) { showError('Import a grant file or load the fictional sample.'); return; }
  const organization = {
    name: $('org-name').value.trim(), region: $('org-region').value.trim(),
    focus: $('org-focus').value.trim(), funding_need: Number($('org-need').value)
  };
  const button = $('analyze-button'); button.disabled = true;
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization, grants })
    });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || 'Review failed.');
    renderReport(report);
    if (window.innerWidth < 900) $('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; }
});

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button));
  if (latestReport) renderCards();
}));

$('download-trace').addEventListener('click', () => {
  if (!latestReport) return;
  const lines = latestReport.trace.map(row => JSON.stringify(row)).join('\n') + '\n';
  const blob = new Blob([lines], { type: 'application/x-ndjson' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `grantline-trace-${latestReport.evaluated_on}.jsonl`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
