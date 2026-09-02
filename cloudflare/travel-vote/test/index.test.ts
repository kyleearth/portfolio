import { SELF, applyD1Migrations, env, reset } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import migration from "../migrations/0001_create_travel_votes.sql?raw";

const origin = "https://kyleearth.github.io";
const voterOne = "11111111-1111-4111-8111-111111111111";
const voterTwo = "22222222-2222-4222-8222-222222222222";

function headers(voterId = voterOne, requestOrigin = origin) {
  return {
    Origin: requestOrigin,
    "CF-Connecting-IP": "203.0.113.10",
    "x-voter-id": voterId,
  };
}

async function state(voterId = voterOne) {
  return SELF.fetch("https://travel-vote.test", { headers: headers(voterId) });
}

async function replace(destinations: unknown, voterId = voterOne) {
  return SELF.fetch("https://travel-vote.test", {
    method: "POST",
    headers: {
      ...headers(voterId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ destinations }),
  });
}

describe("travel-vote Worker", () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, [
      {
        name: "0001_create_travel_votes.sql",
        queries: migration.split(";\n").filter(Boolean),
      },
    ]);
  });

  afterEach(async () => {
    await reset();
  });

  it("returns an empty ballot and zero totals for a new visitor", async () => {
    const response = await state();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totals: [],
      participant_count: 0,
      selected: [],
      active_votes: 0,
      remaining_votes: 5,
      max_votes: 5,
    });
  });

  it("replaces one visitor ballot and returns aggregate totals", async () => {
    const response = await replace(["Japan", "Chile"]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totals: [
        { destination: "Chile", vote_count: 1 },
        { destination: "Japan", vote_count: 1 },
      ],
      participant_count: 1,
      selected: ["Chile", "Japan"],
      active_votes: 2,
      remaining_votes: 3,
      max_votes: 5,
    });
  });

  it("keeps ballots separate while counting shared destinations", async () => {
    await replace(["Japan"], voterOne);
    await replace(["Japan", "Peru"], voterTwo);

    const firstVisitorState = await state(voterOne);

    await expect(firstVisitorState.json()).resolves.toMatchObject({
      participant_count: 2,
      selected: ["Japan"],
      active_votes: 1,
      totals: [
        { destination: "Japan", vote_count: 2 },
        { destination: "Peru", vote_count: 1 },
      ],
    });
  });

  it("rejects a sixth selection without changing an existing ballot", async () => {
    await replace(["Chile", "Japan", "Kenya", "Peru", "Spain"]);

    const rejected = await replace([
      "Chile",
      "Japan",
      "Kenya",
      "Peru",
      "Spain",
      "Thailand",
    ]);

    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({ error: "invalid_selection" });

    const unchanged = await state();
    await expect(unchanged.json()).resolves.toMatchObject({
      selected: ["Chile", "Japan", "Kenya", "Peru", "Spain"],
      active_votes: 5,
    });
  });

  it("rejects malformed selections and requests from unapproved origins", async () => {
    const malformed = await replace(["Japan", 7]);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "invalid_selection" });

    const forbidden = await SELF.fetch("https://travel-vote.test", {
      headers: headers(voterOne, "https://untrusted.example"),
    });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toEqual({ error: "origin_not_allowed" });
  });

  it("answers preflight requests with the allowed request headers", async () => {
    const response = await SELF.fetch("https://travel-vote.test", {
      method: "OPTIONS",
      headers: { Origin: origin },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "x-voter-id",
    );

    const forbidden = await SELF.fetch("https://travel-vote.test", {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example" },
    });
    expect(forbidden.status).toBe(403);
  });
});
