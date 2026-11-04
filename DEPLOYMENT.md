# Deployment

This guide covers PlaceMellon's container image: where it's published, how
to run and configure it and how to check its health. The application needs
outbound HTTPS access to CMU Selects and its image CDN. It has no database,
API keys or persistent application data.

The commands here use Podman. Most work unchanged with Docker.

## Images

GitHub Actions publishes the production image to
`ghcr.io/cmu-web/cmu-web-placemellon` when a version tag (`v*`) is pushed, after
linting, formatting, type checking, tests and a build pass. Pushes and pull
requests run the same checks and build the image without publishing it. The
workflow is `.github/workflows/publish.yml`; it can also be run by hand from
the repository's **Actions** tab to build the current commit.

Releases are tagged from `main`; see
[Releasing](DEVELOPMENT.md#releasing).

| Tag            | Points to                         |
| -------------- | --------------------------------- |
| `latest`       | The most recent release           |
| `0.1.0`        | The build of version tag `v0.1.0` |
| `sha-<commit>` | The build of one commit           |

Tags move, so pin deployments to an image digest and update it deliberately:

```bash
podman pull ghcr.io/cmu-web/cmu-web-placemellon:latest
podman image inspect --format '{{.Digest}}' ghcr.io/cmu-web/cmu-web-placemellon:latest
```

Use the result as `ghcr.io/cmu-web/cmu-web-placemellon@sha256:...`.

The image is built for `linux/amd64`.

## Build the image yourself

To build from a checkout instead, from the repository root:

```bash
podman build --format docker -t localhost/placemellon:latest .
```

The Dockerfile compiles TypeScript in a build stage. The production image
contains the compiled server, production dependencies, Scotty assets and
documentation. It runs as the non-root `node` user. The Node base image is
pinned by digest, and npm is pinned to 12.2.1 in the shared base stage.
Update these pins deliberately when updating the tooling.

`--format docker` preserves the Dockerfile's `HEALTHCHECK`; Docker doesn't
need it. If building an OCI image instead, configure the health check in the runtime
or service definition; for a Quadlet, use `HealthCmd=`.

## Run the container

```bash
podman run -d --name placemellon \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/cmu-web/cmu-web-placemellon:latest
```

For an image you built yourself, use its local name instead, such as
`localhost/placemellon:latest`.
The binding exposes the service only on the host's loopback interface.
A reverse proxy on that host can forward public requests to it. To use a
different host port, change the first port number, for example
`-p 127.0.0.1:3001:3000`.

`/` serves the documentation bundled in the image, alongside the image URLs
and `/healthz`. The GitHub Pages copy of the documentation is for testing:
it updates on every push to `main`, before a release is deployed.

Restarting the container clears the image cache and
reloads the catalog from CMU Selects. Startup does not wait for that reload;
photo requests return 503 until the catalog is ready, while the
documentation (when served locally) and Scotty images remain available.

## Configuration

Pass environment variables with `-e NAME=value` or `--env-file PATH`.
[`.env.example`](.env.example) lists them with their defaults; copy it to
start an env file. These are all of the application's configuration
variables:

| Variable        | Default | Purpose                                                                                |
| --------------- | ------- | -------------------------------------------------------------------------------------- |
| `PORT`          | `3000`  | Port the application listens on inside the container                                   |
| `REFRESH_HOURS` | `6`     | Interval between catalog refreshes; preview-link expiry can trigger an earlier refresh |
| `CACHE_ENTRIES` | `256`   | Maximum number of rendered images cached in memory; `0` disables storage in this cache |

The production image also sets `NODE_ENV=production` for Express.
Use a valid TCP port and a positive number of refresh hours. If changing
`PORT`, update the container-side port in the published-port mapping too.

## Health checks

```bash
curl --fail --show-error http://127.0.0.1:3000/healthz
```

The response includes the photo count, counts by category and the last
successful refresh time. Status is 200 when the catalog contains photos
and 503 when it is empty. This measures catalog availability; it does not
fetch a photo or verify that every category has photos.

The image's health check uses Node to request `/healthz` every 30 seconds,
with a five-second timeout and a 60-second startup grace period. It reads
`PORT`, so it follows changes to the application's listening port.

Run the check manually:

```bash
podman healthcheck run placemellon
```

A nonempty catalog can still contain expired preview links if CMU Selects
is unavailable. When investigating photo failures, check the refresh time,
logs and an actual image response as well as `/healthz`.

## Logs and shutdown

```bash
podman logs --tail 100 placemellon
podman logs --follow placemellon
podman stop placemellon
```

The application logs catalog refresh results and image-rendering errors to
standard output and standard error, which the container runtime captures.

Under a Quadlet unit, the output goes to the journal. The unit is named
after its `.container` file; for `placemellon.container`, a rootless unit's
logs are at `journalctl --user -u placemellon`, run as the user that owns
the unit. For a system-wide unit, leave out `--user`.
