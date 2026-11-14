# frozen_string_literal: true

require_relative 'lib/place_mellon/version'

Gem::Specification.new do |spec|
  spec.name = 'cmu-web-placemellon'
  spec.version = PlaceMellon::VERSION
  spec.authors = ['Carnegie Mellon University']
  spec.summary = 'Placeholder image addresses from PlaceMellon, for Ruby and Rails'
  spec.description = 'Builds addresses for PlaceMellon, the Carnegie Mellon placeholder image service: campus photos, Scotty, profile pictures and solid colors at any size. Includes a Rails view helper.'
  spec.homepage = 'https://placemellon.andrew.cmu.edu/'
  spec.license = 'BSD-3-Clause'
  spec.required_ruby_version = '>= 3.2'

  # LICENSE and VERSION are copied in from the app by rake version
  spec.files = Dir['lib/**/*.rb'] + %w[LICENSE README.md VERSION]
  spec.require_paths = ['lib']
  spec.metadata = {
    'source_code_uri' => 'https://github.com/cmu-web/cmu-web-placemellon',
    'documentation_uri' => 'https://github.com/cmu-web/cmu-web-placemellon/tree/main/packages/ruby#readme',
    'bug_tracker_uri' => 'https://github.com/cmu-web/cmu-web-placemellon/issues',
    'rubygems_mfa_required' => 'true'
  }
end
