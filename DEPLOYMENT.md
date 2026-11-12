# Deployment

PlaceMellon runs as a container with no database or persistent application
data. It uses outbound HTTPS to reach CMU Selects and its image CDN.
The commands below use Podman; Docker can also build and run the image.

## Images

The [publishing workflow](.github/workflows/publish.yml) runs all checks
and builds the production image. It publishes to
`ghcr.io/cmu-web/cmu-web-placemellon` for version tags, such as `1.4.0`, and
manual workflow runs. Ordinary branch pushes and pull requests build
without publishing.

| Image Tag      | Meaning                                   |
| -------------- | ----------------------------------------- |
| `latest`       | Most recently published version-tag build |
| `X.Y.Z`        | Build of release tag `X.Y.Z`              |
| `sha-<commit>` | Build identified by its short commit hash |

A manual run publishes the commit image without moving `latest`. The
workflow builds for `linux/amd64`. To create a versioned release, follow
[Development](DEVELOPMENT.md#releasing).

For a deployment, pull the selected release and record its digest:

```bash
podman pull ghcr.io/cmu-web/cmu-web-placemellon:latest
podman image inspect --format '{{.Digest}}' ghcr.io/cmu-web/cmu-web-placemellon:latest
```

Use `ghcr.io/cmu-web/cmu-web-placemellon@sha256:...` to pin that exact
image. Save the previous digest so you can redeploy it if needed.

## Run the Container

```bash
podman run -d --name placemellon \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/cmu-web/cmu-web-placemellon:latest
```

For a deployment, replace `:latest` with the recorded digest. The port
binding exposes the service on the host's loopback interface; a reverse
proxy can forward public requests to it. Change the first port number to
use a different host port.

The container serves documentation at `/`, image URLs such as `/400/300`
and catalog health at `/healthz`. Startup loads the catalog in the
background. Photo requests return 503 until it is ready; documentation and
drawn placeholders remain available. Restarting clears the catalog and
rendered image cache.

## Configuration

Pass settings with `-e NAME=value` or `--env-file PATH`.
[`.env.example`](.env.example) is a starting point for an env file.

| Variable        | Default | Purpose                                                                               |
| --------------- | ------- | ------------------------------------------------------------------------------------- |
| `PORT`          | `3000`  | Listening port inside the container                                                   |
| `REFRESH_HOURS` | `6`     | Hours between catalog refreshes; expiring preview links can trigger earlier refreshes |
| `CACHE_ENTRIES` | `256`   | Maximum rendered images in memory; `0` disables this cache                            |

Use a valid TCP port, a positive refresh interval and a nonnegative whole
number of cache entries. If changing `PORT`, update the container-side port
in the mapping too. The image sets `NODE_ENV=production` for Express.

## Check the Service

```bash
curl --fail --show-error http://127.0.0.1:3000/healthz
curl --fail --show-error http://127.0.0.1:3000/400/300 -o /tmp/placemellon-check.jpg
```

`/healthz` returns photo counts, counts by category and the last successful
refresh time. It returns 200 for a nonempty catalog and 503 for an empty
one. It does not fetch a photo or guarantee that every category is ready,
so check an actual image response too.

The Dockerfile's health check requests `/healthz` every 30 seconds, with
a five-second timeout and a 60-second startup grace period. It follows
`PORT`. Where the runtime supports that health check, run it manually with:

```bash
podman healthcheck run placemellon
```

For OCI images that omit the Dockerfile health check, configure an
equivalent in the container runtime or service definition.

### Investigate Failures

```bash
podman logs --tail 100 placemellon
podman logs --follow placemellon
```

The application logs catalog refreshes and rendering errors to standard
output and standard error. A catalog can be nonempty while its signed
preview links have expired. For photo failures, check the refresh time,
logs and image response together.

To stop the service:

```bash
podman stop placemellon
```

## Build From Source

From the repository root:

```bash
podman build --target test .
podman build --format docker -t localhost/placemellon:latest .
```

Use `localhost/placemellon:latest` in the run command. `--format docker`
preserves the Dockerfile's `HEALTHCHECK` when building with Podman; omit
that flag with Docker.

The production image contains compiled TypeScript, production dependencies,
vector artwork and documentation. It runs as the non-root `node` user.
The Dockerfile pins the Node base image by digest and pins npm in the
shared base stage.
