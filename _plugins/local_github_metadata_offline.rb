# frozen_string_literal: true

return unless ENV["PAGES_DISABLE_NETWORK"] == "1"

Jekyll::Hooks.register :site, :after_init do
  next unless defined?(Jekyll::GitHubMetadata::Client)

  Jekyll::GitHubMetadata::Client.class_eval do
    def internet_connected?
      false
    end
  end
end
