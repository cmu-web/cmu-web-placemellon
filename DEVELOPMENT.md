# Development

PlaceMellon is a TypeScript service built with Express and sharp. It has no
database and needs no API keys. Photo requests need access to CMU Selects
and its image CDN; the tests use a fake photo source and do not need either.

## Development environment

Develop in the devcontainer. Use Docker and install the VS Code Dev
Containers extension. Open the
repository in VS Code. From the VS Code Command Palette, select
**Dev Containers: Reopen in Container**.

The devcontainer builds the Dockerfile's `development` stage, so it has the
same Node and npm as the production image; the Dockerfile's `FROM` line is
the project's only Node version. It installs dependencies with `npm ci` and
runs as the `node` user. Git and curl are
included. The checkout is mounted at `/app`, and dependencies live in a
separate named volume so host and container installations stay separate.

Enable the [pre-commit hooks](#pre-commit-hooks) and start the server in
the container terminal:

```bash
npx prek install
npm run dev
```

The development command watches `src/` and restarts the server when
TypeScript changes. With `DOCS_URL` unset, the server serves the
documentation from `docs/`. Reload the browser after editing HTML,
JavaScript or images there.

VS Code forwards container port 3000; open the local address from its
**Ports** panel. If a host process already uses 3000, the forwarded port may
be 3001 or another available port. Opening the container does not start
the development server automatically.

Run `npm ci` in the container after pulling dependency changes. After
changing the Dockerfile or devcontainer configuration, use
**Dev Containers: Rebuild Container** from the Command Palette while
connected to the container.

The photo list loads in the background. Photo requests return 503 until it
is ready; the documentation, Scotty images and solid color placeholders work while it loads.

## Checks

### Pre-commit hooks

Prek is installed as an npm development dependency. After `npm ci`, enable
the hooks once per checkout, from the environment where you make commits:

```bash
npx prek install
```

The hooks in `.pre-commit-config.yaml` run ESLint, Prettier's formatting
check and TypeScript type checking before a commit. When the Dockerfile or
`package.json` changes, they also check that `@types/node` matches the
Dockerfile's Node version. They use the project's
npm commands and check the whole project. If a check fails, fix the reported
problems and retry the commit.

To run all hooks manually:

```bash
npx prek run --all-files
```

Inside the devcontainer, run these commands in its terminal. Prek uses the
Node installation and dependencies in the environment where Git runs.

### Full validation

```bash
npm run check
```

This runs the Node version check, ESLint, Prettier's check, type checking,
the tests and the build. CI runs the same command by building the
Dockerfile's `test` stage; to do that outside the devcontainer:

```bash
podman build --target test .
```

Tests cover URL options, sizing, image rendering, photo selection, caching
and expired preview links. They start local HTTP servers, so the environment
must allow binding to loopback ports.

### Linting and formatting

ESLint uses the recommended JavaScript and TypeScript rules in
`eslint.config.mjs`. It checks the service, tests, browser scripts and its
own configuration. Generated output is excluded.

Prettier uses `.prettierrc.json` for TypeScript, JavaScript, HTML, Markdown
and JSON. `.prettierignore` excludes generated output, the npm lockfile
and image assets. The devcontainer includes the ESLint and Prettier VS Code
extensions, selects Prettier as the formatter for these file types and
formats them on save.

To apply automatic fixes and formatting:

```bash
npm run lint:fix
npm run format
```

Review the resulting diff. ESLint reports problems it cannot fix
automatically; `npm run format:check` checks formatting without changing files.

## Compile and run

```bash
npm run build
npm start
```

`npm run build` runs `tsc`. The settings in `tsconfig.json` compile
`src/*.ts` into CommonJS JavaScript in `dist/`; `npm start` runs
`dist/index.js`. Edit the TypeScript source rather than the generated files.
The browser scripts in `docs/js/` are plain JavaScript and have no build step.

Environment variables and their defaults are listed in
[Deployment configuration](DEPLOYMENT.md#configuration).

## Updating Node

Dependabot proposes new Node release lines by updating the Dockerfile's
`FROM` line. In that pull request, update `@types/node` to the same major
version; `npm run check:node` fails until it matches. Node's odd-numbered
releases never get long-term support; close their pull requests, or comment
`@dependabot ignore this major version`.

## Releasing

A release publishes the production image to GitHub Container Registry; see
[Images](DEPLOYMENT.md#images) for its tags.

1. Release from an up-to-date `main` whose latest CI run has passed:

   ```bash
   git switch main
   git pull
   ```

2. Choose the version:
   - **Major** when an existing URL or option stops working or behaves
     differently.
   - **Minor** for new options, features or runtime changes, such as a new
     Node release line.
   - **Patch** for fixes and dependency updates.

3. Update the version in `package.json` and `package-lock.json`, commit it and
   create the matching annotated tag, then push both. Use `major`, `minor` or
   `patch`:

   ```bash
   npm version minor -m "chore: release %s"
   git push --follow-tags
   ```

   `npm version` needs a clean working tree. It replaces `%s` with the new
   version, and it only changes your local checkout. Don't edit the version in
   `package.json` by hand or create the tag yourself, or the file and the tag
   can disagree. The push is what starts the release.

   To undo before pushing, delete the tag and the commit, using the new version:

   ```bash
   git tag -d v0.5.0
   git reset --hard HEAD~1
   ```

   After pushing, `v*` tags can't be moved or deleted, so fix a bad release with
   a new version.

The workflow runs every check, then publishes the image and moves `latest`
to it. Update deployments' image digests to roll it out.

## Project structure

| Path                             | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `src/index.ts`                   | Starts the server and photo catalog                               |
| `src/app.ts`                     | Routes, option validation, response caching and health endpoint   |
| `src/widen.ts`                   | Lists photos and previews from the CMU Selects portals            |
| `src/catalog.ts`                 | Refreshes the catalog and selects photos                          |
| `src/render.ts`                  | Crops photos and renders Scotty and solid color images with sharp |
| `assets/`                        | Scotty vector artwork used by the service                         |
| `docs/`                          | User documentation, builder and browser assets                    |
| `test/app.test.ts`               | Service tests                                                     |
| `scripts/check-node-version.mjs` | Checks that `@types/node` matches the Dockerfile's Node version   |
| `dist/`                          | Generated server JavaScript; ignored by Git                       |

## How the service works

The catalog lists photos from CMU Selects' category portals and keeps the
list in memory. It refreshes every six hours by default, or sooner when
signed preview links are about to expire. The portal endpoints are Widen's
own application endpoints rather than a documented API; changes there may
require updates to `src/widen.ts`.

Photo selection first narrows the catalog by category and orientation.
Wide sizes use landscape photos, tall sizes use portrait photos and
near-square sizes use either. If no photo has the requested orientation,
selection falls back to the category's full list.

For a fixed size and category, rendezvous hashing scores each candidate by
the requested size and photo ID. The highest score wins. This keeps the
selection stable while limiting changes when photos are added or removed.
Random requests skip the scoring.

Rendering fetches the smallest preview that covers the requested size.
Sharp crops it using attention-based positioning and returns a JPEG.
Scotty images are rendered from SVG and returned as PNGs. The artwork is
traced from the [Scotty chatbot's avatar](https://www.cmu.edu/hr/images/scotty.png).
Solid color placeholders (`?solid`) are rendered locally as Steel Gray PNGs;
`?solid&text` adds dimensions centered near the top, using Open Sans like
the Web Kit's placeholders. The container installs the font for rendering.
Neither needs the photo catalog.

Recent rendered images stay in an in-memory LRU cache, limited by
`CACHE_ENTRIES`. Non-random responses allow browser and proxy caching for
one day. Random requests bypass the rendered-image cache and return
`Cache-Control: no-store`. The `X-Photo` response header identifies the
source photo by filename.

An expired preview returning 403 or 404 triggers a catalog refresh and one
retry. Refresh failures leave the existing catalog available, and the
catalog schedules another refresh. Nothing is written to disk.
