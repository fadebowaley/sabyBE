#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const MASTER_REQUIRED = [
  'LEVEL',
  'STRUCTURE',
  'CHURCH NAME',
  'ROLE',
  'PASTORS NAME',
  'EMAIL',
];

const WIDE_HEADER = [
  'record_type',
  'structure_name',
  'level_name',
  'level_rank',
  'node_name',
  'parent_node_name',
  'role_name',
  'user_email',
  'first_name',
  'last_name',
  'phone_number',
  'user_password',
];

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
  return out.map((v) => String(v || '').trim());
};

const escapeCsv = (value) => {
  const s = String(value == null ? '' : value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const norm = (value) => String(value || '').trim();
const normLower = (value) => norm(value).toLowerCase();

const parseMasterRows = (filePath) => {
  const raw = fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (raw.length < 2) {
    throw new Error('Master CSV must have header + at least one row');
  }

  const headers = parseCsvLine(raw[0]);
  const headerMap = new Map(headers.map((h, i) => [h, i]));
  for (const h of MASTER_REQUIRED) {
    if (!headerMap.has(h)) {
      throw new Error(`Missing required master header: ${h}`);
    }
  }

  const rows = [];
  for (let i = 1; i < raw.length; i += 1) {
    const vals = parseCsvLine(raw[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push({ line: i + 1, row });
  }
  return rows;
};

const stripTitle = (name) => {
  let n = norm(name);
  const prefixes = [
    /^PASTOR\s+/i,
    /^DEACONESS\s+/i,
    /^DEACON\s+/i,
    /^DCNS\.?\s+/i,
    /^DCN\.?\s+/i,
    /^A\/P\.?\s+/i,
    /^ASSIST(?:ANT)?\s+PASTOR\s+/i,
    /^BRO\.?\s+/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prefixes) {
      if (p.test(n)) {
        n = n.replace(p, '').trim();
        changed = true;
      }
    }
  }
  return n || norm(name);
};

const splitName = (fullName) => {
  const cleaned = stripTitle(fullName);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Unknown', lastName: 'User' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'User' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const toWide = (masterRows, structureName) => {
  const out = [];

  const levelByRank = new Map();
  const roleSet = new Set();
  const userMap = new Map();
  const userRoleSet = new Set();
  const userNodeSet = new Set();
  const nodeRows = [];

  const stack = [];
  const seenNodeNames = new Set();

  for (const { line, row } of masterRows) {
    const levelRankRaw = norm(row.LEVEL);
    if (!/^\d+$/.test(levelRankRaw)) {
      throw new Error(`Line ${line}: LEVEL must be integer`);
    }
    const levelRank = Number(levelRankRaw);
    const levelName = norm(row.STRUCTURE);
    const nodeName = norm(row['CHURCH NAME']);
    const roleName = norm(row.ROLE);
    const email = normLower(row.EMAIL);
    const phone = norm(row['PHONE NO']);
    const password = norm(row.PASSWORD);

    if (!levelByRank.has(levelRank)) {
      levelByRank.set(levelRank, levelName || `Level ${levelRank}`);
    } else if (levelByRank.get(levelRank) !== levelName) {
      throw new Error(
        `Line ${line}: LEVEL ${levelRank} maps to multiple STRUCTURE names`
      );
    }

    while (stack.length && stack[stack.length - 1].level >= levelRank) {
      stack.pop();
    }
    const parentNodeName = stack.length ? stack[stack.length - 1].nodeName : '';
    stack.push({ level: levelRank, nodeName });

    if (seenNodeNames.has(nodeName)) {
      throw new Error(`Line ${line}: duplicate CHURCH NAME "${nodeName}"`);
    }
    seenNodeNames.add(nodeName);
    nodeRows.push({
      levelRank,
      levelName,
      nodeName,
      parentNodeName,
    });

    roleSet.add(roleName);
    const { firstName, lastName } = splitName(row['PASTORS NAME']);
    if (!userMap.has(email)) {
      userMap.set(email, {
        email,
        firstName,
        lastName,
        phone,
        password,
      });
    }

    userRoleSet.add(`${email}::${roleName}`);
    userNodeSet.add(`${email}::${nodeName}`);
  }

  const structureByLevel = new Map();
  const getStructureForLevel = (levelName) => {
    const key = norm(levelName) || 'LEVEL';
    if (!structureByLevel.has(key)) {
      structureByLevel.set(key, `${structureName} - ${key}`);
    }
    return structureByLevel.get(key);
  };

  [...levelByRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([rank, name]) => {
      const levelStructure = getStructureForLevel(name);
      out.push({
        record_type: 'structure',
        structure_name: levelStructure,
      });
      out.push({
        record_type: 'level',
        structure_name: levelStructure,
        level_name: name,
        level_rank: String(rank),
      });
    });

  nodeRows.forEach((n) => {
    out.push({
      record_type: 'node',
      structure_name: getStructureForLevel(n.levelName),
      level_name: n.levelName,
      node_name: n.nodeName,
      parent_node_name: n.parentNodeName,
    });
  });

  [...roleSet].forEach((role) => {
    out.push({
      record_type: 'role',
      role_name: role,
    });
  });

  [...userMap.values()].forEach((u) => {
    out.push({
      record_type: 'user',
      user_email: u.email,
      first_name: u.firstName,
      last_name: u.lastName,
      phone_number: u.phone,
      user_password: u.password,
    });
  });

  [...userRoleSet].forEach((key) => {
    const [email, role] = key.split('::');
    out.push({
      record_type: 'user_role',
      user_email: email,
      role_name: role,
    });
  });

  [...userNodeSet].forEach((key) => {
    const [email, node] = key.split('::');
    out.push({
      record_type: 'user_node',
      user_email: email,
      node_name: node,
    });
  });

  return out;
};

const inputPath = process.argv[2];
const outputPath = process.argv[3] || '';
const structureName = process.argv[4] || 'Master Structure';

if (!inputPath) {
  console.error(
    'Usage: node scripts/convert-onboarding-master.js <master_csv> [output_csv] [structure_name]'
  );
  process.exit(1);
}

const absIn = path.resolve(inputPath);
if (!fs.existsSync(absIn)) {
  console.error(`File not found: ${absIn}`);
  process.exit(1);
}

try {
  const rows = parseMasterRows(absIn);
  const wideRows = toWide(rows, structureName);
  const lines = [
    WIDE_HEADER.join(','),
    ...wideRows.map((row) =>
      WIDE_HEADER.map((h) => escapeCsv(row[h] || '')).join(',')
    ),
  ];
  const csv = `${lines.join('\n')}\n`;

  if (outputPath) {
    const absOut = path.resolve(outputPath);
    fs.writeFileSync(absOut, csv, 'utf8');
    console.log(`Converted master onboarding CSV -> ${absOut}`);
    console.log(`Rows: ${wideRows.length}`);
  } else {
    process.stdout.write(csv);
  }
} catch (error) {
  console.error(`Conversion failed: ${error.message}`);
  process.exit(1);
}
