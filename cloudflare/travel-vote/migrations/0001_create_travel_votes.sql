CREATE TABLE travel_votes (
  voter_hash TEXT NOT NULL CHECK (length(voter_hash) = 64),
  destination TEXT NOT NULL CHECK (length(destination) BETWEEN 1 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (voter_hash, destination)
);

CREATE INDEX travel_votes_destination_idx ON travel_votes (destination);
CREATE INDEX travel_votes_voter_hash_idx ON travel_votes (voter_hash);
