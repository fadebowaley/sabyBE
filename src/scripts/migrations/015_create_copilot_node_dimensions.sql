-- Create node dimension + closure tables for hierarchy-aware analytics

CREATE TABLE IF NOT EXISTS copilot.node_dimension (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  node_code VARCHAR(64),
  node_name VARCHAR(255) NOT NULL,
  parent_node_id VARCHAR(64),
  level_id VARCHAR(64),
  level_name VARCHAR(128),
  level_rank INTEGER,
  structure_id VARCHAR(64),
  structure_name VARCHAR(255),
  path TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  identity_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  users_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_level
  ON copilot.node_dimension (tenant_id, level_rank, node_name);
CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_parent
  ON copilot.node_dimension (tenant_id, parent_node_id);
CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_structure
  ON copilot.node_dimension (tenant_id, structure_id);
CREATE INDEX IF NOT EXISTS idx_node_dimension_tenant_active
  ON copilot.node_dimension (tenant_id, is_active);

DROP TRIGGER IF EXISTS trg_node_dimension_updated_at ON copilot.node_dimension;
CREATE TRIGGER trg_node_dimension_updated_at
  BEFORE UPDATE ON copilot.node_dimension
  FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

CREATE TABLE IF NOT EXISTS copilot.node_closure (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(64) NOT NULL,
  ancestor_node_id VARCHAR(64) NOT NULL,
  descendant_node_id VARCHAR(64) NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, ancestor_node_id, descendant_node_id)
);

CREATE INDEX IF NOT EXISTS idx_node_closure_tenant_ancestor
  ON copilot.node_closure (tenant_id, ancestor_node_id, depth);
CREATE INDEX IF NOT EXISTS idx_node_closure_tenant_descendant
  ON copilot.node_closure (tenant_id, descendant_node_id, depth);

