# Cloudflare D1 Voting Migration Design

## Goal

Replace the unavailable Supabase-backed Travel Footprint voting service with a free Cloudflare Worker and D1 database while preserving the public page's voting behaviour and privacy protections.

## Context

The deployed Travel Footprint page calls a Supabase Edge Function at a project hostname that no longer resolves in DNS. The static GitHub Pages site remains available, but its shared vote counter cannot reach the function or database.

The current application already has an appropriate client contract:

- `GET` returns destination totals, the current visitor's selected destinations, participant count, and ballot limits.
- `POST` with `destinations` replaces the current visitor's complete selection.
- The browser sends an anonymous `x-voter-id` value and never receives a database credential.

## Chosen Architecture

Use one Cloudflare Worker named `travel-vote` and one D1 SQLite database.

The Worker is the only component that accesses D1. It exposes the existing `GET`, `POST`, and `OPTIONS` endpoint behaviour from a public `workers.dev` URL. The Jekyll page stores that public URL as configuration and sends requests without a Supabase key.

The Worker permits browser requests only from:

- `https://kyleearth.github.io`
- `http://localhost:4000`
- `http://127.0.0.1:4000`

## Data Model

Create a `travel_votes` table with:

- `voter_hash TEXT NOT NULL`
- `destination TEXT NOT NULL`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- a composite primary key on `(voter_hash, destination)`
- a destination index for aggregate vote totals

`voter_hash` is an HMAC-SHA-256 digest of the client IP address and the anonymous browser ID. The Worker reads its `IP_HASH_SALT` only from a Cloudflare secret. The database stores no raw IP address, browser ID, name, email, route, or precise location.

## Request Behaviour

For every non-preflight request, the Worker:

1. Validates the request origin.
2. Obtains the client IP from Cloudflare's request headers and validates the optional anonymous browser ID.
3. Computes the salted HMAC voter hash.
4. Reads or writes D1 through prepared statements.

`GET` returns:

```json
{
  "totals": [{ "destination": "Japan", "vote_count": 3 }],
  "participant_count": 3,
  "selected": ["Japan"],
  "active_votes": 1,
  "remaining_votes": 4,
  "max_votes": 5
}
```

`POST` accepts `{ "destinations": ["Japan", "Chile"] }`. It validates that every destination is a non-empty string of at most 100 characters, removes duplicates, rejects a selection of more than five destinations, then atomically deletes and inserts that visitor's ballot using a D1 batch. It returns the same state payload as `GET`.

The Worker returns JSON errors for invalid origins, malformed selections, unavailable client IP addresses, unsupported methods, and internal failures. It does not expose database errors.

## Frontend Change

Retain the current DOM and request/response handling. Replace the Supabase-specific `data-supabase-function-url` and public-key configuration with one Worker endpoint setting. Remove the `apikey` request header. The existing user-facing temporary-unavailability message remains the fallback for network or server failures.

## Files and Boundaries

- `cloudflare/travel-vote/src/index.ts`: Worker request handling, CORS, validation, HMAC hashing, D1 operations, and response construction.
- `cloudflare/travel-vote/migrations/0001_create_travel_votes.sql`: D1 SQLite schema and indexes.
- `cloudflare/travel-vote/wrangler.jsonc`: Worker name, D1 binding placeholder, migration location, allowed origin configuration, and required-secret declaration.
- `cloudflare/travel-vote/test/index.test.ts`: Worker/D1 integration tests.
- `_config.yml`, `_pages/gallery.html`, and `assets/js/custom.js`: switch the page from Supabase configuration and headers to the Worker endpoint.
- `README.md`: local-development, Cloudflare login, D1 creation, migration, secret, deployment, and endpoint configuration instructions.

The existing `supabase/` directory remains during the migration as a historical reference. It can be removed only after the deployed Cloudflare service is verified.

## Testing and Verification

Tests use the Cloudflare Workers test environment and a local D1 database. They cover:

- allowed and rejected CORS origins;
- invalid request methods and payloads;
- a visitor creating, replacing, and clearing a ballot;
- maximum-five selection enforcement;
- aggregate totals and distinct participant counts;
- isolation between anonymous voter identities;
- correct response payloads and lack of leaked database error details.

Before release, run the Worker test suite, apply migrations to a local D1 database, build the Jekyll site, deploy using the account owner's Cloudflare browser login, apply the remote migration, configure `IP_HASH_SALT`, and make a public `GET` request to the deployed Worker.

## Deployment Constraints

- Use only Cloudflare's free Worker and D1 services.
- Use a `workers.dev` endpoint; no domain transfer or custom domain is required.
- Do not commit API tokens, Cloudflare account credentials, `.dev.vars`, or `IP_HASH_SALT`.
- The account owner completes browser authentication and any deployment confirmation.
