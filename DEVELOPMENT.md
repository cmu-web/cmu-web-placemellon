# Development

PlaceMellon is a TypeScript service built with Express and sharp. It keeps
its photo catalog and rendered image cache in memory, with no database or
API keys. Live photos come from CMU Selects and its image CDN. Tests use a
fake photo source.

## Set Up the Devcontainer

Use Docker and the VS Code Dev Containers extension. Open the repository
in VS Code and select **Dev Containers: Reopen in Container** from the
Command Palette.

The devcontainer uses the Dockerfile's `development` stage, with the same
Node and npm as production. The Dockerfile is the source of truth for the
Node version. Dependencies are installed with `npm ci` in a separate volume;
the checkout is mounted at `/app`, and commands run as the `node` user.

In the container terminal:

```bash
npx prek install
npm run dev
```

Open the forwarded address for port 3000 in VS Code's **Ports** panel.
If that port is already in use on the host, VS Code may forward another
local port. Opening the container does not start the server automatically.

`npm run dev` watches `src/` and restarts the service when TypeScript
changes. It also serves `docs/` at `/`; reload the browser after editing
those HTML, JavaScript or image files. Photos return 503 until the catalog
loads. Drawn placeholders and the documentation are available immediately.

Run `npm ci` after pulling dependency changes. After changing the Dockerfile
or devcontainer configuration, select **Dev Containers: Rebuild Container**.

## Where to Make Changes

| To Change                                         | Start Here                          |
| ------------------------------------------------- | ----------------------------------- |
| Image URLs, option validation or response caching | `src/app.ts`                        |
| Photo discovery, catalog refreshes or selection   | `src/widen.ts` and `src/catalog.ts` |
| Image rendering or placeholder artwork            | `src/render.ts` and `assets/`       |
| Documentation and examples                        | HTML pages in `docs/`               |
| The image builder or docs interactions            | `docs/js/`                          |
| Service tests                                     | `test/`                             |
| The runtime image or development environment      | `Dockerfile` and `.devcontainer/`   |
| Tooling checks or link preview generation         | `scripts/`                          |

## Maintain the CMU Web Preview

`docs/images/cmu-web-preview.webp` is this site's screenshot for cards and
gallery entries on the other CMU Web sites. Keep it at 1040 by 656 pixels,
without a decorative browser frame, and publish updates at the same path.
Consumers use the public URL directly. The Open Graph image,
`images/preview.jpg`, is maintained separately.

## Checks

```bash
npm run check
```

This checks the Node types version, ESLint, Prettier, link preview metadata
and TypeScript, then runs tests, compiles the service and checks the generated
color reference. CI runs the same
command in the Dockerfile's `test` stage. To reproduce that from the host:

```bash
podman build --target test .
```

Tests cover URL options, sizing, rendering, selection, caching and expired
preview links. They start local HTTP servers and require loopback ports.
They do not contact CMU Selects.

### Pre-commit Hooks

Enable hooks once per checkout in the environment where you make commits:

```bash
npx prek install
```

The hooks run linting, formatting and type checking. Relevant tooling
changes also trigger the Node version check. They use the npm dependencies
and Node installation available to Git; run them inside the devcontainer
when committing there.

To run all hooks manually:

```bash
npx prek run --all-files
```

Hooks cover part of the full check. Run `npm run check` before submitting.

### Linting and Formatting

```bash
npm run lint:fix
npm run format
```

Review the diff after applying fixes. `npm run lint` and
`npm run format:check` check without changing files. The devcontainer
includes ESLint and Prettier extensions and formats supported files on save.

After changing documentation titles or descriptions, run
`npm run opengraph` to refresh link preview metadata, then format the results.

The color table in `docs/reference.html` is generated from `COLORS` in
`src/render.ts`. After changing the palette, run `npm run docs`.
`npm run check:docs` checks that the table matches the renderer.

## Compile and Run

```bash
npm run build
npm start
```

The build compiles TypeScript from `src/` to CommonJS JavaScript in `dist/`.
`npm start` runs `dist/index.js`. Browser scripts in `docs/js/` have no
build step. Runtime settings are listed in
[Deployment](DEPLOYMENT.md#configuration); the service does not load an
`.env` file automatically.

## Update Node

Dependabot proposes Node changes through the Dockerfile's `FROM` line.
Update `@types/node` to the same major in that pull request; the
`check:node` command enforces the match. Rebuild the devcontainer and run
checks with the updated image. Keep the project on an even-numbered Node
release line; close proposals for odd-numbered lines.

## Releasing

A release publishes a container image to GitHub Container Registry.

1. Start from an up-to-date `main` with passing CI and a clean working tree.
2. Choose a major version for incompatible URL or option changes, a minor
   version for new features or runtime changes, or a patch for fixes and
   dependency updates.
3. Run `npm version major`, `npm version minor` or `npm version patch` with
   a Conventional Commits release message. For example:

   ```bash
   npm version minor -m "chore: release %s"
   ```

   This updates `package.json` and `package-lock.json`, creates a local
   commit and creates an annotated tag named for the version, like
   `1.4.0`, with no `v` prefix (set in `.npmrc`). Review the commit and
   tag before publishing.

4. Push `main` and the specific new tag together. The version tag starts
   the publishing workflow.
5. Confirm the workflow passed, add release notes and update deployments
   to the published image digest. See [Deployment](DEPLOYMENT.md#images).

Before pushing, correct any release preparation mistake locally and rerun
the checks. After publication, leave the tag in place and fix mistakes in
a new version.

## How the Service Works

The catalog lists photos from CMU Selects' category portals. It refreshes
every six hours by default and before signed preview links expire. These
are Widen application endpoints, so upstream changes may require changes
to `src/widen.ts`.

Selection narrows photos by category and orientation. Wide requests prefer
landscape photos, tall requests prefer portrait photos and near-square
requests use either. If the preferred orientation is unavailable, selection
uses all photos in the category. Rendezvous hashing scores photos by size
and photo ID to make selection stable as the catalog changes. Random
requests skip scoring.

Rendering fetches the smallest preview that covers the requested size.
Sharp crops photos with attention-based positioning and produces JPEG or
WebP. Scotty, profile pictures, bio placeholders and solid colors are
rendered as SVG or PNG without the catalog. The Scotty artwork,
`assets/scotty-head.svg`, is University Communications & Marketing's
[Scotty illustration](https://brand.cmu.edu/resources/downloads), the same
file QRnegie uses.
Dimension text in solid placeholders uses Open Sans, installed in the
container for PNG rendering; SVGs use the viewer's fonts.

Rendered images stay in an in-memory LRU cache, limited by `CACHE_ENTRIES`
and `CACHE_MB`; requests for an image that's still rendering share that
render. Requests to CMU Selects time out after 20 seconds.
Non-random responses allow browser and proxy caching for one day. Random
requests bypass the image cache and return `Cache-Control: no-store`.
The `X-Photo` response header identifies the source photo by filename.

A preview returning 403 or 404 triggers a catalog refresh and one retry.
Refresh failures preserve the previous catalog and schedule another
attempt. Nothing is written to disk.
