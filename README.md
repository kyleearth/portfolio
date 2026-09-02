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
| Cloudflare D1 voting schema | `cloudflare/travel-vote/migrations/0001_create_travel_votes.sql` |
| Cloudflare voting Worker | `cloudflare/travel-vote/src/index.ts` |

## Preview Locally

Ruby 3.0 or newer and Bundler are required.

```bash
bundle install
bundle exec ruby scripts/jekyll_local_preview.rb serve --config _config.yml,_config.dev.yml
```

Open [http://localhost:4000](http://localhost:4000). The development configuration removes the `/portfolio` path locally.

## Enable Shared Travel Voting

The Worker requires Node.js 22 or later.

1. Install the Worker dependencies and sign in to Cloudflare.
2. Create the D1 database and copy the returned database ID into `cloudflare/travel-vote/wrangler.jsonc`.
3. Apply the database migration and add a private `IP_HASH_SALT` secret.
4. Deploy the Worker, then copy its `workers.dev` URL into `travel_vote.url` in `_config.yml`.

```bash
cd cloudflare/travel-vote
npm install
npx wrangler login
npx wrangler d1 create travel-votes
# Update database_id in wrangler.jsonc with the ID printed above.
npx wrangler d1 migrations apply DB --remote
openssl rand -hex 32 | npx wrangler secret put IP_HASH_SALT
npx wrangler deploy
```

The browser receives only the Worker URL; it never receives a database credential. The Worker combines Cloudflare's connecting-IP header with an anonymous browser ID, creates a one-way HMAC hash, and enforces a maximum of five active votes per visitor hash. This keeps people on the same shared network from sharing one ballot. The database stores only the hash, destination name, and timestamp; it does not store raw IP addresses, browser IDs, names, email addresses, routes, or precise locations.

## Publish

The production configuration is set up for the `kyleearth/portfolio` GitHub Pages project site. Changes pushed to `main` can be published from **Settings > Pages > Deploy from a branch > main > /(root)**.

## License

Original portfolio content is copyright Kyle Wang. Open-source components retain their respective license notices in `LICENSE` and their source files.
