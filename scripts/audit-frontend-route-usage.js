#!/usr/bin/env node

/**
 * Audit backend /v1 mounted routes against frontend API endpoint usage.
 *
 * Usage:
 *   node scripts/audit-frontend-route-usage.js
 *   node scripts/audit-frontend-route-usage.js --write
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');
const defaultWebPortalRoot = path.resolve(workspaceRoot, '..', 'sodzo-webclient');

const backendRouteFile = path.join(repoRoot, 'src/routes/v1/index.js');
const outputFile = path.join(repoRoot, 'docs/route-frontend-usage-audit.txt');

const frontendRoots = [
  path.join(workspaceRoot, 'sabyFrontend/apps/isomorphic/src'),
  path.join(workspaceRoot, 'sabyFrontend/packages/isomorphic-core/src'),
  path.join(defaultWebPortalRoot, 'src'),
];

const sourceExt = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

function readBackendRoutes(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const sanitizedSource = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');
  const mounted = [];

  for (const match of sanitizedSource.matchAll(/path:\s*'([^']+)'/g)) {
    if (!mounted.includes(match[1])) mounted.push(match[1]);
  }

  for (const match of sanitizedSource.matchAll(/router\.use\('([^']+)'/g)) {
    if (!mounted.includes(match[1])) mounted.push(match[1]);
  }

  return mounted.sort((a, b) => a.localeCompare(b));
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'coverage'
      ) {
        continue;
      }
      walk(fullPath, files);
      continue;
    }

    if (sourceExt.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizePath(raw) {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/^https?:\/\/[^/]+/i, '');
  value = value.replace(/^\$\{[^}]+\}/, '');

  const firstSlash = value.indexOf('/');
  if (firstSlash === -1) return null;

  return value.slice(firstSlash);
}

function stripV1Prefix(value) {
  if (value.startsWith('/v1/')) return value.slice(3);
  if (value === '/v1') return '/';
  return value;
}

function extractEndpointsFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Skip files that do not look like API/network call files.
  if (!/(api\s*\.|apiRef\.current|axios\s*\.|fetch\s*\(|buildInternalApiUrl\s*\()/s.test(content)) {
    return [];
  }

  const findings = [];
  const relPath = path.relative(workspaceRoot, filePath);

  const callPatterns = [
    /\b(?:api|apiRef\.current|axios)\s*\.\s*(?:get|post|put|patch|delete|request)\s*(?:<[^>]+>)?\s*\(\s*`([^`]+)`/gs,
    /\b(?:api|apiRef\.current|axios)\s*\.\s*(?:get|post|put|patch|delete|request)\s*(?:<[^>]+>)?\s*\(\s*'([^']+)'/gs,
    /\b(?:api|apiRef\.current|axios)\s*\.\s*(?:get|post|put|patch|delete|request)\s*(?:<[^>]+>)?\s*\(\s*"([^"]+)"/gs,
    /\bfetch\s*\(\s*`([^`]+)`/gs,
    /\bfetch\s*\(\s*'([^']+)'/gs,
    /\bfetch\s*\(\s*"([^"]+)"/gs,
    /\bbuildInternalApiUrl\s*\(\s*`([^`]+)`/gs,
    /\bbuildInternalApiUrl\s*\(\s*'([^']+)'/gs,
    /\bbuildInternalApiUrl\s*\(\s*"([^"]+)"/gs,
  ];

  for (const pattern of callPatterns) {
    for (const match of content.matchAll(pattern)) {
      const normalized = normalizePath(match[1]);
      if (!normalized) continue;

      findings.push({
        file: relPath,
        raw: match[1],
        normalized,
      });
    }
  }

  // Include endpoint constants in network files (e.g., API_ENDPOINTS maps).
  for (const match of content.matchAll(/:\s*['"](\/[A-Za-z0-9._:/?&=${}-]+)['"]/g)) {
    findings.push({
      file: relPath,
      raw: match[1],
      normalized: match[1],
    });
  }

  return findings;
}

function uniqueFindings(findings) {
  const seen = new Set();
  const output = [];

  for (const finding of findings) {
    const key = `${finding.file}|${finding.normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(finding);
  }

  return output;
}

function usageForRoute(route, endpointFindings) {
  const matches = endpointFindings.filter((entry) => {
    const endpoint = stripV1Prefix(entry.normalized);
    return (
      endpoint === route ||
      endpoint.startsWith(`${route}/`) ||
      endpoint.startsWith(`${route}?`)
    );
  });

  return uniqueFindings(matches);
}

function buildMarkdown({
  generatedAt,
  scannedRoots,
  routes,
  used,
  unused,
  usageMap,
}) {
  const lines = [];

  lines.push('# Frontend Route Usage Audit');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  for (const root of scannedRoots) {
    lines.push(`- \`${root}\``);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total mounted backend routes: ${routes.length}`);
  lines.push(`- Routes with frontend API references: ${used.length}`);
  lines.push(`- Routes with no frontend API reference (candidates): ${unused.length}`);
  lines.push('');
  lines.push('## Candidate Routes (No Frontend API Reference)');
  lines.push('');
  if (unused.length === 0) {
    lines.push('- None');
  } else {
    for (const route of unused) {
      lines.push(`- \`${route}\``);
    }
  }
  lines.push('');
  lines.push('## Routes With Frontend References (Evidence)');
  lines.push('');

  for (const route of used) {
    lines.push(`### \`${route}\``);
    const examples = usageMap.get(route).slice(0, 5);
    for (const example of examples) {
      lines.push(`- \`${example.file}\` -> \`${example.normalized}\``);
    }
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- This audit matches string-based endpoint usage in frontend network-call files.');
  lines.push('- Keep externally consumed routes (integrations, bots, admin scripts) even if not used by current frontends.');
  lines.push('- Re-run this script before deleting any route to avoid regressions.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const write = process.argv.includes('--write');

  if (!fs.existsSync(backendRouteFile)) {
    console.error(`Missing backend route file: ${backendRouteFile}`);
    process.exit(1);
  }

  const routes = readBackendRoutes(backendRouteFile);
  const existingRoots = frontendRoots.filter((dir) => fs.existsSync(dir));
  const missingRoots = frontendRoots.filter((dir) => !fs.existsSync(dir));

  if (existingRoots.length === 0) {
    console.error('No frontend roots found for audit.');
    process.exit(1);
  }

  const files = existingRoots.flatMap((root) => walk(root, []));
  const endpointFindings = files.flatMap((file) => extractEndpointsFromFile(file));

  const usageMap = new Map();
  for (const route of routes) {
    usageMap.set(route, usageForRoute(route, endpointFindings));
  }

  const used = routes.filter((route) => usageMap.get(route).length > 0);
  const unused = routes.filter((route) => usageMap.get(route).length === 0);

  const generatedAt = new Date().toISOString();

  const markdown = buildMarkdown({
    generatedAt,
    scannedRoots: existingRoots,
    routes,
    used,
    unused,
    usageMap,
  });

  if (write) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, markdown);
    console.log(`Wrote audit report: ${path.relative(repoRoot, outputFile)}`);
  } else {
    console.log(markdown);
  }

  if (missingRoots.length > 0) {
    console.log('');
    console.log('Skipped missing roots:');
    for (const root of missingRoots) {
      console.log(`- ${root}`);
    }
  }
}

main();
