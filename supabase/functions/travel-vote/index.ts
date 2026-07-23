import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_VOTES_PER_IP = 5;
const allowedOrigins = new Set([
  "https://kyleearth.github.io",
  "http://localhost:4000",
  "http://127.0.0.1:4000",
]);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "https://kyleearth.github.io";

  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://kyleearth.github.io",
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(request),
  });
}

function readKeySet(variableName: string) {
  const rawKeys = Deno.env.get(variableName);

  if (!rawKeys) {
    return [];
  }

  try {
    return Object.values(JSON.parse(rawKeys)).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  } catch {
    return [];
  }
}

function getSecretKey() {
  return (
    readKeySet("SUPABASE_SECRET_KEYS")[0] ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}

function hasValidPublishableKey(request: Request) {
  const suppliedKey = request.headers.get("apikey");
  const publishableKeys = readKeySet("SUPABASE_PUBLISHABLE_KEYS");
  const legacyAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (legacyAnonKey) {
    publishableKeys.push(legacyAnonKey);
  }

  return Boolean(suppliedKey && publishableKeys.includes(suppliedKey));
}

function getClientIp(request: Request) {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();

  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedIp = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  return forwardedIp || request.headers.get("x-real-ip")?.trim() || "";
}

async function hashIpAddress(ipAddress: string, salt: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(ipAddress),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse(request, { ok: true });
  }

  const origin = request.headers.get("origin");

  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(request, { error: "origin_not_allowed" }, 403);
  }

  if (!hasValidPublishableKey(request)) {
    return jsonResponse(request, { error: "invalid_api_key" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secretKey = getSecretKey();
  const ipHashSalt = Deno.env.get("IP_HASH_SALT") || "";
  const clientIp = getClientIp(request);

  if (!supabaseUrl || !secretKey || ipHashSalt.length < 32) {
    return jsonResponse(request, { error: "server_not_configured" }, 500);
  }

  if (!clientIp) {
    return jsonResponse(request, { error: "client_ip_unavailable" }, 400);
  }

  const ipHash = await hashIpAddress(clientIp, ipHashSalt);
  const supabaseAdmin = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  async function getVoteState() {
    const [totalsResponse, selectionsResponse] = await Promise.all([
      supabaseAdmin.rpc("get_travel_vote_totals"),
      supabaseAdmin
        .from("travel_votes")
        .select("destination")
        .eq("ip_hash", ipHash)
        .order("destination"),
    ]);

    if (totalsResponse.error) {
      throw totalsResponse.error;
    }

    if (selectionsResponse.error) {
      throw selectionsResponse.error;
    }

    const selected = (selectionsResponse.data || []).map(
      (row) => row.destination,
    );

    return {
      totals: totalsResponse.data || [],
      selected,
      active_votes: selected.length,
      remaining_votes: Math.max(0, MAX_VOTES_PER_IP - selected.length),
      max_votes: MAX_VOTES_PER_IP,
    };
  }

  try {
    if (request.method === "GET") {
      return jsonResponse(request, await getVoteState());
    }

    if (request.method !== "POST") {
      return jsonResponse(request, { error: "method_not_allowed" }, 405);
    }

    const payload = await request.json();
    const destination =
      typeof payload.destination === "string" ? payload.destination.trim() : "";
    const selected = payload.selected;

    if (
      destination.length < 1 ||
      destination.length > 100 ||
      typeof selected !== "boolean"
    ) {
      return jsonResponse(request, { error: "invalid_vote" }, 400);
    }

    const voteResponse = await supabaseAdmin.rpc("set_travel_vote", {
      p_ip_hash: ipHash,
      p_destination: destination,
      p_selected: selected,
    });

    if (voteResponse.error) {
      if (voteResponse.error.message.includes("VOTE_LIMIT_REACHED")) {
        return jsonResponse(
          request,
          {
            error: "vote_limit_reached",
            message: "This network has already used all five votes.",
            max_votes: MAX_VOTES_PER_IP,
          },
          429,
        );
      }

      throw voteResponse.error;
    }

    return jsonResponse(request, await getVoteState());
  } catch {
    return jsonResponse(request, { error: "vote_service_error" }, 500);
  }
});
