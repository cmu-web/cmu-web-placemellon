# frozen_string_literal: true

require 'minitest/autorun'
require 'action_view'
require_relative '../lib/cmu-web-placemellon'

class HelperTest < Minitest::Test
  class View
    include ActionView::Helpers::AssetTagHelper
    include PlaceMellon::Helper
  end

  def tag(...)
    View.new.placemellon_tag(...)
  end

  def test_an_image_tag_with_size_and_alt_text
    html = tag(400, 300, alt: 'Campus', category: :campus, class: 'hero')
    assert_includes html, 'src="https://placemellon.andrew.cmu.edu/400/300?category=campus"'
    assert_includes html, 'alt="Campus"'
    assert_includes html, 'width="400"'
    assert_includes html, 'height="300"'
    assert_includes html, 'class="hero"'
  end

  def test_a_square_gets_both_dimensions
    html = tag(96, alt: 'Scotty', scotty: true, format: :png)
    assert_includes html, 'src="https://placemellon.andrew.cmu.edu/96.png?scotty"'
    assert_includes html, 'height="96"'
  end

  def test_alt_text_is_required
    assert_raises(ArgumentError) { tag(400, 300) }
  end
end
