# frozen_string_literal: true

module PlaceMellon
  # A view helper for Rails, included in every view by the Railtie
  module Helper
    # <%= placemellon_tag 400, 300, alt: 'Campus', category: :campus %>
    # Takes PlaceMellon's options, and image_tag's for everything else.
    # Alt text is required.
    def placemellon_tag(width, height = nil, alt:, **options)
      image = options.slice(:format, *VALUES, *FLAGS)
      html = options.except(*image.keys)
      image_tag(PlaceMellon.url(width, height, **image), alt: alt, width: width, height: height || width, **html)
    end
  end
end
