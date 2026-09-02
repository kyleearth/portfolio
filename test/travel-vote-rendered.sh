#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
output_dir=$(mktemp -d /private/tmp/travel-vote-rendered.XXXXXX)
ruby_prefix=$(brew --prefix ruby@3.1)
llvm_prefix=$(brew --prefix llvm)

PATH="$llvm_prefix/bin:$ruby_prefix/bin:$PATH" \
  "$ruby_prefix/bin/bundle" exec jekyll build \
  --config "$repo_root/_config.yml,$repo_root/_config.dev.yml" \
  --destination "$output_dir" \
  --source "$repo_root" >/dev/null

rendered_page="$output_dir/travel/index.html"

test -f "$rendered_page"
rg -q 'data-travel-vote-url="https://travel-vote\.[^"]+\.workers\.dev"' "$rendered_page"
! rg -q 'data-supabase-' "$rendered_page"
