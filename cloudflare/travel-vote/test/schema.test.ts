import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";
import migration from "../migrations/0001_create_travel_votes.sql?raw";

describe("travel-vote schema", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, [
      {
        name: "0001_create_travel_votes.sql",
        queries: migration.split(";\n").filter(Boolean),
      },
    ]);
  });

  afterAll(async () => {
    await env.DB.exec("DROP TABLE IF EXISTS travel_votes");
  });

  it("rejects duplicate votes for the same voter and destination", async () => {
    await env.DB.prepare(
      "INSERT INTO travel_votes (voter_hash, destination) VALUES (?, ?)",
    )
      .bind("a".repeat(64), "Japan")
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO travel_votes (voter_hash, destination) VALUES (?, ?)",
      )
        .bind("a".repeat(64), "Japan")
        .run(),
    ).rejects.toThrow();
  });
});
