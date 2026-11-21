# Deployment

## Release Files

Each version tag (e.g., `1.4.0`) publishes:

- **A container image,** `ghcr.io/cmu-web/cmu-web-placemellon`, built for
  `linux/amd64`, with these tags:

  | Image Tag      | What                                      |
  | -------------- | ----------------------------------------- |
  | `X.Y.Z`        | The build of version tag `X.Y.Z`          |
  | `latest`       | The most recent version-tag build         |
  | `sha-<commit>` | A build identified by its short commit ID |

- **A Ruby gem,** `cmu-web-placemellon`, at the same version, for building
  PlaceMellon addresses in Ruby and Rails; see
  [its README](packages/ruby/README.md).

## Install

PlaceMellon runs as a container with no database or saved data. It reaches
CMU Selects and its image CDN over outbound HTTPS.

### In a Container

```sh
docker run -d --name placemellon \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/cmu-web/cmu-web-placemellon:latest
```

Podman takes the same flags. For a deployment, pin the image by its digest,
so it's explicit, and keep the previous digest for rolling back:

```sh
docker pull ghcr.io/cmu-web/cmu-web-placemellon:latest
docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/cmu-web/cmu-web-placemellon:latest
```

Then run `ghcr.io/cmu-web/cmu-web-placemellon@sha256:...` in place of
`:latest`. The port binding exposes the service on the host's loopback
interface, for a reverse proxy in front of it; change the first port number
to use a different host port.

The container serves the documentation at `/`, image URLs such as `/400/300`
and the catalog's health at `/healthz`. It loads the photo catalog in the
background at startup. Photo requests return 503 until it's ready, and a
failed load is tried again within minutes; the documentation and drawn
placeholders work right away. Restarting clears the catalog and the image
cache.

### Configuration

Pass settings with `-e NAME=value` or `--env-file PATH`.
[`.env.example`](.env.example) is a starting point for an environment file.

| Variable        | Default | Purpose                                                                               |
| --------------- | ------- | ------------------------------------------------------------------------------------- |
| `PORT`          | `3000`  | Listening port inside the container                                                   |
| `REFRESH_HOURS` | `6`     | Hours between catalog refreshes; expiring preview links can trigger earlier refreshes |
| `CACHE_ENTRIES` | `256`   | Maximum rendered images in memory; `0` turns this cache off                           |
| `CACHE_MB`      | `64`    | Most memory the image cache uses, in megabytes                                        |

Use a valid TCP port, a positive refresh interval and whole numbers of zero
or more for the cache settings. If you change `PORT`, change the container's
side of the port mapping too. The image sets `NODE_ENV=production` for
Express.

### Build From Source

From the repository root:

```sh
docker build --target test .
docker build -t localhost/placemellon:latest .
```

With Podman, add `--format docker` to the second command, so the image keeps
the Dockerfile's health check. Use `localhost/placemellon:latest` in the run
command.

The image holds the compiled TypeScript, production dependencies, vector
artwork and documentation, and runs as the non-root `node` user. The
Dockerfile pins the Node base image by digest and pins npm.

### Update

Pull the new release, record its digest and run it in place of the old one,
then check the service (below). If it fails, go back to the previous digest.

## Check the Service

```sh
curl --fail --show-error http://127.0.0.1:3000/healthz
curl --fail --show-error http://127.0.0.1:3000/400/300 -o /tmp/placemellon-check.jpg
```

`/healthz` returns the number of photos, the count in each category and the
last successful refresh. It returns 200 for a catalog with photos and 503 for
an empty one. It doesn't fetch a photo or promise that every category is
ready, so check a real image too.

The Dockerfile's health check requests `/healthz` every 30 seconds, with a
five-second timeout and a 60-second grace period at startup, and follows
`PORT`. Docker runs it on its own;
`docker inspect --format '{{.State.Health.Status}}' placemellon` shows the
result. With Podman, `podman healthcheck run placemellon` runs it. A runtime
that ignores the Dockerfile's health check needs the same check set up
itself.

### Investigate Failures

```sh
docker logs --tail 100 placemellon
docker logs --follow placemellon
```

The service logs catalog refreshes and rendering errors to standard output
and standard error. A catalog can have photos while their signed preview
links have expired, so for photo failures, check the refresh time, the logs
and an image response together.

To stop the service, run `docker stop placemellon`.
