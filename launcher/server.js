'use strict';

/**
 * Recovery Builder Launcher
 *
 * Small dashboard for the GitHub Actions workflow in .github/workflows/build.yml:
 * it lists recent runs, shows their artifacts and dispatches new builds.
 *
 * Deliberately dependency-free (Node standard library only) so the service can
 * be started straight from the checkout with no install step.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..');

const WORKFLOW_FILE = 'build.yml';
const DEFAULT_REF = process.env.GH_DEFAULT_REF || 'main';
const BUILD_TARGETS = ['recoveryimage', 'bootimage', 'vendorbootimage'];

const OWNER_REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;
const MAX_BODY_BYTES = 8192;

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ------------------------------------------------------------------ *
 * Which repository does this dashboard talk to?
 * ------------------------------------------------------------------ */

function slugFromRemote(url) {
  const match = /[:/]([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

function detectRepo() {
  if (process.env.GH_REPO) return process.env.GH_REPO.trim();
  try {
    const config = fs.readFileSync(path.join(REPO_ROOT, '.git', 'config'), 'utf8');
    const origin = config.split(/^\[/m).find((section) => section.startsWith('remote "origin"'));
    const url = origin && /^\s*url\s*=\s*(\S+)/m.exec(origin);
    if (url) return slugFromRemote(url[1]);
  } catch {
    // No checkout mounted — GH_REPO has to be set instead.
  }
  return null;
}

const REPO = detectRepo();

/* ------------------------------------------------------------------ *
 * GitHub API
 * ------------------------------------------------------------------ */

function githubToken() {
  const value = process.env.GITHUB_TOKEN;
  return value && value.trim() ? value.trim() : null;
}

async function github(pathname, init = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'recovery-builder-launcher',
      Authorization: `Bearer ${githubToken()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  return { ok: response.ok, status: response.status, data };
}

/* ------------------------------------------------------------------ *
 * Small HTTP helpers
 * ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function guard(res) {
  if (!REPO) {
    sendJson(res, 500, {
      error: 'repo_unknown',
      message: 'Could not determine the GitHub repository. Set GH_REPO=owner/name.',
    });
    return false;
  }
  if (!githubToken()) {
    sendJson(res, 503, {
      error: 'token_missing',
      message: 'No GitHub token configured. Add GITHUB_TOKEN to the app secrets to list runs and start builds.',
    });
    return false;
  }
  return true;
}

function describeGithubFailure(data, status) {
  const message = (data && data.message) || `GitHub API responded with ${status}`;
  if (status === 401) return `${message} — the token is invalid or expired.`;
  if (status === 403) return `${message} — the token is missing the Actions permission.`;
  return message;
}

/* ------------------------------------------------------------------ *
 * API routes
 * ------------------------------------------------------------------ */

function handleConfig(res) {
  sendJson(res, 200, {
    repo: REPO,
    workflow: WORKFLOW_FILE,
    defaultRef: DEFAULT_REF,
    buildTargets: BUILD_TARGETS,
    tokenConfigured: Boolean(githubToken()),
  });
}

async function handleRuns(res) {
  if (!guard(res)) return;

  const result = await github(
    `/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=10`,
  );
  if (!result.ok) {
    sendJson(res, 502, {
      error: 'github_error',
      message: describeGithubFailure(result.data, result.status),
    });
    return;
  }

  const runs = (result.data.workflow_runs || []).map((run) => ({
    id: run.id,
    number: run.run_number,
    title: run.display_title,
    event: run.event,
    branch: run.head_branch,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    url: run.html_url,
    artifactsUrl: run.artifacts_url,
  }));

  sendJson(res, 200, { repo: REPO, runs });
}

async function handleArtifacts(res, runId) {
  if (!guard(res)) return;

  const result = await github(`/repos/${REPO}/actions/runs/${runId}/artifacts`);
  if (!result.ok) {
    sendJson(res, 502, {
      error: 'github_error',
      message: describeGithubFailure(result.data, result.status),
    });
    return;
  }

  const artifacts = (result.data.artifacts || []).map((artifact) => ({
    name: artifact.name,
    sizeBytes: artifact.size_in_bytes,
    expired: artifact.expired,
    createdAt: artifact.created_at,
  }));

  sendJson(res, 200, { runId, artifacts });
}

function validateDispatch(body) {
  const inputs = {
    device_tree: String(body.device_tree || '').trim(),
    device_branch: String(body.device_branch || '').trim(),
    build_target: String(body.build_target || '').trim(),
  };
  const ref = String(body.ref || DEFAULT_REF).trim();

  if (!OWNER_REPO_RE.test(inputs.device_tree)) {
    return { error: 'Device tree must be in owner/repo form (the workflow clones it from github.com).' };
  }
  if (!BRANCH_RE.test(inputs.device_branch)) {
    return { error: 'Device tree branch may only contain letters, numbers, dot, dash, underscore and slash.' };
  }
  if (!BUILD_TARGETS.includes(inputs.build_target)) {
    return { error: `Build target must be one of: ${BUILD_TARGETS.join(', ')}.` };
  }
  if (!BRANCH_RE.test(ref)) {
    return { error: 'Ref may only contain letters, numbers, dot, dash, underscore and slash.' };
  }
  return { inputs, ref };
}

async function handleDispatch(req, res) {
  if (!guard(res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: 'bad_request', message: error.message });
    return;
  }

  const validated = validateDispatch(body);
  if (validated.error) {
    sendJson(res, 400, { error: 'invalid_input', message: validated.error });
    return;
  }

  const result = await github(`/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: validated.ref, inputs: validated.inputs }),
  });

  if (!result.ok) {
    sendJson(res, 502, {
      error: 'github_error',
      message: describeGithubFailure(result.data, result.status),
    });
    return;
  }

  sendJson(res, 202, {
    dispatched: true,
    ref: validated.ref,
    inputs: validated.inputs,
    message: 'Build dispatched. The new run appears below once GitHub registers it.',
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/config' && req.method === 'GET') {
    handleConfig(res);
    return true;
  }
  if (url.pathname === '/api/runs' && req.method === 'GET') {
    await handleRuns(res);
    return true;
  }
  if (url.pathname === '/api/dispatch' && req.method === 'POST') {
    await handleDispatch(req, res);
    return true;
  }

  const artifactsMatch = /^\/api\/runs\/(\d+)\/artifacts$/.exec(url.pathname);
  if (artifactsMatch && req.method === 'GET') {
    await handleArtifacts(res, artifactsMatch[1]);
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ *
 * Static files
 * ------------------------------------------------------------------ */

function serveStatic(res, urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const target = path.join(PUBLIC_DIR, path.normalize(requested));

  if (!target.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  const type = STATIC_TYPES[path.extname(target)];
  if (!type) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (await handleApi(req, res, url)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    console.error('Unhandled request error:', error);
    sendJson(res, 500, { error: 'internal_error', message: 'Unexpected server error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Recovery Builder Launcher listening on http://${HOST}:${PORT}`);
  console.log(`  repository : ${REPO || 'unknown (set GH_REPO=owner/name)'}`);
  console.log(`  workflow   : ${WORKFLOW_FILE}`);
  console.log(`  token      : ${githubToken() ? 'configured' : 'missing'}`);
});
