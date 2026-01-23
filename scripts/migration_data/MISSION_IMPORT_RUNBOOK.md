# Mission Data Import Runbook

This guide explains how to transform the "Mission_ Data.xlsx - Sheet1.csv" file into tenant-scoped CSVs and migrate them into Halo.

## 1. Convert Excel CSV -> Mission CSVs

```bash
cd sabyBackend
node scripts/migration_data/convert_mission_data.js \
  --tenantEmail saby@saby.ai \
  --input "scripts/migration_data/Mission_ Data.xlsx - Sheet1.csv" \
  --outDir scripts/migration_data/mission_output
```

This produces:
- `mission_roles.csv`
- `mission_users.csv`
- `mission_nodes.csv`
- `mission_user_nodes.csv`

It auto-classifies hierarchy (Root → Division/Region/National Mission/International Region → Diocese → Zone → Parish), normalizes titles/roles, and generates tenant-safe emails with fallback password `H@lopa55word`.

## 2. Seed hierarchy metadata

Create level & structure CSVs if they do not exist:

`scripts/migration_data/mission_output/mission_levels.csv`
```
name,description,rank
Root,National root level,0
Division,Division or Region level,1
Diocese,Diocese level,2
Zone,Zone level,3
Parish,Parish level,4
```

`scripts/migration_data/mission_output/mission_structures.csv`
```
name,code,type,level,parent,description
Root Structure,,headquarters,Root,,Root structure for national HQ
Division Structure,,division,Division,Root Structure,Division/Region level structure
Diocese Structure,,region,Diocese,Division Structure,Diocese level structure
Zone Structure,,zone,Zone,Diocese Structure,Zone level structure
Parish Structure,,branch,Parish,Zone Structure,Parish level structure
```

## 3. Ensure dependencies

From `sabyBackend`, install required CLI dependencies once:
```
npm install csv-parser csv-writer
```

## 4. Run tenant-scoped migration

```bash
node scripts/comprehensive_data_migration.js \
  --tenantEmail saby@saby.ai \
  --csvDir scripts/migration_data/mission_output \
  --rolesFile mission_roles.csv \
  --usersFile mission_users.csv \
  --levelsFile mission_levels.csv \
  --structuresFile mission_structures.csv \
  --nodesFile mission_nodes.csv \
  --userNodesFile mission_user_nodes.csv
```

The script automatically:
1. Connects to Mongo using credentials in `env.local`.
2. Resolves tenant context by the provided email (must exist).
3. Creates roles → users → levels → structures → nodes → user-node links.

Sample output:
```
Parsed: 10 roles, 467 users, 525 nodes
...
TOTAL: 1479 created, 0 errors
User-Node Links: 467 attached, 0 errors
```

## 5. Verification Checklist

- Query `Role`, `User`, `Nodes` collections for the tenant:
  - `db.roles.find({ tenantId: "<tenantId>" }).count()`
  - `db.users.find({ tenantId: "<tenantId>", email: /mission/ })`
  - `db.nodes.find({ tenantId: "<tenantId>", name: /Division/ })`
- Confirm `Nodes.users` arrays contain the expected user `_id`s.
- Log in as the tenant to verify users appear under `/users/list` with correct roles.
- Inspect hierarchy UI (`/nodes`) to ensure root structure `National Headquarters` appears with nested Divisions/Regions/Dioceses/Zones/Parishes.

## 6. Rerun / Other Tenants

- Replace `--tenantEmail` to target a different tenant owner.
- Optionally pass `--rolesFile`, etc., if you produce alternate CSV variants per tenant.
- To dry-run only the conversion, skip the migration step.

## 7. Troubleshooting

- **Missing CSV file**: verify `--csvDir` and filenames.
- **Tenant not found**: create or identify an owner user for the tenant and rerun with that email.
- **Duplicate entities**: rerunning without cleaning will skip existing records (logged as warnings).
- **Node lookup failures**: ensure parent nodes exist and names match exactly (converter uses "Parent > Child" display names).

This workflow is tenant-based and repeatable; it allows ingesting subsets or entire mission data sets for any tenant with consistent hierarchy and user-node relationships.
