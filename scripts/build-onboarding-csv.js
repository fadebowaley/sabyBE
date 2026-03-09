#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

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

const FILES = [
  { name: '01-structures.csv', recordType: 'structure', map: ['structure_name'] },
  {
    name: '02-levels.csv',
    recordType: 'level',
    map: ['structure_name', 'level_name', 'level_rank'],
  },
  {
    name: '03-nodes.csv',
    recordType: 'node',
    map: ['structure_name', 'level_name', 'node_name', 'parent_node_name'],
  },
  { name: '04-roles.csv', recordType: 'role', map: ['role_name'] },
  {
    name: '05-users.csv',
    recordType: 'user',
    map: ['user_email', 'first_name', 'last_name', 'phone_number', 'user_password'],
  },
  { name: '06-user-roles.csv', recordType: 'user_role', map: ['user_email', 'role_name'] },
  { name: '07-user-nodes.csv', recordType: 'user_node', map: ['user_email', 'node_name'] },
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

const readRows = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (raw.length <= 1) return [];
  const headers = parseCsvLine(raw[0]);
  const rows = [];
  for (let i = 1; i < raw.length; i += 1) {
    const vals = parseCsvLine(raw[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push(row);
  }
  return rows;
};

const inputDir = process.argv[2] || path.join(process.cwd(), 'docs', 'onboarding-tables');
const outputPath =
  process.argv[3] || path.join(process.cwd(), 'docs', 'copilot-onboarding-template.csv');

const outputRows = [];

FILES.forEach((def) => {
  const filePath = path.join(inputDir, def.name);
  const rows = readRows(filePath);
  rows.forEach((row) => {
    const wide = {};
    WIDE_HEADER.forEach((h) => {
      wide[h] = '';
    });
    wide.record_type = def.recordType;
    def.map.forEach((field) => {
      wide[field] = row[field] || '';
    });
    outputRows.push(wide);
  });
});

const lines = [
  WIDE_HEADER.join(','),
  ...outputRows.map((row) => WIDE_HEADER.map((h) => escapeCsv(row[h])).join(',')),
];

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Built onboarding CSV: ${outputPath}`);
console.log(`Rows: ${outputRows.length}`);
