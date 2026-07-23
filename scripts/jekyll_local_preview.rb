# frozen_string_literal: true

ENV["PAGES_DISABLE_NETWORK"] = "1"

require "bundler/setup"
require "jekyll-github-metadata"

Jekyll::GitHubMetadata::Client.class_eval do
  def internet_connected?
    false
  end
end

load Gem.bin_path("jekyll", "jekyll")
