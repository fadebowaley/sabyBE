const { postgresPool } = require('../config/postgres');
const { Nodes, Level, Structures } = require('../models');

const toId = (value) => (value ? String(value) : null);

const buildDepth = (path) => {
  const p = String(path || '').trim();
  if (!p) return 0;
  return p.split('/').filter(Boolean).length - 1;
};

const buildClosureRows = (tenantId, nodes) => {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const rows = [];

  nodes.forEach((node) => {
    const selfId = node.node_id;
    rows.push({
      tenantId,
      ancestorNodeId: selfId,
      descendantNodeId: selfId,
      depth: 0,
    });

    const visited = new Set([selfId]);
    let currentParent = node.parent_node_id;
    let depth = 1;

    while (currentParent && !visited.has(currentParent)) {
      rows.push({
        tenantId,
        ancestorNodeId: currentParent,
        descendantNodeId: selfId,
        depth,
      });
      visited.add(currentParent);
      const parent = byId.get(currentParent);
      currentParent = parent ? parent.parent_node_id : null;
      depth += 1;
    }
  });

  return rows;
};

const loadTenantNodes = async (tenantId) => {
  const docs = await Nodes.find({ tenantId })
    .select(
      '_id tenantId nodeId name parent level structure path identity users isActive deletedAt'
    )
    .lean();

  const levelIds = [...new Set(docs.map((d) => toId(d.level)).filter(Boolean))];
  const structureIds = [...new Set(docs.map((d) => toId(d.structure)).filter(Boolean))];

  const [levels, structures] = await Promise.all([
    Level.find({ _id: { $in: levelIds } }).select('_id name rank').lean(),
    Structures.find({ _id: { $in: structureIds } }).select('_id name').lean(),
  ]);

  const levelMap = new Map(levels.map((x) => [toId(x._id), x]));
  const structureMap = new Map(structures.map((x) => [toId(x._id), x]));

  return docs.map((doc) => {
    const level = levelMap.get(toId(doc.level));
    const structure = structureMap.get(toId(doc.structure));

    return {
      tenant_id: String(tenantId),
      node_id: toId(doc._id),
      node_code: doc.nodeId || null,
      node_name: doc.name || doc.nodeId || toId(doc._id),
      parent_node_id: toId(doc.parent),
      level_id: toId(doc.level),
      level_name: level?.name || null,
      level_rank: Number.isFinite(Number(level?.rank)) ? Number(level.rank) : null,
      structure_id: toId(doc.structure),
      structure_name: structure?.name || null,
      path: doc.path || null,
      depth: buildDepth(doc.path),
      identity_json: Array.isArray(doc.identity)
        ? doc.identity.map((x) => String(x))
        : [],
      users_json: Array.isArray(doc.users) ? doc.users.map((x) => String(x)) : [],
      is_active: doc.isActive !== false && !doc.deletedAt,
      deleted_at: doc.deletedAt || null,
    };
  });
};

const upsertNodeDimensionRows = async (client, rows) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO copilot.node_dimension (
         tenant_id, node_id, node_code, node_name, parent_node_id, level_id, level_name, level_rank,
         structure_id, structure_name, path, depth, identity_json, users_json, is_active, deleted_at, snapshot_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16, NOW()
       )
       ON CONFLICT (tenant_id, node_id)
       DO UPDATE SET
         node_code = EXCLUDED.node_code,
         node_name = EXCLUDED.node_name,
         parent_node_id = EXCLUDED.parent_node_id,
         level_id = EXCLUDED.level_id,
         level_name = EXCLUDED.level_name,
         level_rank = EXCLUDED.level_rank,
         structure_id = EXCLUDED.structure_id,
         structure_name = EXCLUDED.structure_name,
         path = EXCLUDED.path,
         depth = EXCLUDED.depth,
         identity_json = EXCLUDED.identity_json,
         users_json = EXCLUDED.users_json,
         is_active = EXCLUDED.is_active,
         deleted_at = EXCLUDED.deleted_at,
         snapshot_at = NOW(),
         updated_at = NOW()`,
      [
        row.tenant_id,
        row.node_id,
        row.node_code,
        row.node_name,
        row.parent_node_id,
        row.level_id,
        row.level_name,
        row.level_rank,
        row.structure_id,
        row.structure_name,
        row.path,
        row.depth,
        JSON.stringify(row.identity_json || []),
        JSON.stringify(row.users_json || []),
        row.is_active,
        row.deleted_at,
      ]
    );
  }
};

const replaceTenantClosure = async (client, tenantId, closureRows) => {
  await client.query('DELETE FROM copilot.node_closure WHERE tenant_id = $1', [tenantId]);

  if (!closureRows.length) return;

  // eslint-disable-next-line no-restricted-syntax
  for (const row of closureRows) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO copilot.node_closure (
         tenant_id, ancestor_node_id, descendant_node_id, depth, snapshot_at
       ) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, ancestor_node_id, descendant_node_id)
       DO UPDATE SET
         depth = EXCLUDED.depth,
         snapshot_at = NOW()`,
      [row.tenantId, row.ancestorNodeId, row.descendantNodeId, row.depth]
    );
  }
};

const syncTenantNodeHierarchy = async (tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  const rows = await loadTenantNodes(tenantId);
  const closureRows = buildClosureRows(tenantId, rows);
  const nodeIds = rows.map((r) => r.node_id);

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    await upsertNodeDimensionRows(client, rows);

    if (nodeIds.length > 0) {
      await client.query(
        `DELETE FROM copilot.node_dimension
         WHERE tenant_id = $1
           AND node_id <> ALL($2::varchar[])`,
        [tenantId, nodeIds]
      );
    } else {
      await client.query(
        `DELETE FROM copilot.node_dimension
         WHERE tenant_id = $1`,
        [tenantId]
      );
    }

    await replaceTenantClosure(client, tenantId, closureRows);
    await client.query('COMMIT');

    return {
      tenantId,
      nodesSynced: rows.length,
      closureEdgesSynced: closureRows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const listTenantsFromNodes = async () => {
  const tenants = await Nodes.distinct('tenantId', { tenantId: { $exists: true, $ne: null } });
  return tenants.map((x) => String(x)).filter(Boolean);
};

const syncAllTenantsNodeHierarchy = async () => {
  const tenants = await listTenantsFromNodes();
  const results = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const tenantId of tenants) {
    // eslint-disable-next-line no-await-in-loop
    const result = await syncTenantNodeHierarchy(tenantId);
    results.push(result);
  }

  return {
    totalTenants: tenants.length,
    results,
  };
};

module.exports = {
  syncTenantNodeHierarchy,
  syncAllTenantsNodeHierarchy,
  __private: {
    buildClosureRows,
    buildDepth,
  },
};

