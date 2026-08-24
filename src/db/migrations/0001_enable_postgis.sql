-- Enables PostGIS on the shared Neon database, per Infrastructure Design's approved baseline.
-- Unit 2 is the first unit to actually query PostGIS (spatial-analysis/postgis-adapter.ts).
CREATE EXTENSION IF NOT EXISTS postgis;
