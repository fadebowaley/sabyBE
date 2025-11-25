#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const missionConfig = require('./missionHierarchy.config');

const DEFAULT_INPUT = path.resolve(
  __dirname,
  'Mission_ Data.xlsx - Sheet1.csv'
);
const OUTPUT_DIR = path.resolve(__dirname, 'mission_output');
const DEFAULT_EMAIL_DOMAIN = 'sotsm.org';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: DEFAULT_INPUT,
    tenantEmail: null,
    tenantSlug: 'tenant',
    outDir: OUTPUT_DIR,
    emailDomain: DEFAULT_EMAIL_DOMAIN,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--input' && args[i + 1]) {
      options.input = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (arg === '--tenantEmail' && args[i + 1]) {
      options.tenantEmail = args[i + 1];
      i += 1;
    } else if (arg === '--outDir' && args[i + 1]) {
      options.outDir = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (arg === '--emailDomain' && args[i + 1]) {
      options.emailDomain = args[i + 1].toLowerCase();
      i += 1;
    }
  }

  if (!options.tenantEmail) {
    console.error('❌  Missing required flag: --tenantEmail <email>');
    process.exit(1);
  }

  options.tenantSlug =
    options.tenantEmail.split('@')[1]?.split('.')[0]?.toLowerCase() || 'tenant';
  return options;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function cleanString(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizePhone(number) {
  if (!number) return null;
  const cleanedNumbers = number
    .split(/[,/]/)
    .map((part) =>
      part
        .replace(/[^0-9+]/g, '')
        .replace(/^00/, '+')
        .trim()
    )
    .filter(Boolean);

  if (!cleanedNumbers.length) return null;

  const format = (num) => {
    if (!num) return null;
    if (num.startsWith('+')) return num;
    if (num.startsWith('0')) return `+234${num.slice(1)}`;
    if (num.length >= 10 && !num.startsWith('+')) {
      return `+${num}`;
    }
    return num;
  };

  const formatted = cleanedNumbers.map(format).filter(Boolean);
  return formatted.length ? formatted[0] : null;
}

function detectNodeType(nodeName, hasUser) {
  if (!nodeName) return null;
  const upper = nodeName.toUpperCase();

  const divisionHit = missionConfig.divisionKeywords.some((keyword) =>
    upper.includes(keyword.trim().toUpperCase())
  );
  if (divisionHit) return 'division';

  const dioceseHit = missionConfig.dioceseKeywords.some((keyword) =>
    upper.includes(keyword.trim().toUpperCase())
  );
  if (dioceseHit) return 'diocese';

  const zoneHit = missionConfig.zoneKeywords.some((keyword) =>
    upper.includes(keyword.trim().toUpperCase())
  );
  if (zoneHit) return 'zone';

  return hasUser ? 'parish' : 'zone';
}

function parseName(rawName) {
  if (!rawName) {
    return {
      title: null,
      role: 'Pastor',
      firstname: 'Unknown',
      lastname: 'User',
    };
  }

  let working = rawName.trim();
  let detectedTitle = null;
  let canonicalRole = 'Pastor';

  for (const pattern of missionConfig.titleMappings) {
    if (pattern.match.test(working)) {
      detectedTitle = working.match(pattern.match)[0].trim();
      canonicalRole = pattern.canonical;
      working = working.replace(pattern.match, '').trim();
      break;
    }
  }

  if (!working) {
    working = canonicalRole;
  }

  const parts = working.split(/\s+/);
  const firstname = parts.shift() || canonicalRole;
  const lastname = parts.join(' ') || 'Member';

  return {
    title: detectedTitle,
    role: canonicalRole,
    firstname,
    lastname,
  };
}

function slugify(...parts) {
  const joined = parts
    .filter(Boolean)
    .join('.')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
  return joined || 'user';
}

function createEmail(baseSlug, domain, existing) {
  let candidate = `${baseSlug}@${domain}`;
  let counter = 1;
  while (existing.has(candidate)) {
    candidate = `${baseSlug}+${counter}@${domain}`;
    counter += 1;
  }
  return candidate;
}

function createCsvWriterInstance(outDir, fileName, header) {
  return createObjectCsvWriter({
    path: path.join(outDir, fileName),
    header,
  });
}

async function readCsvRows(inputPath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(inputPath)
      .pipe(
        csv({
          mapHeaders: ({ header, index }) => {
            if (!header || header.trim() === '') {
              return `__col${index}`;
            }
            return header.trim();
          },
          skipLines: 0,
          strict: false,
        })
      )
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function ensureNode(nodesMap, params) {
  const { name, parentNode = null, levelName, structureName } = params;
  const parentFullPath = parentNode?.fullPath || '';
  const parentDisplayName = parentNode?.displayName || '';
  const fullPath = parentFullPath ? `${parentFullPath} > ${name}` : name;
  const nodeKey = fullPath.toUpperCase();

  if (!nodesMap.has(nodeKey)) {
    nodesMap.set(nodeKey, {
      name,
      displayName: name,
      fullPath,
      parentDisplayName,
      parentFullPath,
      levelName,
      structureName,
      users: new Set(),
    });
  }

  return nodesMap.get(nodeKey);
}

function formatRoleName(baseRole) {
  if (!baseRole) return '';
  return baseRole.trim();
}

function addUser(usersMap, rolesMap, options) {
  const {
    firstname,
    lastname,
    role,
    title,
    phoneNumber,
    tenantDomain,
    emailSlug,
  } = options;

  const existingEmails = usersMap;
  const baseSlug = emailSlug || slugify(firstname, lastname, role);
  const email = createEmail(baseSlug, tenantDomain, existingEmails);

  const formattedRole = formatRoleName(role);
  const roleKey = formattedRole.toLowerCase();

  if (formattedRole && !rolesMap.has(roleKey)) {
    rolesMap.set(roleKey, {
      name: formattedRole,
      description: `${formattedRole} role`,
    });
  }

  const userRecord = {
    email,
    firstname,
    lastname,
    password: missionConfig.fallbackPassword,
    phoneNumber: phoneNumber || '',
    isEmailVerified: false,
    isPhoneVerified: Boolean(phoneNumber),
    status: true,
    roles: formattedRole,
    title: title || role,
  };

  usersMap.set(email, userRecord);

  return email;
}

function buildLevelRecords() {
  return missionConfig.levelOrder.map((levelName, index) => ({
    name: levelName,
    description: `${levelName} level`,
    rank: index,
  }));
}

function buildStructureRecords() {
  return missionConfig.levelOrder.map((levelName, index) => {
    const structureDef =
      missionConfig.structures[levelName] || {
        name: `${levelName} Structure`,
        type: 'administrative',
      };
    const parentLevel = index === 0 ? null : missionConfig.levelOrder[index - 1];
    const parentStructure = parentLevel
      ? missionConfig.structures[parentLevel]?.name ||
        `${parentLevel} Structure`
      : '';
    return {
      name: structureDef.name,
      code: '',
      type: structureDef.type || 'administrative',
      level: levelName,
      parent: parentStructure,
      description: `${levelName} level structure`,
    };
  });
}

function processRows(rows, tenantDomain) {
  const rolesMap = new Map();
  const usersMap = new Map();
  const nodesMap = new Map();
  const userNodeLinks = [];

  const hierarchyState = {
    division: null,
    diocese: null,
    zone: null,
  };

  const rootNode = ensureNode(nodesMap, {
    name: missionConfig.rootNodeName,
    parentNode: null,
    levelName: 'Root',
    structureName: missionConfig.structures.Root.name,
  });

  const getStructureName = (levelName) =>
    missionConfig.structures[levelName]?.name || `${levelName} Structure`;

  rows.forEach((rawRow) => {
    const nodeName = cleanString(rawRow.Node);
    const userName = cleanString(rawRow.user);
    const phone = cleanString(rawRow.PhoneNumber);

    if (!nodeName && !userName) {
      return;
    }

    const nodeType = detectNodeType(nodeName, Boolean(userName));

    if (!nodeType && !userName) {
      return;
    }

    if (nodeType === 'division') {
      const divisionNode = ensureNode(nodesMap, {
        name: nodeName,
        parentNode: rootNode,
        levelName: 'Division',
        structureName: getStructureName('Division'),
      });
      hierarchyState.division = divisionNode;
      hierarchyState.diocese = null;
      hierarchyState.zone = null;

      if (userName) {
        const nameParts = parseName(userName);
        const phoneNumber = normalizePhone(phone);
        const email = addUser(usersMap, rolesMap, {
          firstname: nameParts.firstname,
          lastname: nameParts.lastname,
          role: nameParts.role,
          title: nameParts.title,
          phoneNumber,
          tenantDomain,
          emailSlug: slugify(nameParts.firstname, nameParts.lastname, nodeName),
        });
        divisionNode.users.add(email);
        userNodeLinks.push({
          email,
          nodeName: divisionNode.displayName,
        });
      }

      return;
    }

    if (nodeType === 'diocese') {
      const parentNode = hierarchyState.division || rootNode;
      const dioceseNode = ensureNode(nodesMap, {
        name: nodeName,
        parentNode,
        levelName: 'Diocese',
        structureName: getStructureName('Diocese'),
      });
      hierarchyState.diocese = dioceseNode;
      hierarchyState.zone = null;

      if (userName) {
        const nameParts = parseName(userName);
        const phoneNumber = normalizePhone(phone);
        const email = addUser(usersMap, rolesMap, {
          firstname: nameParts.firstname,
          lastname: nameParts.lastname,
          role: nameParts.role,
          title: nameParts.title,
          phoneNumber,
          tenantDomain,
          emailSlug: slugify(nameParts.firstname, nameParts.lastname, nodeName),
        });
        dioceseNode.users.add(email);
        userNodeLinks.push({
          email,
          nodeName: dioceseNode.displayName,
        });
      }

      return;
    }

    if (nodeType === 'zone' && nodeName) {
      const parentNode =
        hierarchyState.diocese ||
        hierarchyState.division ||
        rootNode;
      const zoneNode = ensureNode(nodesMap, {
        name: nodeName,
        parentNode,
        levelName: 'Zone',
        structureName: getStructureName('Zone'),
      });
      hierarchyState.zone = zoneNode;

      if (userName) {
        const nameParts = parseName(userName);
        const phoneNumber = normalizePhone(phone);
        const email = addUser(usersMap, rolesMap, {
          firstname: nameParts.firstname,
          lastname: nameParts.lastname,
          role: nameParts.role,
          title: nameParts.title,
          phoneNumber,
          tenantDomain,
          emailSlug: slugify(nameParts.firstname, nameParts.lastname, nodeName),
        });
        zoneNode.users.add(email);
        userNodeLinks.push({
          email,
          nodeName: zoneNode.displayName,
        });
      }

      return;
    }

    if (nodeName) {
      const parentNode =
        hierarchyState.zone ||
        hierarchyState.diocese ||
        hierarchyState.division ||
        rootNode;

      const parishNode = ensureNode(nodesMap, {
        name: nodeName,
        parentNode,
        levelName: 'Parish',
        structureName: getStructureName('Parish'),
      });

      if (userName) {
        const nameParts = parseName(userName);
        const phoneNumber = normalizePhone(phone);
        const email = addUser(usersMap, rolesMap, {
          firstname: nameParts.firstname,
          lastname: nameParts.lastname,
          role: nameParts.role,
          title: nameParts.title,
          phoneNumber,
          tenantDomain,
          emailSlug: slugify(
            nameParts.firstname,
            nameParts.lastname,
            nodeName
          ),
        });
        parishNode.users.add(email);
        userNodeLinks.push({
          email,
          nodeName: parishNode.displayName,
        });
      }
    }
  });

  return {
    roles: Array.from(rolesMap.values()),
    users: Array.from(usersMap.values()),
    nodes: Array.from(nodesMap.values()),
    userNodeLinks,
    levels: buildLevelRecords(),
    structures: buildStructureRecords(),
  };
}

async function writeOutputs(outDir, dataset) {
  ensureDir(outDir);

  const levelsWriter = createCsvWriterInstance(outDir, 'mission_levels.csv', [
    { id: 'name', title: 'name' },
    { id: 'description', title: 'description' },
    { id: 'rank', title: 'rank' },
  ]);

  const structuresWriter = createCsvWriterInstance(
    outDir,
    'mission_structures.csv',
    [
      { id: 'name', title: 'name' },
      { id: 'code', title: 'code' },
      { id: 'type', title: 'type' },
      { id: 'level', title: 'level' },
      { id: 'parent', title: 'parent' },
      { id: 'description', title: 'description' },
    ]
  );

  const rolesWriter = createCsvWriterInstance(outDir, 'mission_roles.csv', [
    { id: 'name', title: 'name' },
    { id: 'description', title: 'description' },
  ]);

  const usersWriter = createCsvWriterInstance(outDir, 'mission_users.csv', [
    { id: 'email', title: 'email' },
    { id: 'firstname', title: 'firstname' },
    { id: 'lastname', title: 'lastname' },
    { id: 'password', title: 'password' },
    { id: 'phoneNumber', title: 'phoneNumber' },
    { id: 'isEmailVerified', title: 'isEmailVerified' },
    { id: 'isPhoneVerified', title: 'isPhoneVerified' },
    { id: 'status', title: 'status' },
    { id: 'roles', title: 'roles' },
  ]);

  const nodesWriter = createCsvWriterInstance(outDir, 'mission_nodes.csv', [
    { id: 'name', title: 'name' },
    { id: 'level', title: 'level' },
    { id: 'structure', title: 'structure' },
    { id: 'parent', title: 'parent' },
    { id: 'address', title: 'address' },
    { id: 'city', title: 'city' },
    { id: 'state', title: 'state' },
    { id: 'country', title: 'country' },
    { id: 'postalCode', title: 'postalCode' },
    { id: 'dateOfEstablishment', title: 'dateOfEstablishment' },
    { id: 'isMain', title: 'isMain' },
    { id: 'users', title: 'users' },
  ]);

  const userNodeWriter = createCsvWriterInstance(
    outDir,
    'mission_user_nodes.csv',
    [
      { id: 'email', title: 'email' },
      { id: 'nodeName', title: 'nodeName' },
    ]
  );

  await levelsWriter.writeRecords(dataset.levels);
  await structuresWriter.writeRecords(dataset.structures);
  await rolesWriter.writeRecords(dataset.roles);
  await usersWriter.writeRecords(
    dataset.users.map((user) => ({
      ...user,
      isEmailVerified: user.isEmailVerified ? 'true' : 'false',
      isPhoneVerified: user.isPhoneVerified ? 'true' : 'false',
      status: user.status ? 'true' : 'false',
    }))
  );
  await nodesWriter.writeRecords(
    dataset.nodes.map((node) => ({
      name: node.displayName,
      level: node.levelName,
      structure: node.structureName,
      parent: node.parentDisplayName,
      address: '',
      city: '',
      state: '',
      country: '',
      postalCode: '',
      dateOfEstablishment: '',
      isMain: node.levelName === 'Root' ? 'true' : 'false',
      users: Array.from(node.users).join(','),
    }))
  );
  await userNodeWriter.writeRecords(dataset.userNodeLinks);
}

async function main() {
  const options = parseArgs();
  ensureDir(options.outDir);

  console.log('📄  Reading mission CSV data...');
  console.log(`   Input: ${options.input}`);

  const rows = await readCsvRows(options.input);
  console.log(`   Rows detected: ${rows.length}`);

  const tenantDomain = options.emailDomain || DEFAULT_EMAIL_DOMAIN;
  const dataset = processRows(rows, tenantDomain);

  console.log(
    `   Parsed: ${dataset.roles.length} roles, ${dataset.users.length} users, ${dataset.nodes.length} nodes, ${dataset.levels.length} levels, ${dataset.structures.length} structures`
  );

  await writeOutputs(options.outDir, dataset);

  console.log('\n✅ Mission conversion files generated:');
  console.log(`   ${options.outDir}`);
}

main().catch((error) => {
  console.error('❌  Mission conversion failed:', error.message);
  process.exit(1);
});


