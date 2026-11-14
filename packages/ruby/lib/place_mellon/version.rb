# frozen_string_literal: true

require 'json'

module PlaceMellon
  GEM_ROOT = File.expand_path('../..', __dir__)
  # A built gem carries a VERSION file (rake version); a checkout reads the
  # app's package.json, so the gem and the app share one version
  VERSION = if File.file?(File.join(GEM_ROOT, 'VERSION'))
              File.read(File.join(GEM_ROOT, 'VERSION')).strip
            else
              JSON.parse(File.read(File.expand_path('../../package.json', GEM_ROOT))).fetch('version')
            end.freeze
end
