# Kyle Wang | Portfolio

**Live site:** [kyleearth.github.io/portfolio](https://kyleearth.github.io/portfolio/)

## Website Sections

- **Home:** Research focus, experience, professional links, and current opportunities.
- **Publications:** Journal articles, conference papers, posters, extended abstracts, and work in progress.
- **Travel Footprint:** A privacy-conscious overview of visited destinations and an interactive destination poll.

## Update Content

| Content | File |
| --- | --- |
| Home page | `_pages/about.md` |
| Publications | `_pages/publications.md` |
| Travel page layout | `_pages/gallery.html` |
| Visited places | `_data/travel_gallery.yml` |
| Country reference list | `_data/world_countries.yml` |
| Main navigation | `_data/navigation.yml` |
| Site colors and layout | `_sass/_custom.scss` |
| Interactive behavior | `assets/js/custom.js` |
| Site-wide settings | `_config.yml` |
| Supabase voting setup | `supabase/migrations/20260723000000_create_travel_votes.sql` |
| Vote-limit Edge Function | `supabase/functions/travel-vote/index.ts` |

## Preview Locally

Ruby 3.0 or newer and Bundler are required.

```bash
bundle install
bundle exec ruby scripts/jekyll_local_preview.rb serve --config _config.yml,_config.dev.yml
```

Open [http://localhost:4000](http://localhost:4000). The development configuration removes the `/portfolio` path locally.

## Enable Shared Travel Voting

1. Link the local folder to the Supabase project.
2. Push the database migration in `supabase/migrations`.
3. Add an `IP_HASH_SALT` secret containing at least 32 random characters.
4. Deploy `supabase/functions/travel-vote` with JWT verification disabled, as configured in `supabase/config.toml`.
5. Confirm the public project URL, publishable key, and function URL in `_config.yml`.

```bash
npx supabase login
npx supabase link --project-ref usvuxozvlrtahmuxrija
npx supabase db push
npx supabase secrets set IP_HASH_SALT="$(openssl rand -hex 32)" --project-ref usvuxozvlrtahmuxrija
npx supabase functions deploy travel-vote --project-ref usvuxozvlrtahmuxrija --no-verify-jwt
```

The browser uses only the Supabase publishable key. Never add a secret key or service-role key to this repository. The Edge Function combines the visitor address from Supabase's forwarded IP header with an anonymous browser ID, creates a one-way HMAC hash, and enforces a maximum of five active votes per visitor hash. This keeps people on the same shared network from sharing one ballot. The database stores only the hash, destination name, and timestamp; it does not store raw IP addresses, browser IDs, names, email addresses, routes, or precise locations.

## Publish

The production configuration is set up for the `kyleearth/portfolio` GitHub Pages project site. Changes pushed to `main` can be published from **Settings > Pages > Deploy from a branch > main > /(root)**.

## License

Original portfolio content is copyright Kyle Wang. Open-source components retain their respective license notices in `LICENSE` and their source files.
