# Cloudflare D1 Voting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreachable Supabase vote service with a Cloudflare Worker backed by a D1 database, without changing the Travel Footprint voting experience.

**Architecture:** A dedicated Worker project owns CORS, voter hashing, validation, D1 access, and JSON responses. The GitHub Pages frontend invokes its public `workers.dev` URL without database credentials. D1 stores only salted anonymous voter hashes and selected destinations.

**Tech Stack:** TypeScript, Cloudflare Workers, Cloudflare D1 (SQLite), Wrangler, Vitest, `@cloudflare/vitest-plugin`, Jekyll.

**Spec:** `docs/superpowers/specs/2026-09-02-cloudflare-d1-voting-design.md`

## Global Constraints

- Use Node.js 20 or newer for the Worker project.
- Keep the existing Supabase files until the Cloudflare deployment has been manually verified.
- Store `IP_HASH_SALT` only as a Cloudflare Worker secret or in ignored local development variables.
- Permit only `https://kyleearth.github.io`, `http://localhost:4000`, and `http://127.0.0.1:4000` as browser origins.
- Preserve the existing `GET` and `POST { destinations: string[] }` response contract and its five-selection maximum.
- Do not commit the generated D1 database ID until it is known; deploy configuration must use an explicit `REPLACE_WITH_D1_DATABASE_ID` marker that the account owner replaces after `wrangler d1 create`.

---

## File Structure

- `cloudflare/travel-vote/package.json`: isolated Worker development dependencies and test/deploy scripts.
- `cloudflare/travel-vote/wrangler.jsonc`: Worker entrypoint, D1 binding, migrations directory, CORS origins, and required secret declaration.
- `cloudflare/travel-vote/vitest.config.ts`: execute the tests in the Workers runtime with local D1 storage.
- `cloudflare/travel-vote/migrations/0001_create_travel_votes.sql`: SQLite schema and indexes.
- `cloudflare/travel-vote/src/index.ts`: Worker API implementation.
- `cloudflare/travel-vote/test/index.test.ts`: end-to-end Worker and D1 tests.
- `.gitignore`: ignore Worker-local variables and Wrangler state.
- `_config.yml`, `_pages/gallery.html`, `assets/js/custom.js`: remove Supabase browser configuration and use the Worker endpoint.
- `README.md`: Cloudflare account setup, D1 creation, secret configuration, deploy, and verification instructions.

### Task 1: Create the isolated Worker test harness and SQLite schema

**Files:**
- Create: `cloudflare/travel-vote/package.json`
- Create: `cloudflare/travel-vote/tsconfig.json`
- Create: `cloudflare/travel-vote/wrangler.jsonc`
- Create: `cloudflare/travel-vote/vitest.config.ts`
- Create: `cloudflare/travel-vote/migrations/0001_create_travel_votes.sql`
- Create: `cloudflare/travel-vote/test/schema.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces D1 binding `DB` and Worker secret binding `IP_HASH_SALT` for later source and tests.
- Produces a local migration at `migrations/0001_create_travel_votes.sql` for both Vitest and remote deployment.

- [ ] **Step 1: Add a failing schema test**

```ts
import { describe, expect, it } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";

describe("travel-vote schema", () => {
  it("enforces one vote per destination for each voter", async () => {
    await applyD1Migrations(env.DB, "./migrations");
    await env.DB.prepare(
      "INSERT INTO travel_votes (voter_hash, destination) VALUES (?, ?)",
    ).bind("a".repeat(64), "Japan").run();

    await expect(
      env.DB.prepare(
        "INSERT INTO travel_votes (voter_hash, destination) VALUES (?, ?)",
      ).bind("a".repeat(64), "Japan").run(),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Add the Worker package and test configuration, then run the test to verify it fails because the migration is missing**

Create `package.json` with `test: "vitest run"`, `test:watch: "vitest"`, `typecheck: "tsc --noEmit"`, `dev: "wrangler dev"`, and `deploy: "wrangler deploy"`. Add current `wrangler`, `typescript`, `vitest`, `@cloudflare/vitest-plugin`, and `@cloudflare/workers-types` development dependencies. Configure Vitest with `defineWorkersConfig` from `@cloudflare/vitest-plugin/config` and point its Worker pool at `wrangler.jsonc`.

Run: `npm install && npm test -- schema.test.ts`

Expected: FAIL because `migrations/0001_create_travel_votes.sql` does not yet exist.

- [ ] **Step 3: Add the minimal D1 migration and Worker configuration**

```sql
CREATE TABLE travel_votes (
  voter_hash TEXT NOT NULL CHECK (length(voter_hash) = 64),
  destination TEXT NOT NULL CHECK (length(destination) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (voter_hash, destination)
);

CREATE INDEX travel_votes_destination_idx ON travel_votes (destination);
CREATE INDEX travel_votes_voter_hash_idx ON travel_votes (voter_hash);
```

Set the D1 binding to `DB`, database name to `travel-votes`, `database_id` to `REPLACE_WITH_D1_DATABASE_ID`, `migrations_dir` to `migrations`, and required secrets to `["IP_HASH_SALT"]`. Add `cloudflare/travel-vote/.dev.vars*` and `cloudflare/travel-vote/.wrangler/` to `.gitignore`.

- [ ] **Step 4: Run the schema test and static checks**

Run: `npm test -- schema.test.ts`

Expected: PASS; the duplicate insert fails because the composite primary key is enforced.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the harness and schema**

```bash
git add .gitignore cloudflare/travel-vote
git commit -m "feat: add Cloudflare D1 voting schema"
```

### Task 2: Implement and test the Worker voting API

**Files:**
- Create: `cloudflare/travel-vote/src/index.ts`
- Create: `cloudflare/travel-vote/test/index.test.ts`

**Interfaces:**
- Consumes `env.DB: D1Database`, `env.IP_HASH_SALT: string`, and the Task 1 `travel_votes` schema.
- Produces the public Worker `fetch(request, env)` handler.
- Produces `GET` state `{ totals, participant_count, selected, active_votes, remaining_votes, max_votes }` and `POST { destinations }` replacement behaviour.

- [ ] **Step 1: Write failing API tests for the existing public contract**

```ts
it("returns a zero-vote state for a new visitor", async () => {
  const response = await SELF.fetch("https://worker.test", {
    headers: {
      Origin: "https://kyleearth.github.io",
      "CF-Connecting-IP": "203.0.113.10",
      "x-voter-id": "11111111-1111-4111-8111-111111111111",
    },
  });

  await expect(response.json()).resolves.toMatchObject({
    totals: [], participant_count: 0, selected: [], active_votes: 0,
    remaining_votes: 5, max_votes: 5,
  });
});

it("replaces a ballot atomically and reports aggregate totals", async () => {
  const response = await SELF.fetch("https://worker.test", {
    method: "POST",
    headers: {
      Origin: "https://kyleearth.github.io",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
      "x-voter-id": "11111111-1111-4111-8111-111111111111",
    },
    body: JSON.stringify({ destinations: ["Japan", "Chile"] }),
  });

  await expect(response.json()).resolves.toMatchObject({
    selected: ["Chile", "Japan"], active_votes: 2, remaining_votes: 3,
  });
});
```

Add separate tests for `OPTIONS`, disallowed origins, absent client IP, malformed JSON, non-string/empty/overlong destination values, more than five unique selections, duplicate destination deduplication, a second visitor's isolation, clearing a ballot with an empty array, distinct participant counts, and unsupported methods.

- [ ] **Step 2: Run the API tests to verify they fail because no Worker handler exists**

Run: `npm test -- index.test.ts`

Expected: FAIL with an import or missing-worker-entrypoint error.

- [ ] **Step 3: Implement the smallest Worker API that satisfies the tests**

Implement focused helpers in `src/index.ts`:

```ts
const MAX_VOTES = 5;

type VoteTotal = { destination: string; vote_count: number };
type VoteState = {
  totals: VoteTotal[];
  participant_count: number;
  selected: string[];
  active_votes: number;
  remaining_votes: number;
  max_votes: number;
};
```

Use `corsHeaders(request)`, `json(request, body, status)`, `clientIp(request)`, `voterId(request)`, `voterHash(ip, voterId, salt)`, `getState(db, hash)`, and `replaceVotes(db, hash, destinations)` with the signatures and return types implied by the test cases and `VoteState`. `clientIp` must prefer `CF-Connecting-IP` and fall back to the first `x-forwarded-for` value; `voterId` must accept only UUID-like lowercase hexadecimal values and otherwise return `legacy`; and `voterHash` must use Web Crypto HMAC-SHA-256 to return a 64-character lowercase hexadecimal digest.

Use parameter-bound statements exclusively. `getState` must query destination totals ordered by descending count then ascending destination, count distinct voter hashes, and list the current hash's destinations ordered alphabetically. `replaceVotes` must place `DELETE FROM travel_votes WHERE voter_hash = ?` and every subsequent insert in one `env.DB.batch()` call, then calculate the returned state only after that batch succeeds. Return generic `vote_service_error` for uncaught storage failures.

- [ ] **Step 4: Run the Worker tests and typecheck**

Run: `npm test`

Expected: PASS; all request, validation, ballot, aggregate, origin, and privacy tests pass.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the Worker API**

```bash
git add cloudflare/travel-vote
git commit -m "feat: add Cloudflare travel vote worker"
```

### Task 3: Point the Jekyll frontend at the Worker

**Files:**
- Modify: `_config.yml:18-23`
- Modify: `_pages/gallery.html:28-33`
- Modify: `assets/js/custom.js:62-63,385-393,410,533`

**Interfaces:**
- Consumes the Worker `GET`/`POST` contract from Task 2.
- Produces `data-travel-vote-url` in the rendered travel page.

- [ ] **Step 1: Write a failing regression check for the rendered frontend contract**

Create a shell-level test script `cloudflare/travel-vote/test/frontend-contract.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
rg -q 'data-travel-vote-url=' _pages/gallery.html
! rg -q 'data-supabase-key|data-supabase-function-url|apikey: supabaseKey' _pages/gallery.html assets/js/custom.js
rg -q 'data-travel-vote-url' assets/js/custom.js
```

- [ ] **Step 2: Run it to verify it fails against the Supabase configuration**

Run: `bash cloudflare/travel-vote/test/frontend-contract.sh`

Expected: FAIL because the page and JavaScript still reference Supabase attributes and the `apikey` header.

- [ ] **Step 3: Change the configuration and request header minimally**

Replace the `supabase` configuration object in `_config.yml` with:

```yaml
travel_vote:
  url: "https://REPLACE_WITH_YOUR_WORKER_SUBDOMAIN.workers.dev"
```

Render `data-travel-vote-url="{{ site.travel_vote.url | escape }}"` in the travel-page root. Read that value in `custom.js`; remove the publishable-key variable, all missing-key guards, and the `apikey` request header. Keep the `Content-Type`, anonymous `x-voter-id`, request payloads, and existing error copy unchanged.

- [ ] **Step 4: Run the frontend contract test and build the site**

Run: `bash cloudflare/travel-vote/test/frontend-contract.sh`

Expected: PASS.

Run: `bundle exec jekyll build --config _config.yml,_config.dev.yml`

Expected: PASS; `_site/travel/index.html` contains `data-travel-vote-url` and no Supabase browser key.

- [ ] **Step 5: Commit the frontend switch**

```bash
git add _config.yml _pages/gallery.html assets/js/custom.js cloudflare/travel-vote/test/frontend-contract.sh
git commit -m "feat: use Cloudflare worker for travel votes"
```

### Task 4: Document and deploy the Cloudflare resources

**Files:**
- Modify: `README.md:38-54`
- Modify: `cloudflare/travel-vote/wrangler.jsonc`

**Interfaces:**
- Consumes the Worker project, `DB` binding, and `IP_HASH_SALT` secret.
- Produces a deployed Worker URL copied into `_config.yml`.

- [ ] **Step 1: Write a failing documentation check for the required deploy lifecycle**

Create `cloudflare/travel-vote/test/deployment-docs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
rg -q 'wrangler login' README.md
rg -q 'wrangler d1 create travel-votes' README.md
rg -q 'wrangler d1 migrations apply DB --remote' README.md
rg -q 'wrangler secret put IP_HASH_SALT' README.md
rg -q 'wrangler deploy' README.md
```

- [ ] **Step 2: Run it to verify it fails before the Supabase instructions are replaced**

Run: `bash cloudflare/travel-vote/test/deployment-docs.sh`

Expected: FAIL because `README.md` documents Supabase, not Cloudflare.

- [ ] **Step 3: Replace deployment documentation with Cloudflare instructions**

Document this exact sequence from `cloudflare/travel-vote`:

```bash
npx wrangler login
npx wrangler d1 create travel-votes --location enam
# copy the returned database_id into wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put IP_HASH_SALT
npx wrangler deploy
```

Explain that the deploy output is the `workers.dev` URL to insert as `travel_vote.url` in `_config.yml`, and that after changing Jekyll configuration the user must commit/push to publish GitHub Pages. Explicitly state that the Cloudflare login window and migration/deploy confirmations are user-owned actions, and that no token or secret is to be copied into the repository.

- [ ] **Step 4: Run all automated checks, then perform the user-authorized remote deployment**

Run:

```bash
npm test
npm run typecheck
bash test/frontend-contract.sh
bash test/deployment-docs.sh
bundle exec jekyll build --config _config.yml,_config.dev.yml
```

Expected: every local test and build passes.

After the account owner completes `wrangler login`, create the D1 database, replace the D1 ID marker in `wrangler.jsonc`, apply the remote migration, set a freshly generated `IP_HASH_SALT`, deploy, update `_config.yml` with the returned Worker URL, then verify with:

```bash
curl --fail --silent --show-error \
  --header 'Origin: https://kyleearth.github.io' \
  --header 'CF-Connecting-IP: 203.0.113.10' \
  --header 'x-voter-id: 11111111-1111-4111-8111-111111111111' \
  'https://REPLACE_WITH_YOUR_WORKER_SUBDOMAIN.workers.dev'
```

Expected: JSON with `max_votes: 5`, `participant_count`, `totals`, and a successful HTTP status.

- [ ] **Step 5: Commit documentation and the configured deployment endpoint**

```bash
git add README.md _config.yml cloudflare/travel-vote/wrangler.jsonc cloudflare/travel-vote/test/deployment-docs.sh
git commit -m "docs: add Cloudflare D1 voting deployment"
```

## Plan Self-Review

- Spec coverage: Tasks 1-2 cover the Worker, D1 schema, privacy hash, validation, atomic ballot replacement, CORS, and tests. Task 3 preserves the frontend contract. Task 4 covers account-owned deployment, secrets, configuration, and public verification.
- Placeholder scan: The only explicit replacement markers are intentionally required generated values (`REPLACE_WITH_D1_DATABASE_ID` and the deployed Worker subdomain); the task that obtains and replaces each marker is specified.
- Type consistency: Every task uses the same `DB`, `IP_HASH_SALT`, `GET` state fields, `POST { destinations }`, and five-selection limit defined in the spec.
