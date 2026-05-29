const httpStatus = require('http-status');
const {
  Structures,
  Level,
  Nodes,
  Role,
  User,
} = require('../models');
const ApiError = require('../utils/ApiError');
const structureService = require('./structure.service');
const levelService = require('./level.service');
const nodeService = require('./node.service');
const roleService = require('./role.service');
const userService = require('./user.service');

const ALLOWED_RECORD_TYPES = new Set([
  'structure',
  'level',
  'node',
  'role',
  'user',
  'user_role',
  'user_node',
]);

const REQUIRED_BY_TYPE = {
  structure: ['structure_name'],
  level: ['level_name', 'level_rank', 'structure_name'],
  node: ['node_name', 'level_name', 'structure_name'],
  role: ['role_name'],
  user: ['user_email', 'first_name', 'last_name'],
  user_role: ['user_email', 'role_name'],
  user_node: ['user_email', 'node_name'],
};

const MASTER_TEMPLATE_HEADERS = [
  'level',
  'structure',
  'church name',
  'role',
  'pastors name',
  'email',
  'phone no',
  'church address',
  'password',
];
const MASTER_ROW_REQUIRED_HEADERS = ['level', 'structure', 'church name'];
const MASTER_STRUCTURE_NAME =
  process.env.COPILOT_ONBOARDING_MASTER_STRUCTURE_NAME || 'Master Structure';

const norm = (value) => String(value || '').trim().toLowerCase();
const getSafe = (row, key) => String(row?.[key] || '').trim();
const getUserNodeName = (row) => getSafe(row, 'node_name') || getSafe(row, 'parent_node_name');
const HEADER_ALIAS = {
  'phone no.': 'phone no',
  phone: 'phone no',
  'churchname': 'church name',
  'pastor name': 'pastors name',
  'pastor s name': 'pastors name',
};
const normalizeHeader = (value) => {
  const base = norm(value).replace(/\s+/g, ' ');
  return HEADER_ALIAS[base] || base;
};

const parseCsvLine = (line) => {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
};

const isMasterTemplateHeaders = (headers = []) => {
  const set = new Set(headers.map(normalizeHeader));
  return MASTER_TEMPLATE_HEADERS.every((header) => set.has(header));
};

const normalizeParsedRows = (parsedRows = []) =>
  parsedRows.map((entry, index) => {
    const lineNumber = Number(entry?.lineNumber || index + 2);
    const rawRow = entry?.row && typeof entry.row === 'object' ? entry.row : {};
    const row = Object.keys(rawRow).reduce((acc, key) => {
      acc[normalizeHeader(key)] = String(rawRow[key] || '').trim();
      return acc;
    }, {});
    return { lineNumber, row };
  });

const toTitle = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
};

const splitPersonName = (rawName, email = '') => {
  const stripped = String(rawName || '')
    .replace(/\s+/g, ' ')
    .trim();
  const titleWords = new Set([
    'pst',
    'pst.',
    'pastor',
    'mr',
    'mr.',
    'mrs',
    'mrs.',
    'dr',
    'dr.',
    'rev',
    'rev.',
    'bro',
    'bro.',
    'sis',
    'sis.',
  ]);

  let parts = stripped
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean);
  while (parts.length > 0 && titleWords.has(parts[0].toLowerCase())) {
    parts = parts.slice(1);
  }

  if (parts.length === 0 && email) {
    parts = email
      .split('@')[0]
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .split(/[._-]/)
      .filter(Boolean);
  }

  if (parts.length === 0) {
    return { firstName: 'Member', lastName: 'Unknown' };
  }
  if (parts.length === 1) {
    return { firstName: toTitle(parts[0]), lastName: 'Member' };
  }

  return {
    firstName: toTitle(parts[0]),
    lastName: toTitle(parts.slice(1).join(' ')),
  };
};

const parseLevelRank = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
};

const buildNodeRefKey = ({ name, levelRef = '', parentRef = '' }) =>
  `${norm(name)}|${String(levelRef || '')}|${String(parentRef || '')}`;

const appendNodeNameCandidate = (refs, node) => {
  const key = norm(node?.name);
  if (!key) return;
  const current = refs.nodesByName.get(key) || [];
  const next = current.filter(
    (candidate) => String(candidate?._id || '') !== String(node?._id || '')
  );
  next.push(node);
  refs.nodesByName.set(key, next);
};

const normalizeNodeRef = (node) => {
  if (!node) return node;
  ['level', 'structure', 'parent'].forEach((f) => {
    if (node[f] && typeof node[f] === 'object' && !Array.isArray(node[f]) && node[f]._id) {
      node[f] = node[f]._id;
    }
  });
  return node;
};

const indexNodeRef = (refs, node) => {
  if (!refs || !node?._id) return;
  appendNodeNameCandidate(refs, node);
  refs.nodesByComposite.set(
    buildNodeRefKey({
      name: node.name,
      levelRef: node.level,
      parentRef: node.parent,
    }),
    node
  );
};

const unindexNodeRef = (refs, node) => {
  if (!refs || !node?._id) return;
  const key = norm(node?.name);
  if (key) {
    const next = (refs.nodesByName.get(key) || []).filter(
      (candidate) => String(candidate?._id || '') !== String(node?._id || '')
    );
    if (next.length > 0) refs.nodesByName.set(key, next);
    else refs.nodesByName.delete(key);
  }
  refs.nodesByComposite.delete(
    buildNodeRefKey({
      name: node.name,
      levelRef: node.level,
      parentRef: node.parent,
    })
  );
};

const resolveNodeRef = (refs, { name, levelRef = null, parentRef = undefined }) => {
  const nodeName = norm(name);
  if (!nodeName) return null;
  const hasLevelConstraint = levelRef != null;
  const hasParentConstraint = parentRef !== undefined;

  if (hasLevelConstraint && hasParentConstraint) {
    const exact = refs.nodesByComposite.get(
      buildNodeRefKey({ name, levelRef, parentRef })
    );
    if (exact) return exact;
  }

  const candidates = refs.nodesByName.get(nodeName) || [];
  if (candidates.length === 0) return null;

  const filtered = candidates.filter((candidate) => {
    if (hasLevelConstraint && String(candidate?.level || '') !== String(levelRef)) {
      return false;
    }
    if (
      hasParentConstraint &&
      String(candidate?.parent || '') !== String(parentRef || '')
    ) {
      return false;
    }
    return true;
  });

  if (filtered.length === 1) return filtered[0];
  if (filtered.length > 1) return filtered[filtered.length - 1];
  if (hasLevelConstraint && !hasParentConstraint && filtered.length === 0 && candidates.length > 0) return candidates[candidates.length - 1];
  if (hasLevelConstraint || hasParentConstraint) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates[candidates.length - 1] || null;
};

const canonicalizeMasterRows = (rows = []) => {
  const canonicalRows = [];
  const levelsByName = new Map();
  const structuresByLevel = new Map();
  const roles = new Set();
  const usersByEmail = new Map();
  const userRoleBindings = new Set();
  const userNodeBindings = new Set();
  const nodeRows = [];
  const structureForLevel = (levelName) => {
    const key = norm(levelName) || 'unknown';
    if (!structuresByLevel.has(key)) {
      const suffix = String(levelName || 'Unknown Level').trim();
      structuresByLevel.set(key, `${MASTER_STRUCTURE_NAME} - ${suffix}`);
    }
    return structuresByLevel.get(key);
  };

  rows.forEach(({ lineNumber, row }) => {
    const levelName = getSafe(row, 'structure');
    const levelRank = getSafe(row, 'level');
    const nodeName = getSafe(row, 'church name');
    const nodeAddress = getSafe(row, 'church address');
    const roleName = getSafe(row, 'role');
    const email = getSafe(row, 'email').toLowerCase();
    const pastorsName = getSafe(row, 'pastors name');
    const phoneNumber = getSafe(row, 'phone no');
    const password = getSafe(row, 'password');

    if (levelName) {
      if (!levelsByName.has(norm(levelName))) {
        levelsByName.set(norm(levelName), {
          lineNumber,
          levelName,
          levelRank,
        });
      }
    }

    if (nodeName) {
      nodeRows.push({
        lineNumber,
        levelName,
        levelRank,
        nodeName,
        nodeAddress,
      });
    }

    if (roleName) {
      roles.add(roleName);
    }

    if (email) {
      if (!usersByEmail.has(email)) {
        const { firstName, lastName } = splitPersonName(pastorsName, email);
        usersByEmail.set(email, {
          lineNumber,
          email,
          firstName,
          lastName,
          phoneNumber,
          password,
        });
      }
      if (roleName) {
        userRoleBindings.add(`${email}|||${roleName}|||${lineNumber}`);
      }
      if (nodeName) {
        userNodeBindings.add(`${email}|||${nodeName}|||${lineNumber}`);
      }
    }
  });

  const orderedLevels = [...levelsByName.values()].sort((a, b) => {
    const aRank = parseLevelRank(a.levelRank);
    const bRank = parseLevelRank(b.levelRank);
    if (aRank == null && bRank == null) return a.levelName.localeCompare(b.levelName);
    if (aRank == null) return 1;
    if (bRank == null) return -1;
    return aRank - bRank;
  });

  orderedLevels.forEach((entry) => {
    canonicalRows.push({
      lineNumber: entry.lineNumber,
      row: {
        record_type: 'structure',
        structure_name: structureForLevel(entry.levelName),
      },
    });
  });

  orderedLevels.forEach((entry) => {
      canonicalRows.push({
        lineNumber: entry.lineNumber,
        row: {
          record_type: 'level',
          structure_name: structureForLevel(entry.levelName),
          level_name: entry.levelName,
          level_rank: entry.levelRank,
        },
      });
  });

  const stack = [];
  const nodeContextByLine = new Map();
  nodeRows.forEach((entry) => {
    const numericRank = parseLevelRank(entry.levelRank);
    let parentNodeName = '';
    let parentLevelName = '';
    if (numericRank != null) {
      while (stack.length > 0 && stack[stack.length - 1].rank >= numericRank) {
        stack.pop();
      }
      parentNodeName = stack.length > 0 ? stack[stack.length - 1].nodeName : '';
      parentLevelName = stack.length > 0 ? stack[stack.length - 1].levelName : '';
      stack.push({
        rank: numericRank,
        nodeName: entry.nodeName,
        levelName: entry.levelName,
      });
    }

    nodeContextByLine.set(entry.lineNumber, {
      nodeName: entry.nodeName,
      levelName: entry.levelName,
      parentNodeName,
      parentLevelName,
    });

    canonicalRows.push({
      lineNumber: entry.lineNumber,
      row: {
        record_type: 'node',
        structure_name: structureForLevel(entry.levelName),
        level_name: entry.levelName,
        node_name: entry.nodeName,
        parent_node_name: parentNodeName,
        parent_level_name: parentLevelName,
        node_address: entry.nodeAddress,
      },
    });
  });

  [...roles].sort((a, b) => a.localeCompare(b)).forEach((roleName) => {
    canonicalRows.push({
      lineNumber: 1,
      row: {
        record_type: 'role',
        role_name: roleName,
      },
    });
  });

  [...usersByEmail.values()].forEach((userEntry) => {
    canonicalRows.push({
      lineNumber: userEntry.lineNumber,
      row: {
        record_type: 'user',
        user_email: userEntry.email,
        first_name: userEntry.firstName,
        last_name: userEntry.lastName,
        phone_number: userEntry.phoneNumber,
        user_password: userEntry.password,
      },
    });
  });

  [...userRoleBindings].forEach((binding) => {
    const [userEmail, roleName, lineNumber] = binding.split('|||');
    canonicalRows.push({
      lineNumber: Number(lineNumber || 1),
      row: {
        record_type: 'user_role',
        user_email: userEmail,
        role_name: roleName,
      },
    });
  });

  [...userNodeBindings].forEach((binding) => {
    const [userEmail, nodeName, lineNumber] = binding.split('|||');
    const nodeContext = nodeContextByLine.get(Number(lineNumber || 0)) || {};
    canonicalRows.push({
      lineNumber: Number(lineNumber || 1),
      row: {
        record_type: 'user_node',
        user_email: userEmail,
        node_name: nodeName,
        level_name: nodeContext.levelName || '',
        parent_node_name: nodeContext.parentNodeName || '',
        parent_level_name: nodeContext.parentLevelName || '',
      },
    });
  });

  return canonicalRows;
};

const normalizeOnboardingRows = (rows = []) => {
  const firstRow = rows[0]?.row || {};
  const headers = Object.keys(firstRow).map(normalizeHeader);

  if (headers.includes('record_type')) {
    return { rows, schema: 'copilot' };
  }

  if (isMasterTemplateHeaders(headers)) {
    const mapped = canonicalizeMasterRows(rows);
    return { rows: mapped, schema: 'master' };
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    'CSV header must either include record_type or match the approved onboarding master template columns'
  );
};

const parseCsvText = (csvText) => {
  const raw = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (raw.length < 2) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'CSV must include header and at least one data row'
    );
  }

  const headers = parseCsvLine(raw[0]).map((h) => normalizeHeader(h));
  const rows = [];
  for (let i = 1; i < raw.length; i += 1) {
    const values = parseCsvLine(raw[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = String(values[idx] || '').trim();
    });
    rows.push({
      lineNumber: i + 1,
      row,
    });
  }

  const requiredMasterMissing = MASTER_ROW_REQUIRED_HEADERS.filter(
    (header) => isMasterTemplateHeaders(headers) && !headers.includes(header)
  );
  if (requiredMasterMissing.length > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Master template missing required columns: ${requiredMasterMissing.join(', ')}`
    );
  }

  const normalized = normalizeOnboardingRows(rows);
  return { headers, rows: normalized.rows, schema: normalized.schema };
};

const loadTenantReferenceSets = async (tenantId) => {
  const [structures, levels, nodes, roles, users] = await Promise.all([
    Structures.find({ tenantId }).select('name').lean(),
    Level.find({ tenantId, deletedAt: null }).select('name rank').lean(),
    Nodes.find({ tenantId, deletedAt: null }).select('name').lean(),
    Role.find({ tenantId, deletedAt: null }).select('name').lean(),
    User.find({ tenantId, deletedAt: null }).select('email').lean(),
  ]);

  return {
    structures: new Set(structures.map((x) => norm(x.name))),
    levels: new Set(levels.map((x) => norm(x.name))),
    nodes: new Set(nodes.map((x) => norm(x.name))),
    roles: new Set(roles.map((x) => norm(x.name))),
    users: new Set(users.map((x) => norm(x.email))),
  };
};

const validateOnboardingCsvDryRun = async ({ tenantId, csvText, parsedRows }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  const hasParsedRows = Array.isArray(parsedRows) && parsedRows.length > 0;
  if (!hasParsedRows && !String(csvText || '').trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'csvText is required');
  }

  const rows = hasParsedRows
    ? normalizeOnboardingRows(normalizeParsedRows(parsedRows)).rows
    : parseCsvText(csvText).rows;
  const refs = await loadTenantReferenceSets(tenantId);

  const errors = [];
  const warnings = [];
  const seenKeys = new Set();

  const fileRefs = {
    structures: new Set(),
    levels: new Set(),
    nodes: new Set(),
    roles: new Set(),
    users: new Set(),
  };
  const userEmailLines = new Map();

  rows.forEach(({ lineNumber, row }) => {
    const type = norm(row.record_type);
    const userNodeName = getUserNodeName(row);
    const keyBase =
      type === 'structure'
        ? row.structure_name
        : type === 'level'
          ? `${row.level_name}|${row.structure_name}`
          : type === 'node'
            ? `${row.node_name}|${row.parent_node_name || ''}`
            : type === 'role'
              ? row.role_name
              : type === 'user'
                ? row.user_email
                : type === 'user_role'
                  ? `${row.user_email}|${row.role_name}`
                  : type === 'user_node'
                    ? `${row.user_email}|${userNodeName}`
                    : '';
    const dedupeKey = `${type}|${norm(keyBase)}`;
    if (type && keyBase && !seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
    } else if (type && keyBase) {
      warnings.push({
        line: lineNumber,
        code: 'duplicate_row',
        message: `Duplicate ${type} row for key "${keyBase}"`,
      });
    }
  });

  rows.forEach(({ lineNumber, row }) => {
    const type = norm(row.record_type);
    if (!ALLOWED_RECORD_TYPES.has(type)) {
      errors.push({
        line: lineNumber,
        code: 'invalid_record_type',
        message: `Unsupported record_type "${row.record_type}"`,
      });
      return;
    }

    const required = REQUIRED_BY_TYPE[type] || [];
    required.forEach((col) => {
      if (!String(row[col] || '').trim()) {
        errors.push({
          line: lineNumber,
          code: 'missing_required_column',
          message: `Missing required value for ${col} (${type})`,
        });
      }
    });

    if (type === 'level' && row.level_rank && !/^\d+$/.test(String(row.level_rank))) {
      errors.push({
        line: lineNumber,
        code: 'invalid_level_rank',
        message: `level_rank must be an integer, got "${row.level_rank}"`,
      });
    }

    if (type === 'structure') fileRefs.structures.add(norm(row.structure_name));
    if (type === 'level') fileRefs.levels.add(norm(row.level_name));
    if (type === 'node') fileRefs.nodes.add(norm(row.node_name));
    if (type === 'role') fileRefs.roles.add(norm(row.role_name));
    if (type === 'user') {
      const userEmailKey = norm(row.user_email);
      if (userEmailKey) {
        fileRefs.users.add(userEmailKey);
        if (!userEmailLines.has(userEmailKey)) {
          userEmailLines.set(userEmailKey, []);
        }
        userEmailLines.get(userEmailKey).push(lineNumber);
      }
    }
  });

  if (fileRefs.users.size > 0) {
    const existingUsers = await User.find({
      email: { $in: [...fileRefs.users] },
      deletedAt: null,
    })
      .select('email tenantId')
      .lean();

    existingUsers.forEach((existingUser) => {
      const emailKey = norm(existingUser.email);
      if (!emailKey) return;
      if (String(existingUser.tenantId || '') === String(tenantId || '')) return;
      const lines = userEmailLines.get(emailKey) || [];
      lines.forEach((line) => {
        errors.push({
          line,
          code: 'email_registered_in_other_tenant',
          message: `User email "${existingUser.email}" already exists in another tenant (${existingUser.tenantId}). Use another email.`,
        });
      });
    });
  }

  rows.forEach(({ lineNumber, row }) => {
    const type = norm(row.record_type);
    if (!ALLOWED_RECORD_TYPES.has(type)) return;

    const hasStructure = (name) =>
      refs.structures.has(norm(name)) || fileRefs.structures.has(norm(name));
    const hasLevel = (name) =>
      refs.levels.has(norm(name)) || fileRefs.levels.has(norm(name));
    const hasNode = (name) => refs.nodes.has(norm(name)) || fileRefs.nodes.has(norm(name));
    const hasRole = (name) => refs.roles.has(norm(name)) || fileRefs.roles.has(norm(name));
    const hasUser = (email) => refs.users.has(norm(email)) || fileRefs.users.has(norm(email));

    if (type === 'level' && row.structure_name && !hasStructure(row.structure_name)) {
      errors.push({
        line: lineNumber,
        code: 'missing_structure_reference',
        message: `Referenced structure "${row.structure_name}" not found in file or DB`,
      });
    }

    if (type === 'node') {
      if (row.structure_name && !hasStructure(row.structure_name)) {
        errors.push({
          line: lineNumber,
          code: 'missing_structure_reference',
          message: `Referenced structure "${row.structure_name}" not found in file or DB`,
        });
      }
      if (row.level_name && !hasLevel(row.level_name)) {
        errors.push({
          line: lineNumber,
          code: 'missing_level_reference',
          message: `Referenced level "${row.level_name}" not found in file or DB`,
        });
      }
      if (row.parent_node_name && !hasNode(row.parent_node_name)) {
        errors.push({
          line: lineNumber,
          code: 'missing_parent_node_reference',
          message: `Referenced parent node "${row.parent_node_name}" not found in file or DB`,
        });
      }
    }

    if (type === 'user_role') {
      if (!hasUser(row.user_email)) {
        errors.push({
          line: lineNumber,
          code: 'missing_user_reference',
          message: `Referenced user "${row.user_email}" not found in file or DB`,
        });
      }
      if (!hasRole(row.role_name)) {
        errors.push({
          line: lineNumber,
          code: 'missing_role_reference',
          message: `Referenced role "${row.role_name}" not found in file or DB`,
        });
      }
    }

    if (type === 'user_node') {
      const nodeName = getUserNodeName(row);
      if (!hasUser(row.user_email)) {
        errors.push({
          line: lineNumber,
          code: 'missing_user_reference',
          message: `Referenced user "${row.user_email}" not found in file or DB`,
        });
      }
      if (!hasNode(nodeName)) {
        errors.push({
          line: lineNumber,
          code: 'missing_node_reference',
          message: `Referenced node "${nodeName}" not found in file or DB`,
        });
      }
    }
  });

  const byType = rows.reduce((acc, { row }) => {
    const type = norm(row.record_type);
    if (!type) return acc;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return {
    dryRun: true,
    ok: errors.length === 0,
    summary: {
      rowCount: rows.length,
      byRecordType: byType,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
    nextStep: errors.length
      ? 'Fix errors, then rerun dryRun'
      : 'Dry-run passed. Next: enable staged execution mode',
  };
};

const resolveActorUserId = (actorUser = {}) =>
  actorUser.id || actorUser._id || actorUser.userId || null;

const buildRoleActor = (tenantId, actorUser = {}) => ({
  tenantId,
  userId: actorUser.userId || actorUser.id || actorUser._id,
  isOwner: Boolean(actorUser.isOwner),
  isSuper: Boolean(actorUser.isSuper),
  isSaby: Boolean(actorUser.isSaby),
  hasPermissionToCreateRoles: Boolean(actorUser.hasPermissionToCreateRoles),
});

const preloadReferenceMaps = async (tenantId) => {
  const [structures, levels, nodes, roles, users] = await Promise.all([
    Structures.find({ tenantId }).lean(),
    Level.find({ tenantId, deletedAt: null }).lean(),
    Nodes.find({ tenantId, deletedAt: null }).lean(),
    Role.find({ tenantId, deletedAt: null }).lean(),
    User.find({ tenantId, deletedAt: null }).lean(),
  ]);

  const nodeRefs = {
    nodesByName: new Map(),
    nodesByComposite: new Map(),
  };
  nodes.forEach((node) => {
    indexNodeRef(nodeRefs, node);
  });

  return {
    structuresByName: new Map(structures.map((x) => [norm(x.name), x])),
    levelsByName: new Map(levels.map((x) => [norm(x.name), x])),
    levelsById: new Map(levels.map((x) => [String(x._id), x])),
    levelsByRank: new Map(levels.map((x) => [String(x.rank), x])),
    nodesByName: nodeRefs.nodesByName,
    nodesByComposite: nodeRefs.nodesByComposite,
    rootNode: nodes.find((x) => !x.parent) || null,
    rolesByName: new Map(roles.map((x) => [norm(x.name), x])),
    usersByEmail: new Map(users.map((x) => [norm(x.email), x])),
  };
};

const summarizeRows = (rows = []) => {
  const out = {
    created: 0,
    updated: 0,
    assigned: 0,
    skipped: 0,
    failed: 0,
  };
  rows.forEach((r) => {
    const a = String(r.action || '').toLowerCase();
    if (a === 'created') out.created += 1;
    else if (a === 'updated') out.updated += 1;
    else if (a === 'assigned') out.assigned += 1;
    else if (a === 'failed') out.failed += 1;
    else out.skipped += 1;
  });
  return out;
};

const importOnboardingCsv = async ({
  tenantId,
  csvText,
  parsedRows,
  actorUser = {},
}) => {
  const validation = await validateOnboardingCsvDryRun({
    tenantId,
    csvText,
    parsedRows,
  });
  if (!validation.ok) {
    return {
      dryRun: false,
      executed: false,
      ok: false,
      summary: validation.summary,
      validationErrors: validation.errors,
      warnings: validation.warnings,
      rows: [],
      nextStep: 'Fix validation errors, then rerun execution mode',
    };
  }

  const actorUserId = resolveActorUserId(actorUser);
  if (!actorUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'actor user id is required');
  }

  const roleActor = buildRoleActor(tenantId, actorUser);
  const rows =
    Array.isArray(parsedRows) && parsedRows.length > 0
      ? normalizeOnboardingRows(normalizeParsedRows(parsedRows)).rows
      : parseCsvText(csvText).rows;
  const refs = await preloadReferenceMaps(tenantId);
  const undoStack = [];
  const rowResults = [];
  const stageResults = [];
  const warnings = [...(validation.warnings || [])];
  const defaultPassword = 'SabyTemp123!';

  const levelRows = rows.filter((x) => norm(x.row.record_type) === 'level');
  const structureRows = rows.filter((x) => norm(x.row.record_type) === 'structure');
  const nodeRows = rows.filter((x) => norm(x.row.record_type) === 'node');
  const roleRows = rows.filter((x) => norm(x.row.record_type) === 'role');
  const userRows = rows.filter((x) => norm(x.row.record_type) === 'user');
  const userRoleRows = rows.filter((x) => norm(x.row.record_type) === 'user_role');
  const userNodeRows = rows.filter((x) => norm(x.row.record_type) === 'user_node');
  const levelRankByName = new Map();
  levelRows.forEach(({ row }) => {
    const levelKey = norm(row.level_name);
    const levelRank = Number(getSafe(row, 'level_rank'));
    if (levelKey && Number.isInteger(levelRank)) {
      levelRankByName.set(levelKey, levelRank);
    }
  });
  const csvHasRootRankLevel = [...levelRankByName.values()].some((rank) => rank === 0);
  if (csvHasRootRankLevel && refs.rootNode && !refs.levelsByRank.has('0')) {
    const rootLevel = refs.levelsById.get(String(refs.rootNode.level));
    if (rootLevel && Number(rootLevel.rank) !== 0) {
      const updatedRootLevel = await levelService.updateLevelById(rootLevel._id, {
        tenantId,
        rank: 0,
      });
      const updatedLevel = updatedRootLevel.toObject
        ? updatedRootLevel.toObject()
        : updatedRootLevel;
      refs.levelsByRank.delete(String(rootLevel.rank));
      refs.levelsByRank.set('0', updatedLevel);
      refs.levelsByName.set(norm(updatedLevel.name), updatedLevel);
      refs.levelsById.set(String(updatedLevel._id), updatedLevel);
      warnings.push({
        line: 1,
        code: 'root_level_rebased',
        message: `Existing root level "${updatedLevel.name}" rebased to rank 0 before import`,
      });
    }
  }

  const failed = [];
  let rolledBack = false;
  const rollbackErrors = [];

  const runStage = async (
    name,
    items,
    handler,
    { continueOnError = false } = {}
  ) => {
    const startCount = rowResults.length;
    let stageFailedCount = 0;
    try {
      // eslint-disable-next-line no-restricted-syntax
      for (const item of items) {
        if (!continueOnError) {
          // eslint-disable-next-line no-await-in-loop
          await handler(item);
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          await handler(item);
        } catch (error) {
          stageFailedCount += 1;
          rowResults.push({
            line: Number(item?.lineNumber || 0) || null,
            recordType: norm(item?.row?.record_type) || name,
            action: 'failed',
            status: 'failed',
            reason: error.message,
          });
        }
      }
      stageResults.push({
        stage: name,
        status: stageFailedCount > 0 ? 'completed_with_errors' : 'completed',
        ...summarizeRows(rowResults.slice(startCount)),
      });
    } catch (error) {
      stageResults.push({
        stage: name,
        status: 'failed',
        error: error.message,
        ...summarizeRows(rowResults.slice(startCount)),
      });
      throw error;
    }
  };

  try {
    await runStage('stage_1_levels', levelRows, async ({ lineNumber, row }) => {
      const levelName = getSafe(row, 'level_name');
      const levelRank = Number(getSafe(row, 'level_rank'));
      const key = norm(levelName);
      const existing = refs.levelsByName.get(key);
      const byRank = refs.levelsByRank.get(String(levelRank));
      const canReuseByRank = levelRank === 0 && byRank;

      if (existing) {
        if (canReuseByRank && String(byRank._id) !== String(existing._id)) {
          refs.levelsByName.set(key, byRank);
          rowResults.push({
            line: lineNumber,
            recordType: 'level',
            action: 'skipped',
            status: 'ok',
            entityId: String(byRank._id),
            reason: 'rank_mapped_to_existing',
          });
          warnings.push({
            line: lineNumber,
            code: 'level_rank_reused',
            message: `Level "${levelName}" mapped to existing level "${byRank.name}" at rank ${levelRank}`,
          });
          return;
        }
        const updates = {};
        if (Number(existing.rank) !== levelRank) updates.rank = levelRank;
        if (existing.deletedAt) updates.deletedAt = null;
        if (Object.keys(updates).length === 0) {
          rowResults.push({
            line: lineNumber,
            recordType: 'level',
            action: 'skipped',
            status: 'ok',
            entityId: String(existing._id),
            reason: 'already_exists',
          });
          return;
        }

        const before = { ...existing };
        const updated = await levelService.updateLevelById(existing._id, {
          ...updates,
          tenantId,
        });
        const updatedLevel = updated.toObject ? updated.toObject() : updated;
        refs.levelsByName.set(key, updatedLevel);
        refs.levelsByRank.set(String(updatedLevel.rank), updatedLevel);
        refs.levelsById.set(String(updatedLevel._id), updatedLevel);
        undoStack.push(async () => {
          await levelService.updateLevelById(existing._id, {
            tenantId,
            name: before.name,
            rank: before.rank,
            description: before.description || '',
            isSpecial: Boolean(before.isSpecial),
            isActive: before.isActive !== false,
          });
        });
        rowResults.push({
          line: lineNumber,
          recordType: 'level',
          action: 'updated',
          status: 'ok',
          entityId: String(existing._id),
        });
        return;
      }

      if (canReuseByRank) {
        refs.levelsByName.set(key, byRank);
        rowResults.push({
          line: lineNumber,
          recordType: 'level',
          action: 'skipped',
          status: 'ok',
          entityId: String(byRank._id),
          reason: 'rank_mapped_to_existing',
        });
        warnings.push({
          line: lineNumber,
          code: 'level_rank_reused',
          message: `Level "${levelName}" mapped to existing level "${byRank.name}" at rank ${levelRank}`,
        });
        return;
      }

      const created = await levelService.createLevel({
        tenantId,
        name: levelName,
        rank: levelRank,
        description: '',
        isSpecial: false,
        isActive: true,
      });
      const createdLevel = created.toObject ? created.toObject() : created;
      refs.levelsByName.set(key, createdLevel);
      refs.levelsByRank.set(String(levelRank), createdLevel);
      refs.levelsById.set(String(createdLevel._id), createdLevel);
      undoStack.push(async () => {
        await Level.deleteOne({ _id: created._id });
      });
      rowResults.push({
        line: lineNumber,
        recordType: 'level',
        action: 'created',
        status: 'ok',
        entityId: String(created._id),
      });
    });

    const structurePreferredLevel = new Map();
    levelRows.forEach(({ row }) => {
      const structKey = norm(row.structure_name);
      const levelKey = norm(row.level_name);
      if (!structKey || !levelKey) return;
      if (!structurePreferredLevel.has(structKey)) {
        structurePreferredLevel.set(structKey, levelKey);
      }
    });
    nodeRows.forEach(({ row }) => {
      const structKey = norm(row.structure_name);
      const levelKey = norm(row.level_name);
      if (!structKey || !levelKey) return;
      if (!structurePreferredLevel.has(structKey)) {
        structurePreferredLevel.set(structKey, levelKey);
      }
    });

    await runStage(
      'stage_1_structures',
      structureRows,
      async ({ lineNumber, row }) => {
        const structureName = getSafe(row, 'structure_name');
        const structureKey = norm(structureName);
        const levelKey =
          norm(row.level_name) || structurePreferredLevel.get(structureKey);
        const level = refs.levelsByName.get(levelKey);
        if (!level) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `line ${lineNumber}: structure "${structureName}" has no resolvable level`
          );
        }

        const existing = refs.structuresByName.get(structureKey);
        if (existing) {
          const needsLevelUpdate =
            String(existing.level || '') !== String(level._id || '');
          if (!needsLevelUpdate) {
            rowResults.push({
              line: lineNumber,
              recordType: 'structure',
              action: 'skipped',
              status: 'ok',
              entityId: String(existing._id),
              reason: 'already_exists',
            });
            return;
          }

          const before = { ...existing };
          const updated = await structureService.updateStructureById(existing._id, {
            level: level._id,
          });
          refs.structuresByName.set(
            structureKey,
            updated.toObject ? updated.toObject() : updated
          );
          undoStack.push(async () => {
            await structureService.updateStructureById(existing._id, {
              name: before.name,
              level: before.level,
              code: before.code || '',
              description: before.description || '',
              isSpecial: Boolean(before.isSpecial),
              isActive: before.isActive !== false,
            });
          });
          rowResults.push({
            line: lineNumber,
            recordType: 'structure',
            action: 'updated',
            status: 'ok',
            entityId: String(existing._id),
          });
          return;
        }

        const created = await structureService.createStructure({
          tenantId,
          name: structureName,
          code: getSafe(row, 'structure_code') || '',
          description: getSafe(row, 'structure_description') || '',
          level: level._id,
          createdBy: actorUserId,
          isActive: true,
          isSpecial: false,
          type: 'administrative',
        });
        refs.structuresByName.set(
          structureKey,
          created.toObject ? created.toObject() : created
        );
        undoStack.push(async () => {
          await Structures.deleteOne({ _id: created._id });
        });
        rowResults.push({
          line: lineNumber,
          recordType: 'structure',
          action: 'created',
          status: 'ok',
          entityId: String(created._id),
        });
      }
    );

    await runStage('stage_2_nodes', nodeRows, async ({ lineNumber, row }) => {
      const nodeName = getSafe(row, 'node_name');
      const level = refs.levelsByName.get(norm(row.level_name));
      const structure = refs.structuresByName.get(norm(row.structure_name));
      const parentName = getSafe(row, 'parent_node_name');
      const parentLevel = refs.levelsByName.get(norm(row.parent_level_name));
      const rankFromMap = levelRankByName.get(norm(row.level_name));
      const rankValue =
        Number.isInteger(rankFromMap) ? rankFromMap : Number(level?.rank);
      const isRootCsvRow = !parentName && rankValue === 0;
      const nodeAddress =
        getSafe(row, 'node_address') || getSafe(row, 'address') || '';
      const parent = parentName
        ? resolveNodeRef(refs, {
            name: parentName,
            levelRef: parentLevel?._id || null,
          })
        : null;
      const existing = resolveNodeRef(refs, {
        name: nodeName,
        levelRef: level?._id || null,
        parentRef: parent ? parent._id : null,
      });

      if (!level || !structure) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `line ${lineNumber}: node "${nodeName}" has unresolved level/structure`
        );
      }
      if (parentName && !parent) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `line ${lineNumber}: node "${nodeName}" has unresolved parent "${parentName}"`
        );
      }

      if (isRootCsvRow && refs.rootNode) {
        const rootTarget = refs.rootNode;
        const before = { ...rootTarget };
        const updatePayload = {
          name: nodeName,
          level: level._id,
          structure: structure._id,
          parent: null,
        };
        if (nodeAddress) {
          updatePayload.address = nodeAddress;
        }
        const needsUpdate =
          String(rootTarget.name || '') !== String(nodeName || '') ||
          String(rootTarget.level || '') !== String(level._id || '') ||
          String(rootTarget.structure || '') !== String(structure._id || '') ||
          String(rootTarget.parent || '') !== '' ||
          (nodeAddress && String(rootTarget.address || '') !== String(nodeAddress));

        if (!needsUpdate) {
          indexNodeRef(refs, rootTarget);
          rowResults.push({
            line: lineNumber,
            recordType: 'node',
            action: 'skipped',
            status: 'ok',
            entityId: String(rootTarget._id),
            reason: 'root_reused',
          });
          return;
        }

        const updatedRoot = await nodeService.updateNodeById(
          rootTarget._id,
          updatePayload
        );
        const updatedRootObject = updatedRoot.toObject ? updatedRoot.toObject() : updatedRoot;
        refs.rootNode = updatedRootObject;
        normalizeNodeRef(updatedRootObject);
        unindexNodeRef(refs, before);
        indexNodeRef(refs, updatedRootObject);
        undoStack.push(async () => {
          await nodeService.updateNodeById(rootTarget._id, {
            name: before.name,
            level: before.level,
            structure: before.structure,
            parent: before.parent || null,
            ...(before.address ? { address: before.address } : {}),
          });
        });
        rowResults.push({
          line: lineNumber,
          recordType: 'node',
          action: 'updated',
          status: 'ok',
          entityId: String(rootTarget._id),
          reason: 'root_reused',
        });
        warnings.push({
          line: lineNumber,
          code: 'root_node_reused',
          message: `Root node reused and updated to "${nodeName}"`,
        });
        return;
      }

      if (existing) {
        const before = { ...existing };
        const updated = await nodeService.updateNodeById(existing._id, {
          name: nodeName,
          level: level._id,
          structure: structure._id,
          parent: parent?._id || null,
          ...(nodeAddress ? { address: nodeAddress } : {}),
        });
        const updatedObject = updated.toObject ? updated.toObject() : updated;
        unindexNodeRef(refs, before);
        normalizeNodeRef(updatedObject);
        indexNodeRef(refs, updatedObject);
        undoStack.push(async () => {
          await nodeService.updateNodeById(existing._id, {
            name: before.name,
            level: before.level,
            structure: before.structure,
            parent: before.parent || null,
          });
        });
        rowResults.push({
          line: lineNumber,
          recordType: 'node',
          action: 'updated',
          status: 'ok',
          entityId: String(existing._id),
        });
        return;
      }

      const created = await nodeService.createNode({
        tenantId,
        name: nodeName,
        level: level._id,
        structure: structure._id,
        parent: parent?._id || null,
        isActive: true,
        ...(nodeAddress ? { address: nodeAddress } : {}),
      });
      const createdNode = created.toObject ? created.toObject() : created;
      normalizeNodeRef(createdNode);
      indexNodeRef(refs, createdNode);
      if (isRootCsvRow || (!parentName && !refs.rootNode)) {
        refs.rootNode = createdNode;
      }
      undoStack.push(async () => {
        await Nodes.deleteOne({ _id: created._id });
      });
      rowResults.push({
        line: lineNumber,
        recordType: 'node',
        action: 'created',
        status: 'ok',
        entityId: String(created._id),
      });
    });

    await runStage('stage_3_roles', roleRows, async ({ lineNumber, row }) => {
      const roleName = getSafe(row, 'role_name');
      const roleDesc = getSafe(row, 'role_description');
      const key = norm(roleName);
      const existing = refs.rolesByName.get(key);

      if (existing) {
        if (!roleDesc || String(existing.description || '') === roleDesc) {
          rowResults.push({
            line: lineNumber,
            recordType: 'role',
            action: 'skipped',
            status: 'ok',
            entityId: String(existing._id),
            reason: 'already_exists',
          });
          return;
        }
        const before = { ...existing };
        const updated = await roleService.updateRoleById(
          existing._id,
          { description: roleDesc },
          roleActor
        );
        refs.rolesByName.set(key, updated.toObject ? updated.toObject() : updated);
        undoStack.push(async () => {
          await roleService.updateRoleById(
            existing._id,
            { description: before.description || '' },
            roleActor
          );
        });
        rowResults.push({
          line: lineNumber,
          recordType: 'role',
          action: 'updated',
          status: 'ok',
          entityId: String(existing._id),
        });
        return;
      }

      let created;
      try {
        created = await roleService.createRole(
          {
            roleName,
            roleDescription: roleDesc || '',
          },
          roleActor
        );
      } catch (err) {
        if (err.code === 11000) {
          created = await Role.findOne({ name: roleName, tenantId });
          if (!created) throw err;
        } else {
          throw err;
        }
      }
      refs.rolesByName.set(key, created.toObject ? created.toObject() : created);
      undoStack.push(async () => {
        await Role.deleteOne({ _id: created._id });
      });
      rowResults.push({
        line: lineNumber,
        recordType: 'role',
        action: 'created',
        status: 'ok',
        entityId: String(created._id),
      });
    });

    await runStage(
      'stage_4_users',
      userRows,
      async ({ lineNumber, row }) => {
      const email = getSafe(row, 'user_email').toLowerCase();
      const firstName = getSafe(row, 'first_name');
      const lastName = getSafe(row, 'last_name');
      const phoneNumber = getSafe(row, 'phone_number') || null;
      const password = getSafe(row, 'user_password') || defaultPassword;
      const key = norm(email);

      if (!getSafe(row, 'user_password')) {
        warnings.push({
          line: lineNumber,
          code: 'default_password_used',
          message: `No user_password for "${email}". Default temporary password applied.`,
        });
      }

      const existing = refs.usersByEmail.get(key);
      if (existing) {
        const updated = await userService.updateUserById(existing._id, {
          firstname: firstName || existing.firstname,
          lastname: lastName || existing.lastname,
          phoneNumber: phoneNumber || existing.phoneNumber || null,
        });
        refs.usersByEmail.set(key, updated.toObject ? updated.toObject() : updated);
        rowResults.push({
          line: lineNumber,
          recordType: 'user',
          action: 'updated',
          status: 'ok',
          entityId: String(existing._id),
        });
        return;
      }

      const created = await userService.ownerCreate({
        email,
        firstname: firstName,
        lastname: lastName,
        phoneNumber,
        password,
        createdBy: actorUserId,
        isOwner: false,
        isSuper: false,
        isAdmin: false,
        isSaby: false,
      });
      refs.usersByEmail.set(key, created.toObject ? created.toObject() : created);
      rowResults.push({
        line: lineNumber,
        recordType: 'user',
        action: 'created',
        status: 'ok',
        entityId: String(created._id),
      });
      },
      { continueOnError: true }
    );

    await runStage(
      'stage_5_user_roles',
      userRoleRows,
      async ({ lineNumber, row }) => {
      const user = refs.usersByEmail.get(norm(row.user_email));
      const role = refs.rolesByName.get(norm(row.role_name));
      if (!user || !role) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `line ${lineNumber}: unresolved user/role for binding`
        );
      }

      const userId = String(user._id);
      const roleId = String(role._id);
      const currentRoles = (user.roles || []).map((x) => String(x));

      if (currentRoles.includes(roleId)) {
        rowResults.push({
          line: lineNumber,
          recordType: 'user_role',
          action: 'skipped',
          status: 'ok',
          entityId: userId,
          reason: 'already_assigned',
        });
        return;
      }

      const updated = await userService.assignRoles(userId, [roleId]);
      refs.usersByEmail.set(
        norm(updated.email || row.user_email),
        updated.toObject ? updated.toObject() : updated
      );
      rowResults.push({
        line: lineNumber,
        recordType: 'user_role',
        action: 'assigned',
        status: 'ok',
        entityId: userId,
      });
      },
      { continueOnError: true }
    );

    await runStage(
      'stage_5_user_nodes',
      userNodeRows,
      async ({ lineNumber, row }) => {
      const user = refs.usersByEmail.get(norm(row.user_email));
      const nodeName = getUserNodeName(row);
      const level = refs.levelsByName.get(norm(row.level_name));
      const parentLevel = refs.levelsByName.get(norm(row.parent_level_name));
      const parent = getSafe(row, 'parent_node_name')
        ? resolveNodeRef(refs, {
            name: row.parent_node_name,
            levelRef: parentLevel?._id || null,
          })
        : null;
      const node = resolveNodeRef(refs, {
        name: nodeName,
        levelRef: level?._id || null,
        parentRef: parent ? parent._id : null,
      });
      if (!user || !node) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `line ${lineNumber}: unresolved user/node for posting`
        );
      }

      const nodeDoc = await nodeService.getNodeById(node._id);
      const currentUsers = (nodeDoc.users || []).map((x) => String(x));
      const userId = String(user._id);
      if (currentUsers.includes(userId)) {
        rowResults.push({
          line: lineNumber,
          recordType: 'user_node',
          action: 'skipped',
          status: 'ok',
          entityId: String(node._id),
          reason: 'already_posted',
        });
        return;
      }

      const merged = [...currentUsers, userId];
      const updated = await nodeService.assignUsersToNode(String(node._id), merged);
      normalizeNodeRef(updated);
      indexNodeRef(refs, updated.toObject ? updated.toObject() : updated);
      rowResults.push({
        line: lineNumber,
        recordType: 'user_node',
        action: 'assigned',
        status: 'ok',
        entityId: String(node._id),
      });
      },
      { continueOnError: true }
    );
  } catch (error) {
    failed.push({
      line: null,
      recordType: 'system',
      action: 'failed',
      status: 'failed',
      reason: error.message,
    });
  }

  if (failed.length > 0) {
    rolledBack = true;
    for (let i = undoStack.length - 1; i >= 0; i -= 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await undoStack[i]();
      } catch (rollbackError) {
        rollbackErrors.push({
          step: i,
          message: rollbackError.message,
        });
      }
    }
  }

  const byType = rows.reduce((acc, { row }) => {
    const type = norm(row.record_type);
    if (!type) return acc;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const counters = summarizeRows(rowResults);
  const totalFailures = counters.failed + failed.length;
  const retainedCounters = rolledBack
    ? {
        created: 0,
        updated: 0,
        assigned: 0,
        skipped: counters.skipped,
        failed: totalFailures,
      }
    : { ...counters, failed: totalFailures };
  const completedWithErrors = !rolledBack && totalFailures > 0;
  return {
    dryRun: false,
    executed: true,
    ok: failed.length === 0 && counters.failed === 0,
    completedWithErrors,
    summary: {
      rowCount: rows.length,
      byRecordType: byType,
      completedWithErrors,
      created: retainedCounters.created,
      updated: retainedCounters.updated,
      assigned: retainedCounters.assigned,
      skipped: retainedCounters.skipped,
      failed: retainedCounters.failed,
      attemptedCreated: counters.created,
      attemptedUpdated: counters.updated,
      attemptedAssigned: counters.assigned,
      attemptedSkipped: counters.skipped,
      attemptedFailed: totalFailures,
      rolledBack,
      rollbackErrors: rollbackErrors.length,
    },
    rows: rowResults,
    failures: failed,
    stageResults,
    warnings,
    nextStep:
      completedWithErrors
        ? 'Import completed with some row-level errors. Review failed rows and retry only those rows.'
        : failed.length === 0
          ? 'Onboarding import completed'
          : 'Import failed and rollback attempted. Fix errors and rerun.',
  };
};

module.exports = {
  validateOnboardingCsvDryRun,
  importOnboardingCsv,
  __private: {
    parseCsvText,
    parseCsvLine,
    getUserNodeName,
  },
};
