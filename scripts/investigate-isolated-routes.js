#!/usr/bin/env node

/**
 * Investigate routes that are not referenced by frontend apps.
 *
 * Inputs:
 * - docs/route-frontend-usage-audit.txt (candidate route list)
 *
 * Outputs:
 * - docs/isolated-route-investigation.txt
 *
 * Usage:
 *   node scripts/investigate-isolated-routes.js
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');

const frontendAuditFile = path.join(repoRoot, 'docs/route-frontend-usage-audit.txt');
const backendRouteFile = path.join(repoRoot, 'src/routes/v1/index.js');
const outputFile = path.join(repoRoot, 'docs/isolated-route-investigation.txt');

const scanTargets = [
  path.join(repoRoot, 'src'),
  path.join(repoRoot, 'public'),
  path.join(repoRoot, 'scripts'),
  path.join(workspaceRoot, 'sabyAgentic/app'),
  path.join(workspaceRoot, 'waiting-list-app/src'),
  path.join(workspaceRoot, 'deploy'),
  path.join(workspaceRoot, 'nginx'),
  path.join(workspaceRoot, 'nginx.production.conf'),
  path.join(workspaceRoot, 'docker-compose.production.yml'),
  path.join(workspaceRoot, 'docker-compose.unified.yml'),
  path.join(workspaceRoot, 'docker-compose.staging.yml'),
  path.join(workspaceRoot, 'docker-compose.local.yml'),
];

const sourceExt = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.yml',
  '.yaml',
  '.json',
  '.sh',
  '.conf',
  '.txt',
  '.md',
  '.ini',
  '.sql',
]);

const legacyAliasCandidates = new Set(['/captures', '/departments', '/submitData']);
const externalClasses = new Set(['external-client', 'external-app']);
const integrationClasses = new Set(['internal-integration', 'infra-runtime']);

function readFrontendCandidates(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);

  const candidates = [];
  let inSection = false;

  for (const line of lines) {
    if (line.trim() === '## Candidate Routes (No Frontend API Reference)') {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (!inSection) continue;

    const match = line.match(/^- `([^`]+)`$/);
    if (match) candidates.push(match[1]);
  }

  return candidates;
}

function readMountedRoutes(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const sanitized = noBlock.replace(/^\s*\/\/.*$/gm, '');

  const mounted = [];

  for (const match of sanitized.matchAll(/path:\s*'([^']+)'/g)) {
    if (!mounted.includes(match[1])) mounted.push(match[1]);
  }
  for (const match of sanitized.matchAll(/router\.use\('([^']+)'/g)) {
    if (!mounted.includes(match[1])) mounted.push(match[1]);
  }

  return mounted.sort((a, b) => a.localeCompare(b));
}

function walk(targetPath, files = []) {
  if (!fs.existsSync(targetPath)) return files;

  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    files.push(targetPath);
    return files;
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.next' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'coverage' ||
        entry.name === 'venv' ||
        entry.name === '.venv' ||
        entry.name === '__pycache__'
      ) {
        continue;
      }
      walk(fullPath, files);
      continue;
    }

    const ext = path.extname(entry.name);
    if (sourceExt.has(ext) || entry.name.startsWith('Dockerfile') || entry.name.startsWith('.env')) {
      files.push(fullPath);
    }
  }

  return files;
}

function classifyFile(filePath) {
  const rel = path.relative(workspaceRoot, filePath);

  if (rel.startsWith('sabyAgentic/app/clients/')) return 'external-client';
  if (rel.startsWith('waiting-list-app/src/')) return 'external-app';
  if (rel.startsWith('sabyBackend/src/ingestion/')) return 'internal-integration';
  if (rel.startsWith('sabyBackend/public/telegram-webapp/')) return 'internal-integration';
  if (
    rel.startsWith('deploy/') ||
    rel.startsWith('nginx/') ||
    rel.includes('docker-compose') ||
    rel.endsWith('nginx.production.conf')
  ) {
    return 'infra-runtime';
  }
  if (rel.startsWith('sabyBackend/src/routes/v1/index.js')) return 'mount-definition';
  if (rel.startsWith('sabyBackend/src/routes/v1/')) return 'backend-route-module';
  if (rel.startsWith('sabyBackend/src/')) return 'backend-source';
  if (rel.startsWith('sabyBackend/scripts/')) return 'backend-script';
  return 'other';
}

function stripV1Prefix(endpoint) {
  if (endpoint.startsWith('/v1/')) return endpoint.slice(3);
  return endpoint;
}

function normalizeEndpoint(raw) {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  // Template literal prefixes like `${backendUrl}/v1/waitlist`
  value = value.replace(/^\$\{[^}]+\}/g, '');
  value = value.replace(/^https?:\/\/[^/]+/i, '');

  const firstSlash = value.indexOf('/');
  if (firstSlash === -1) return null;

  value = value.slice(firstSlash);
  if (value.startsWith('/api/v1/')) {
    value = value.replace(/^\/api\/v1\//, '/v1/');
  }

  if (/\.(json|png|jpg|jpeg|svg|webp|gif|css|js|html|ico)(\?|$)/i.test(value)) {
    return null;
  }

  return value;
}

function endpointMatchesRoute(endpoint, route) {
  const normalized = stripV1Prefix(endpoint);
  return (
    normalized === route ||
    normalized.startsWith(`${route}/`) ||
    normalized.startsWith(`${route}?`)
  );
}

function collectRouteEvidence(routes, files) {
  const routeEvidence = new Map(routes.map((route) => [route, []]));

  for (const filePath of files) {
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const rel = path.relative(workspaceRoot, filePath);
    const fileClass = classifyFile(filePath);
    const lines = content.split(/\r?\n/);
    const fileHasNetworkContext =
      fileClass === 'mount-definition' ||
      fileClass === 'backend-route-module' ||
      /fetch\s*\(|axios|_request\s*\(|proxy_pass|location\s+\/|baseURL|API_BASE|backendUrl|SUBMISSION_API_|TELEGRAM_WEBHOOK_URL|curl\s+/i.test(
        content
      );

    if (!fileHasNetworkContext) continue;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.includes('/')) continue;

      const stringLiterals = [...line.matchAll(/['"`]([^'"`]+)['"`]/g)];
      if (stringLiterals.length === 0) continue;

      for (const match of stringLiterals) {
        const endpoint = normalizeEndpoint(match[1]);
        if (!endpoint) continue;

        for (const route of routes) {
          if (!endpointMatchesRoute(endpoint, route)) continue;

          routeEvidence.get(route).push({
            file: rel,
            line: index + 1,
            endpoint,
            class: fileClass,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  for (const route of routes) {
    const evidence = routeEvidence.get(route);
    const deduped = [];
    const seen = new Set();

    for (const item of evidence) {
      const key = `${item.file}|${item.endpoint}|${item.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    routeEvidence.set(route, deduped);
  }

  return routeEvidence;
}

function inferRouteDisposition(route, evidence) {
  const classes = new Set(evidence.map((item) => item.class));

  if ([...classes].some((value) => externalClasses.has(value))) {
    return 'KEEP (external consumer detected)';
  }
  if ([...classes].some((value) => integrationClasses.has(value))) {
    return 'KEEP (internal integration/runtime dependency)';
  }
  if (legacyAliasCandidates.has(route)) {
    return 'LEGACY ALIAS (deprecate with migration window)';
  }

  const meaningful = evidence.filter(
    (item) =>
      item.class !== 'mount-definition' &&
      item.class !== 'backend-route-module'
  );

  if (meaningful.length > 0) {
    return 'BACKEND-ONLY (confirm module owner before removal)';
  }

  return 'NO CONSUMER EVIDENCE (candidate for removal)';
}

function collectExternalClientMissingMounts(mountedRoutes) {
  const backendClientFile = path.join(
    workspaceRoot,
    'sabyAgentic/app/clients/backend_api_client.py'
  );
  if (!fs.existsSync(backendClientFile)) return [];

  const source = fs.readFileSync(backendClientFile, 'utf8');
  const endpointStrings = [
    ...source.matchAll(/['"](\/[A-Za-z0-9_./?{}=-]+)['"]/g),
  ].map((match) => match[1]);

  const uniqueEndpoints = [...new Set(endpointStrings)];
  const topRoutes = new Map();

  for (const endpoint of uniqueEndpoints) {
    const normalized = stripV1Prefix(endpoint);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let topRoute = `/${parts[0]}`;
    if (parts[0] === 'perm' && parts[1] === 'submissions') {
      topRoute = '/perm/submissions';
    }

    if (!topRoutes.has(topRoute)) topRoutes.set(topRoute, []);
    topRoutes.get(topRoute).push(endpoint);
  }

  const missing = [];
  for (const [topRoute, endpoints] of [...topRoutes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (mountedRoutes.includes(topRoute)) continue;
    missing.push({
      route: topRoute,
      count: endpoints.length,
      examples: endpoints.slice(0, 5),
    });
  }

  return missing;
}

function buildReport({
  generatedAt,
  candidates,
  routeEvidence,
  missingMounts,
}) {
  const lines = [];
  lines.push('# Isolated Route Investigation');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Candidate routes investigated: ${candidates.length}`);
  lines.push(
    `- Routes with external/internal evidence: ${
      candidates.filter((route) => routeEvidence.get(route).length > 0).length
    }`
  );
  lines.push(
    `- External-client route groups not currently mounted: ${missingMounts.length}`
  );
  lines.push('');
  lines.push('## Route Classification');
  lines.push('');

  for (const route of candidates) {
    const evidence = routeEvidence.get(route);
    const disposition = inferRouteDisposition(route, evidence);

    lines.push(`### \`${route}\``);
    lines.push(`- Disposition: ${disposition}`);
    lines.push(`- Evidence count: ${evidence.length}`);

    const classCounts = {};
    for (const item of evidence) {
      classCounts[item.class] = (classCounts[item.class] || 0) + 1;
    }
    const classSummary = Object.entries(classCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}:${count}`)
      .join(', ');
    lines.push(`- Evidence classes: ${classSummary || 'none'}`);

    for (const item of evidence.slice(0, 5)) {
      lines.push(`- \`${item.file}:${item.line}\` -> \`${item.endpoint}\``);
    }
    lines.push('');
  }

  lines.push('## External Client Routes Not Mounted');
  lines.push('');
  if (missingMounts.length === 0) {
    lines.push('- None');
  } else {
    for (const item of missingMounts) {
      lines.push(`- \`${item.route}\` (${item.count} endpoint references)`);
      for (const example of item.examples) {
        lines.push(`  - \`${example}\``);
      }
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Frontend-no-reference does not mean safe-to-delete.');
  lines.push('- External clients and internal ingestion/webhook integrations are separate consumers.');
  lines.push('- Validate live traffic before removal (server access logs + API metrics).');
  lines.push('');

  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(frontendAuditFile)) {
    console.error(`Missing audit file: ${frontendAuditFile}`);
    process.exit(1);
  }

  const candidates = readFrontendCandidates(frontendAuditFile);
  const mountedRoutes = readMountedRoutes(backendRouteFile);
  const files = [...new Set(scanTargets.flatMap((target) => walk(target, [])))]
    .filter((filePath) => filePath !== __filename)
    .filter((filePath) => !filePath.endsWith('/scripts/audit-frontend-route-usage.js'))
    .filter((filePath) => !filePath.endsWith('/docs/route-frontend-usage-audit.txt'))
    .filter((filePath) => !filePath.endsWith('/docs/isolated-route-investigation.txt'));
  const routeEvidence = collectRouteEvidence(candidates, files);
  const missingMounts = collectExternalClientMissingMounts(mountedRoutes);

  const report = buildReport({
    generatedAt: new Date().toISOString(),
    candidates,
    routeEvidence,
    missingMounts,
  });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, report);
  console.log(`Wrote investigation report: ${path.relative(repoRoot, outputFile)}`);
}

main();
