'use strict';

const elements = {
  repoLine: document.getElementById('repo-line'),
  tokenPill: document.getElementById('token-pill'),
  refresh: document.getElementById('refresh'),
  noticeCard: document.getElementById('notice-card'),
  noticeText: document.getElementById('notice-text'),
  form: document.getElementById('dispatch-form'),
  dispatch: document.getElementById('dispatch'),
  dispatchStatus: document.getElementById('dispatch-status'),
  runsBody: document.getElementById('runs-body'),
  runsStatus: document.getElementById('runs-status'),
  artifactsCard: document.getElementById('artifacts-card'),
  artifactsTitle: document.getElementById('artifacts-title'),
  artifacts: document.getElementById('artifacts'),
  closeArtifacts: document.getElementById('close-artifacts'),
};

let workflowUrl = null;

async function api(path, options) {
  const response = await fetch(path, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = (payload && payload.message) || `Request failed (${response.status})`;
    const error = new Error(message);
    error.code = payload && payload.error;
    throw error;
  }
  return payload;
}

function setStatus(element, message, kind) {
  element.textContent = message || '';
  element.classList.toggle('error', kind === 'error');
  element.classList.toggle('ok', kind === 'ok');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffMinutes < 60 * 24) return `${Math.round(diffMinutes / 60)} h ago`;
  return date.toLocaleString();
}

function statusPill(run) {
  const pill = document.createElement('span');
  const finished = run.status === 'completed';
  const conclusion = run.conclusion || '';

  if (!finished) {
    pill.className = 'pill pending';
    pill.textContent = run.status === 'queued' ? 'Queued' : 'Running';
  } else if (conclusion === 'success') {
    pill.className = 'pill success';
    pill.textContent = 'Success';
  } else if (conclusion === 'cancelled' || conclusion === 'skipped') {
    pill.className = 'pill neutral';
    pill.textContent = conclusion.charAt(0).toUpperCase() + conclusion.slice(1);
  } else {
    pill.className = 'pill failure';
    pill.textContent = conclusion ? conclusion.charAt(0).toUpperCase() + conclusion.slice(1) : 'Failed';
  }
  return pill;
}

async function loadConfig() {
  const config = await api('/api/config');

  elements.repoLine.textContent = config.repo
    ? `${config.repo} · ${config.workflow} · ref ${config.defaultRef}`
    : 'Repository unknown — set GH_REPO=owner/name on the service';
  workflowUrl = config.repo
    ? `https://github.com/${config.repo}/actions/workflows/${config.workflow}`
    : null;

  elements.tokenPill.className = `pill ${config.tokenConfigured ? 'success' : 'pending'}`;
  elements.tokenPill.textContent = config.tokenConfigured ? 'Token connected' : 'Token missing';

  elements.noticeCard.hidden = config.tokenConfigured;
  if (!config.tokenConfigured) {
    elements.noticeText.textContent =
      'Add a GITHUB_TOKEN secret with Actions read and write access for this repository. ' +
      'Until then, runs cannot be listed and builds cannot be dispatched.';
  }

  elements.form.ref.value = config.defaultRef;
  elements.dispatch.disabled = !config.tokenConfigured || !config.repo;
  elements.refresh.disabled = !config.tokenConfigured;
  return config;
}

function renderRuns(runs, emptyMessage = 'No runs yet — dispatch a build above.') {
  elements.runsBody.replaceChildren();

  if (!runs.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'run-meta';
    cell.textContent = emptyMessage;
    row.append(cell);
    elements.runsBody.append(row);
    return;
  }

  for (const run of runs) {
    const row = document.createElement('tr');

    const runCell = document.createElement('td');
    const title = document.createElement('div');
    title.className = 'run-title';
    if (run.url) {
      const link = document.createElement('a');
      link.href = run.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = `#${run.number}`;
      title.append(link, document.createTextNode(` ${run.title || ''}`.trimEnd()));
    } else {
      title.textContent = `#${run.number} ${run.title || ''}`.trimEnd();
    }
    const meta = document.createElement('div');
    meta.className = 'run-meta';
    meta.textContent = `${run.event} · ${formatTime(run.createdAt)}`;
    runCell.append(title, meta);

    const branchCell = document.createElement('td');
    branchCell.className = 'mono';
    branchCell.textContent = run.branch || '—';

    const statusCell = document.createElement('td');
    statusCell.append(statusPill(run));

    const startedCell = document.createElement('td');
    startedCell.className = 'run-meta';
    startedCell.textContent = formatTime(run.createdAt);

    const actionCell = document.createElement('td');
    const artifacts = document.createElement('button');
    artifacts.type = 'button';
    artifacts.className = 'btn ghost';
    artifacts.textContent = 'Artifacts';
    artifacts.addEventListener('click', () => loadArtifacts(run));
    actionCell.append(artifacts);

    row.append(runCell, branchCell, statusCell, startedCell, actionCell);
    elements.runsBody.append(row);
  }
}

async function loadRuns() {
  if (elements.refresh.disabled) {
    renderRuns([], 'Connect a GitHub token to list recent runs.');
    return;
  }
  setStatus(elements.runsStatus, 'Loading runs…');
  try {
    const data = await api('/api/runs');
    renderRuns(data.runs || []);
    setStatus(elements.runsStatus, `${(data.runs || []).length} most recent run(s)`);
  } catch (error) {
    renderRuns([]);
    setStatus(elements.runsStatus, error.message, 'error');
  }
}

async function loadArtifacts(run) {
  elements.artifactsCard.hidden = false;
  elements.artifactsTitle.textContent = `Artifacts — run #${run.number}`;
  elements.artifacts.replaceChildren();

  const loading = document.createElement('li');
  loading.textContent = 'Loading artifacts…';
  elements.artifacts.append(loading);

  try {
    const data = await api(`/api/runs/${run.id}/artifacts`);
    elements.artifacts.replaceChildren();

    if (!data.artifacts.length) {
      const empty = document.createElement('li');
      empty.textContent = run.status === 'completed'
        ? 'This run produced no artifacts.'
        : 'Artifacts appear when the run finishes.';
      elements.artifacts.append(empty);
      return;
    }

    for (const artifact of data.artifacts) {
      const item = document.createElement('li');

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = artifact.name;

      const meta = document.createElement('span');
      meta.className = 'run-meta';
      meta.textContent = artifact.expired
        ? `expired · ${formatBytes(artifact.sizeBytes)}`
        : `${formatBytes(artifact.sizeBytes)} · ${formatTime(artifact.createdAt)}`;

      const link = document.createElement('a');
      link.href = run.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = 'Download on GitHub →';

      item.append(name, meta, link);
      elements.artifacts.append(item);
    }
  } catch (error) {
    elements.artifacts.replaceChildren();
    const failed = document.createElement('li');
    failed.textContent = error.message;
    elements.artifacts.append(failed);
  }
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(elements.form);
  const body = Object.fromEntries(form.entries());

  elements.dispatch.disabled = true;
  setStatus(elements.dispatchStatus, 'Dispatching build…');

  try {
    const result = await api('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setStatus(elements.dispatchStatus, result.message, 'ok');
    setTimeout(loadRuns, 6000);
  } catch (error) {
    setStatus(elements.dispatchStatus, error.message, 'error');
  } finally {
    elements.dispatch.disabled = false;
  }
});

elements.refresh.addEventListener('click', loadRuns);
elements.closeArtifacts.addEventListener('click', () => {
  elements.artifactsCard.hidden = true;
});

(async function init() {
  try {
    await loadConfig();
    await loadRuns();
  } catch (error) {
    setStatus(elements.runsStatus, error.message, 'error');
  }
})();
