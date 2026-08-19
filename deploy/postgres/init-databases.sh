#!/bin/bash
set -euo pipefail

# Runs once on first cluster init. App roles share POSTGRES_PASSWORD (local/kind).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER fuda WITH PASSWORD '${POSTGRES_PASSWORD}';
  CREATE DATABASE fuda OWNER fuda;
  CREATE USER torii WITH PASSWORD '${POSTGRES_PASSWORD}';
  CREATE DATABASE torii OWNER torii;
  CREATE USER shaiden WITH PASSWORD '${POSTGRES_PASSWORD}';
  CREATE DATABASE shaiden OWNER shaiden;
EOSQL
