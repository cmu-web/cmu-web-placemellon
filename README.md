# PlaceMellon

Placeholder images for Carnegie Mellon websites and apps.
Give it a width and height, and it returns a CMU photo cropped to that size.
It also provides grayscale images, random photos and Scotty images and
profile pictures, plus solid color placeholders with optional dimension text.

PlaceMellon is inspired by [PlaceCats](https://www.placecats.com/) and
[PlaceBear](https://placebear.com/): put a size in a URL and get a placeholder image.

Photos come from University Communications & Marketing's CMU Selects
collection. Use them for Carnegie Mellon work; see the
[photo source and usage information](https://placemellon.andrew.cmu.edu/about.html).

## Get started

Put a PlaceMellon URL in an image tag:

```html
<img src="https://placemellon.andrew.cmu.edu/400/300" alt="Placeholder photo of Carnegie Mellon" />
```

This returns a photo 400 pixels wide and 300 pixels tall. The same size gets
the same photo unless you select the random option or the photo collection
changes.

In the [image builder](https://placemellon.andrew.cmu.edu/builder.html), choose a size and options, preview the image and copy its URL or HTML. The [options reference](https://placemellon.andrew.cmu.edu/options.html)
covers categories, random photos, grayscale, Scotty and solid color placeholders.

For a solid color placeholder, use `/400/300?solid`. Add `&text` to show
its dimensions: `/400/300?solid&text`. These images work without loading
the photo collection. The default color is Steel Gray.

Photos are JPEGs; add `.webp` after the size for a smaller WebP file:
`/400/300.webp?category=campus`. Scotty, profile pictures and solid colors
are SVG, so they stay sharp at any size; add `.png` after the size for a PNG
instead, such as for email: `/400/300.png?solid&text`.

For Scotty on plain white instead of a gradient, as a placeholder logo, use
`/150?scotty&white`.

## Support

Report problems or suggest changes in
[GitHub issues](https://github.com/cmu-web/cmu-web-placemellon/issues).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull
request; it covers commit messages and style conventions too.
[DEVELOPMENT.md](DEVELOPMENT.md) explains local setup, the devcontainer,
tests and how the service works.

## Deployment

PlaceMellon is published as a container image on GitHub Container Registry.
To run your own, follow [DEPLOYMENT.md](DEPLOYMENT.md) for the image,
configuration and health checks.

## License

The code is copyright Carnegie Mellon University and licensed under the
[BSD 3-Clause License](LICENSE). That license does not cover CMU's names
and marks, including the Scotty artwork, or the CMU Selects photos.

The [Bunsen Honeydew photo](docs/images/bunsen-honeydew.jpg) is by
[MuppetsStudio](https://commons.wikimedia.org/wiki/File:Dr._Bunsen_Honeydew.png),
licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/),
and cropped for the documentation site.
