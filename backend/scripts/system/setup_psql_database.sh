#!/bin/bash

set -e  # Exit on error

# === Load environment variables from .env file ===
if [ -f "./db.env" ]; then
  set -a
  source ./db.env
  set +a
else
  echo "# db.env file not found. Aborting."
  exit 1
fi

# === Validate required environment variables ===
: "${DB_NAME:?Missing DB_NAME in env}"
: "${DB_USER:?Missing DB_USER in env}"
: "${DB_HOST:?Missing DB_HOST in env}"
: "${DB_PORT:?Missing DB_PORT in env}"

# === Check if the database already exists ===
DB_EXISTS=$(psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" postgres)

if [ "$DB_EXISTS" = "1" ]; then
  echo "# Database '$DB_NAME' already exists."

  read -p "# Recreate it? This will DELETE the existing database. [y/N]: " confirm
  confirm=$(echo "$confirm" | tr '[:upper:]' '[:lower:]')

  if [[ "$confirm" == "y" || "$confirm" == "yes" ]]; then
    echo "# Dropping and recreating '$DB_NAME'..."
    dropdb -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME"
    createdb -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME"
  else
    echo "# Skipping database creation."
  fi
else
  echo "# Creating database '$DB_NAME'..."
  createdb -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME"
fi

# === Apply schema ===
echo "# Applying schema to '$DB_NAME'..."

psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" <<'EOF'
-- === Table: phone_numbers ===
CREATE TABLE IF NOT EXISTS phone_numbers (
    phone_number VARCHAR PRIMARY KEY,
    region VARCHAR,
    carrier VARCHAR,
    country_code VARCHAR,
    first_seen_at TIMESTAMP,
    last_reported_at TIMESTAMP,
    report_count INT DEFAULT 0,
    scam_score FLOAT DEFAULT 0,

    -- V2: AI-based classification score
    ai_scam_score FLOAT CHECK (ai_scam_score BETWEEN 0 AND 1),

    -- V2: Manual or automated scam flag
    flagged_as_scam BOOLEAN DEFAULT FALSE
);

-- === Table: phone_reports ===
CREATE TABLE IF NOT EXISTS phone_reports (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR REFERENCES phone_numbers(phone_number),
    source VARCHAR NOT NULL,
    report_date TIMESTAMP NOT NULL,
    violation_date TIMESTAMP,

    report_method VARCHAR,
    type_of_call VARCHAR,
    subject TEXT,
    robocall BOOLEAN,

    caller_id_number VARCHAR,
    advertiser_number VARCHAR,
    consumer_city VARCHAR,
    consumer_state VARCHAR(2),
    consumer_zip VARCHAR(10),
    geo_location POINT,

    source_seq_id BIGINT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    secret_key VARCHAR, -- For anonymous updates

    -- V2: User-reported confidence
    user_confidence_level INT CHECK (user_confidence_level BETWEEN 0 AND 100),

    -- V2: Voting for report helpfulness
    helpful_upvotes INT DEFAULT 0,
    helpful_downvotes INT DEFAULT 0
);

-- === V2: Votes table (optional, for detailed tracking of up/down votes) ===
CREATE TABLE IF NOT EXISTS report_votes (
    id SERIAL PRIMARY KEY,
    report_id INT REFERENCES phone_reports(id),
    vote_type VARCHAR CHECK (vote_type IN ('up', 'down')),
    voter_fingerprint VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === V2: Optional user table for login system ===
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === Indexes for performance ===
CREATE INDEX IF NOT EXISTS idx_reports_phone_number ON phone_reports(phone_number);
CREATE INDEX IF NOT EXISTS idx_reports_report_date ON phone_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_reports_robocall ON phone_reports(robocall);
EOF

echo "# Database '$DB_NAME' schema initialized successfully."
