export interface Env {
  DB: D1Database;
  IP_HASH_SALT: string;
  ALLOWED_ORIGINS: string;
}

type VoteTotal = {
  destination: string;
  vote_count: number;
};

type VoteState = {
  totals: VoteTotal[];
  participant_count: number;
  selected: string[];
  active_votes: number;
  remaining_votes: number;
  max_votes: number;
};

const MAX_VOTES = 5;
const VOTER_ID_PATTERN = /^[a-f0-9-]{32,36}$/;

function allowedOrigins(env: Env) {
  return new Set(
    env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function corsHeaders(request: Request, env: Env) {
  const origins = allowedOrigins(env);
  const origin = request.headers.get("Origin") || "";
  const responseOrigin = origins.has(origin) ? origin : [...origins][0] || "";

  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Headers": "content-type, x-voter-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request, env),
  });
}

function clientIp(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

function browserVoterId(request: Request) {
  const voterId = request.headers.get("x-voter-id")?.trim().toLowerCase() || "";
  return VOTER_ID_PATTERN.test(voterId) ? voterId : "legacy";
}

async function voterHash(identity: string, salt: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(identity));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validateDestinations(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const destinations = (payload as { destinations?: unknown }).destinations;
  if (!Array.isArray(destinations)) {
    return null;
  }

  if (!destinations.every((destination) => typeof destination === "string")) {
    return null;
  }

  const uniqueDestinations = [
    ...new Set(destinations.map((destination) => (destination as string).trim())),
  ];
  if (
    uniqueDestinations.length > MAX_VOTES ||
    uniqueDestinations.some(
      (destination) => destination.length < 1 || destination.length > 100,
    )
  ) {
    return null;
  }

  return uniqueDestinations;
}

async function getState(db: D1Database, hash: string): Promise<VoteState> {
  const [totalsResult, participantsResult, selectedResult] = await Promise.all([
    db
      .prepare(
        `SELECT destination, COUNT(*) AS vote_count
         FROM travel_votes
         GROUP BY destination
         ORDER BY vote_count DESC, destination ASC`,
      )
      .all<VoteTotal>(),
    db
      .prepare("SELECT COUNT(DISTINCT voter_hash) AS participant_count FROM travel_votes")
      .first<{ participant_count: number }>(),
    db
      .prepare(
        "SELECT destination FROM travel_votes WHERE voter_hash = ? ORDER BY destination ASC",
      )
      .bind(hash)
      .all<{ destination: string }>(),
  ]);

  const selected = (selectedResult.results || []).map((row) => row.destination);

  return {
    totals: (totalsResult.results || []).map((row) => ({
      destination: row.destination,
      vote_count: Number(row.vote_count),
    })),
    participant_count: Number(participantsResult?.participant_count || 0),
    selected,
    active_votes: selected.length,
    remaining_votes: Math.max(0, MAX_VOTES - selected.length),
    max_votes: MAX_VOTES,
  };
}

async function replaceVotes(db: D1Database, hash: string, destinations: string[]) {
  const statements = [
    db.prepare("DELETE FROM travel_votes WHERE voter_hash = ?").bind(hash),
    ...destinations.map((destination) =>
      db
        .prepare("INSERT INTO travel_votes (voter_hash, destination) VALUES (?, ?)")
        .bind(hash, destination),
    ),
  ];

  await db.batch(statements);
}

export default {
  async fetch(request, env): Promise<Response> {
    const requestOrigin = request.headers.get("Origin") || "";
    if (!allowedOrigins(env).has(requestOrigin)) {
      return json(request, env, { error: "origin_not_allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      return json(request, env, { ok: true });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return json(request, env, { error: "method_not_allowed" }, 405);
    }

    if (env.IP_HASH_SALT.length < 32) {
      return json(request, env, { error: "server_not_configured" }, 500);
    }

    const ip = clientIp(request);
    if (!ip) {
      return json(request, env, { error: "client_ip_unavailable" }, 400);
    }

    try {
      const hash = await voterHash(`${ip}|${browserVoterId(request)}`, env.IP_HASH_SALT);

      if (request.method === "POST") {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json(request, env, { error: "invalid_selection" }, 400);
        }

        const destinations = validateDestinations(payload);
        if (!destinations) {
          return json(request, env, { error: "invalid_selection" }, 400);
        }

        await replaceVotes(env.DB, hash, destinations);
      }

      return json(request, env, await getState(env.DB, hash));
    } catch {
      return json(request, env, { error: "vote_service_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
