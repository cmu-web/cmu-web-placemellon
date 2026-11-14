# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../lib/cmu-web-placemellon'

class UrlTest < Minitest::Test
  BASE = 'https://placemellon.andrew.cmu.edu'

  def teardown
    PlaceMellon.host = nil
  end

  def test_a_photo_at_a_size
    assert_equal "#{BASE}/400/300", PlaceMellon.url(400, 300)
  end

  def test_a_square
    assert_equal "#{BASE}/200", PlaceMellon.url(200)
  end

  def test_options_with_values_and_flags
    assert_equal "#{BASE}/400/300?category=campus&random", PlaceMellon.url(400, 300, category: :campus, random: true)
    assert_equal "#{BASE}/400/300?solid&text&color=carnegie-red",
                 PlaceMellon.url(400, 300, solid: true, text: true, color: 'carnegie-red')
  end

  def test_false_and_nil_options_are_left_out
    assert_equal "#{BASE}/400/300", PlaceMellon.url(400, 300, random: false, category: nil)
  end

  def test_a_file_type
    assert_equal "#{BASE}/96.png?scotty", PlaceMellon.url(96, scotty: true, format: :png)
    assert_equal "#{BASE}/400/300.webp", PlaceMellon.url(400, 300, format: 'webp')
  end

  def test_another_host
    PlaceMellon.host = 'http://127.0.0.1:3000/'
    assert_equal 'http://127.0.0.1:3000/10/20', PlaceMellon.url(10, 20)
  end

  def test_rejects_bad_sizes_options_and_formats
    [0, 2049, 1.5, '400'].each { |size| assert_raises(ArgumentError) { PlaceMellon.url(size) } }
    assert_raises(ArgumentError) { PlaceMellon.url(400, colour: 'black') }
    assert_raises(ArgumentError) { PlaceMellon.url(400, format: :gif) }
  end

  def test_version_matches_the_app
    app = JSON.parse(File.read(File.expand_path('../../../package.json', __dir__))).fetch('version')
    assert_equal app, PlaceMellon::VERSION
  end
end
