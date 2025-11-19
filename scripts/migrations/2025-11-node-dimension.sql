-- ------------------------------------------------------------
-- Node Dimension Table
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS node_dimension (
  node_id VARCHAR PRIMARY KEY,
  node_code VARCHAR,
  tenant_id VARCHAR NOT NULL,
  node_name TEXT,
  node_reference TEXT,
  structure_id VARCHAR,
  structure_name TEXT,
  level_id VARCHAR,
  level_name TEXT,
  parent_node_id VARCHAR,
  lineage_ids TEXT[],
  lineage_codes TEXT[],
  lineage_names TEXT[],
  lineage_refs TEXT[],
  depth INTEGER,
  is_active BOOLEAN,
  is_main BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS node_dimension_tenant_idx
  ON node_dimension (tenant_id);

CREATE INDEX IF NOT EXISTS node_dimension_structure_idx
  ON node_dimension (structure_name);




