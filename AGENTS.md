# AGENTS.md

## What this repository is

There is **no application code** here. The project is a GitHub Actions recipe
(`.github/workflows/build.yml`) that syncs the SHRP-Reborn AOSP manifest, clones
a Motorola `boston` device tree and runs `mka recoveryimage` on `ubuntu-22.04`
runners, uploading `.img`/`.zip` artifacts. The README's AWS/Telegram/S3 claims
are documentation only — no such code exists in this repo.

The AOSP build cannot run in this sandbox (tens of GB of source, a multi-hour
x86 toolchain build), so "running" this project means dispatching that workflow
on GitHub.

## Running it here

`launcher/` is the only runnable surface: a dependency-free Node dashboard that
lists workflow runs, shows their artifacts and dispatches new builds.

```bash
docker compose -f docker-compose.base44.yml up -d --build
# dashboard: http://localhost:3000   (host port 3000 == the preview entry point)
curl -s localhost:3000/api/config
```

- The service runs from the bind-mounted checkout with `node --watch`, so edits
  under `launcher/` reload without rebuilding. `docker compose restart launcher`
  is only needed if the process wedges.
- No `npm install` step exists or is required: `server.js` uses Node's standard
  library only (`node:http`, `node:fs`, global `fetch`). Do not add dependencies
  without a real need — it would also require an install step in the compose
  command.
- The target repository is detected at runtime from the mounted checkout's
  `.git/config` (`origin` URL). Override with `GH_REPO=owner/name` when there is
  no checkout to read.

## Credentials

`GITHUB_TOKEN` (Actions read/write) is required for anything that talks to the
GitHub API. It is **optional at boot**: without it the dashboard still serves and
shows a "Token missing" notice, `/api/runs`, `/api/runs/<id>/artifacts` and
`/api/dispatch` return `503 token_missing`. It is delivered from the platform's
managed env file (`/run/base44/app.env`), which is the **last** `env_file` entry
so the user's dashboard value always wins.

`workflow_dispatch` only works against a ref where `build.yml` exists — the
default branch (`main`) — hence the form's default ref.

## Sandbox notes

- No `BASE44_PREVIEW_MODE` override is needed. The server binds `0.0.0.0` and
  performs no Host/Origin validation, so no allowlist gating is required and its
  behavior is identical whether the flag is set to `"1"` or unset.
- The dashboard has no login of its own. It only mutates GitHub state through the
  single `build.yml` workflow, with inputs validated against the workflow's own
  choice list.

## Verifying a change

There is no test suite. Check the served page and the API directly:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/            # 200
curl -s localhost:3000/api/config                                  # JSON, 200 even without a token
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/runs    # 503 without a token, 200 with one
docker compose -f docker-compose.base44.yml ps                     # launcher healthy
```

Do not dispatch real builds just to test: a run occupies GitHub runners for
hours. Invalid input is rejected with `400` before any GitHub call — reachable
with a throwaway token on a spare port, e.g.
`docker compose … exec -T launcher sh -c 'PORT=3999 GITHUB_TOKEN=dummy node server.js &'`.
With no token configured, every GitHub-backed route answers `503 token_missing`
while the page itself still serves.
