# frozen_string_literal: true

module PlaceMellon
  # Makes placemellon_tag available in Rails views
  class Railtie < ::Rails::Railtie
    initializer 'place_mellon.helper' do
      ActiveSupport.on_load(:action_view) { include PlaceMellon::Helper }
    end
  end
end
