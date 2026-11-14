# PlaceMellon for Ruby and Rails

Placeholder images from [PlaceMellon](https://placemellon.andrew.cmu.edu/)
in Ruby code and Rails views: campus photos, Scotty, profile pictures, bio
placeholders and solid CMU colors, at any size. The gem only builds image
addresses. It never calls PlaceMellon itself, so it adds nothing to your
app's requests or tests.

The gem lives in the PlaceMellon repository's `packages/ruby/`. Each
PlaceMellon release publishes it at the same version.

## Install

Add it to your `Gemfile`, usually in the development group:

```ruby
gem 'cmu-web-placemellon', '~> 2.0'
```

## In Rails Views

Rails views get `placemellon_tag`. It takes a width, an optional height
(leave it out for a square), alt text and PlaceMellon's options; anything
else goes to `image_tag`:

```erb
<%= placemellon_tag 400, 300, alt: 'A campus photo', category: :campus %>
<%= placemellon_tag 96, alt: 'Scotty', scotty: true, format: :png, class: 'avatar' %>
<%= placemellon_tag 640, 360, alt: 'A placeholder', solid: true, text: true, color: 'carnegie-red' %>
```

Alt text is required.

## In Ruby

```ruby
require 'cmu-web-placemellon'

PlaceMellon.url(400, 300)                      # a photo
PlaceMellon.url(400, 300, category: :labs)     # from one category
PlaceMellon.url(400, 300, random: true)        # a different photo each time
PlaceMellon.url(400, 300, format: :webp)       # a smaller WebP photo
PlaceMellon.url(120, profile: true)            # a default profile picture
```

## Options

| Option          | Gives                                                               |
| --------------- | ------------------------------------------------------------------- |
| `category:`     | Photos from one category: `campus`, `classrooms`, `labs` or `life`  |
| `random: true`  | A different photo on each request                                   |
| `gray: true`    | A grayscale photo                                                   |
| `scotty: true`  | Scotty instead of a photo; add `gradient: true` for a gray gradient |
| `profile: true` | A default profile picture                                           |
| `bio: true`     | A bio placeholder                                                   |
| `solid: true`   | A solid color; add `color:` (a CMU brand color) and `text: true`    |
| `format:`       | `:jpg` or `:webp` for photos, `:svg` or `:png` for the others       |

Sizes are whole numbers from 1 to 2048. The gem checks sizes, option names
and formats; PlaceMellon checks the rest and explains any address it can't
draw. [PlaceMellon's site](https://placemellon.andrew.cmu.edu/) lists every
category and color.

To point at a local copy of PlaceMellon, set the host once:

```ruby
PlaceMellon.host = 'http://127.0.0.1:3000'
```

## Work on the Gem

```bash
cd packages/ruby
bundle install
bundle exec rake test build
```

`rake version` copies the app's license and its version from
`package.json` into the gem; `rake clean` removes them and the build.
