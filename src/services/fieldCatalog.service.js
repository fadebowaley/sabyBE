const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');
const SubmissionCatalogService = require('./submissionCatalog.service');
const {
  getFinancialCatalogDefinitionsForForm,
} = require('./submissionFinancialFields.service');

const BLOCK_TYPES = new Set([
  'header',
  'paragraph',
  'description',
  'spacer',
  'divider',
]);
const NUMBER_TYPES = new Set(['number', 'currency', 'rating', 'slider']);
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url']);
const DATE_TYPES = new Set(['date', 'datetime', 'time']);
const OPTION_TYPES = new Set([
  'select',
  'radio',
  'checkbox',
  'multiselect',
  'tags',
]);

const DEFAULT_TRANSFORMATIONS = {
  number: ['raw', 'sum', 'avg', 'min', 'max', 'numeric_bucket'],
  currency: ['raw', 'sum', 'avg', 'min', 'max', 'numeric_bucket'],
  rating: ['raw', 'avg', 'min', 'max'],
  slider: ['raw', 'avg', 'min', 'max'],
  text: ['raw'],
  textarea: ['raw'],
  email: ['raw'],
  phone: ['raw'],
  url: ['raw'],
  date: ['raw'],
  datetime: ['raw'],
  time: ['raw'],
  select: ['raw', 'categorical'],
  radio: ['raw', 'categorical'],
  checkbox: ['raw', 'categorical'],
  multiselect: ['raw', 'categorical'],
  tags: ['raw', 'categorical'],
  file: ['raw'],
  image: ['raw'],
};

const buildAliases = (element, label) => {
  const aliases = new Set();
  const props = element?.properties || {};

  [
    element?.id,
    element?.name,
    props?.name,
    props?.key,
    props?.identifier,
    label,
    (label || '').replace(/\s+/g, '_'),
  ]
    .filter(Boolean)
    .forEach((value) => aliases.add(String(value).toLowerCase()));

  if (Array.isArray(props?.aliases)) {
    props.aliases
      .filter(Boolean)
      .map((alias) => alias.toLowerCase())
      .forEach((alias) => aliases.add(alias));
  }

  return Array.from(aliases);
};

const inferTransformations = (type) => {
  if (!type) return ['raw'];
  if (NUMBER_TYPES.has(type)) return DEFAULT_TRANSFORMATIONS.number;
  if (TEXT_TYPES.has(type)) return DEFAULT_TRANSFORMATIONS.text;
  if (DATE_TYPES.has(type)) return DEFAULT_TRANSFORMATIONS.date;
  if (OPTION_TYPES.has(type)) return DEFAULT_TRANSFORMATIONS.select;
  return DEFAULT_TRANSFORMATIONS[type] || ['raw'];
};

const isCatalogCandidate = (element) => {
  if (!element || !element.id) return false;
  if (!element.properties || !element.properties.label) return false;
  if (BLOCK_TYPES.has(element.type)) return false;
  return true;
};

const normaliseOptions = (element) => {
  const options = element?.properties?.options;
  if (!Array.isArray(options)) {
    return [];
  }

  return options.map((option) => {
    if (typeof option === 'string') {
      return { label: option, value: option };
    }
    if (option && typeof option === 'object') {
      return {
        label: option.label ?? option.value ?? '',
        value: option.value ?? option.label ?? '',
      };
    }
    return { label: String(option ?? ''), value: String(option ?? '') };
  });
};

const mapElementToRecord = (formDoc, element) => {
  const label = element?.properties?.label?.trim?.() || element?.id;
  const rawType = String(element?.type || 'text').trim().toLowerCase();
  const specialFieldType = String(element?.properties?.fieldType || '')
    .trim()
    .toLowerCase();
  const type =
    specialFieldType === 'profile_image_upload'
      ? 'image'
      : rawType === 'fileupload' || rawType === 'file'
        ? 'file'
        : element?.type || 'text';
  const elementOrder = Array.isArray(formDoc?.elements)
    ? formDoc.elements.findIndex((entry) => entry?.id === element?.id)
    : -1;

  return {
    project_id: formDoc.projectId,
    tenant_id: formDoc.tenantId,
    form_id: formDoc.formId || formDoc.projectId,
    field_id: element.id,
    field_key: element.id,
    field_label: label,
    field_type: type,
    is_required: Boolean(
      element?.properties?.validation && element.properties.validation.required
    ),
    options: normaliseOptions(element),
    aliases: buildAliases(element, label),
    transformations: inferTransformations(type),
    metadata: {
      placeholder: element?.properties?.placeholder || null,
      description: element?.properties?.description || null,
      section: element?.section || null,
      order: elementOrder >= 0 ? elementOrder : null,
      elementId: element?.id || null,
    },
  };
};

const syncCatalogFromForm = async (formDoc) => {
  if (!formDoc) {
    return;
  }

  const plainForm = formDoc.toObject ? formDoc.toObject() : formDoc;
  const { projectId, tenantId, elements } = plainForm;

  if (!projectId || !tenantId || !Array.isArray(elements)) {
    return;
  }

  const elementRecords = elements.filter(isCatalogCandidate).map((element) => ({
    ...mapElementToRecord(plainForm, element),
  }));
  const records = [
    ...elementRecords,
    ...getFinancialCatalogDefinitionsForForm(
      plainForm,
      elementRecords.length + 1000
    ),
  ];

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM form_field_catalog WHERE project_id = $1', [
      projectId,
    ]);

    for (const record of records) {
      await client.query(
        `
          INSERT INTO form_field_catalog (
            catalog_id,
            project_id,
            tenant_id,
            form_id,
            field_id,
            field_key,
            field_label,
            field_type,
            is_required,
            options,
            aliases,
            transformations,
            metadata,
            catalog_version,
            created_at,
            updated_at
          ) VALUES (
            uuid_generate_v4(),
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
            1, NOW(), NOW()
          )
          ON CONFLICT (project_id, field_key)
          DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            form_id = EXCLUDED.form_id,
            field_id = EXCLUDED.field_id,
            field_label = EXCLUDED.field_label,
            field_type = EXCLUDED.field_type,
            is_required = EXCLUDED.is_required,
            options = EXCLUDED.options,
            aliases = EXCLUDED.aliases,
            transformations = EXCLUDED.transformations,
            metadata = EXCLUDED.metadata,
            updated_at = NOW();
        `,
        [
          record.project_id,
          record.tenant_id,
          record.form_id,
          record.field_id,
          record.field_key,
          record.field_label,
          record.field_type,
          record.is_required,
          JSON.stringify(record.options),
          JSON.stringify(record.aliases),
          JSON.stringify(record.transformations),
          JSON.stringify(record.metadata),
        ]
      );
    }

    await client.query('COMMIT');
    SubmissionCatalogService.invalidate(projectId);
    logger.info(
      `[FieldCatalog] Synced ${records.length} fields for project ${projectId}`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(
      `[FieldCatalog] Failed to sync catalog for project ${plainForm.projectId}: ${error.message}`
    );
  } finally {
    client.release();
  }
};

const removeCatalogForProject = async (projectId) => {
  if (!projectId) return;

  try {
    await postgresPool.query(
      'DELETE FROM form_field_catalog WHERE project_id = $1',
      [projectId]
    );
    SubmissionCatalogService.invalidate(projectId);
    logger.info(
      `[FieldCatalog] Removed catalog entries for project ${projectId}`
    );
  } catch (error) {
    logger.error(
      `[FieldCatalog] Failed to remove catalog for project ${projectId}: ${error.message}`
    );
  }
};

module.exports = {
  syncCatalogFromForm,
  removeCatalogForProject,
};
