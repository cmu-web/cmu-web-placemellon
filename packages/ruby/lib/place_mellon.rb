# frozen_string_literal: true

require 'uri'
require_relative 'place_mellon/version'

# Addresses for PlaceMellon's placeholder images
# (https://placemellon.andrew.cmu.edu/). Only builds URLs; it never calls the
# service, which checks the options itself.
module PlaceMellon
  # The largest width or height the service draws
  MAX = 2048
  # Options with a value: a photo category, or a solid color
  VALUES = %i[category color].freeze
  # Options that are on or off
  FLAGS = %i[random scotty profile bio solid text gradient gray].freeze
  FORMATS = %i[jpg webp svg png].freeze

  class << self
    # The service the addresses point to; set it for a local copy
    attr_writer :host

    def host
      @host || 'https://placemellon.andrew.cmu.edu'
    end

    # PlaceMellon.url(400, 300, category: :campus)
    # PlaceMellon.url(96, scotty: true, format: :png)
    # A height left out makes a square.
    def url(width, height = nil, format: nil, **options)
      sizes = [width, height].compact.map { |size| check_size(size) }
      unknown = options.keys - VALUES - FLAGS
      raise ArgumentError, "Unknown PlaceMellon option: #{unknown.first}" if unknown.any?
      if format && !FORMATS.include?(format.to_sym)
        raise ArgumentError, "PlaceMellon format must be one of #{FORMATS.join(', ')}"
      end

      sizes[-1] = "#{sizes[-1]}.#{format}" if format
      query = options.filter_map do |key, value|
        if VALUES.include?(key)
          "#{key}=#{URI.encode_www_form_component(value.to_s)}" unless value.nil?
        elsif value
          key.to_s
        end
      end
      "#{host.chomp('/')}/#{sizes.join('/')}#{"?#{query.join('&')}" if query.any?}"
    end

    private

    def check_size(size)
      return size if size.is_a?(Integer) && size.between?(1, MAX)

      raise ArgumentError, "PlaceMellon sizes are whole numbers from 1 to #{MAX}, not #{size.inspect}"
    end
  end
end

require_relative 'place_mellon/helper'
require_relative 'place_mellon/railtie' if defined?(Rails::Railtie)
