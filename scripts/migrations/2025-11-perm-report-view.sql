-- ------------------------------------------------------------
-- PERM Submission Report View
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW perm_submission_report_view AS
SELECT
  fsev.submission_id,
  fsev.tenant_id,
  fsev.project_id,
  fsev.form_id,
  fsev.node_id,
  fsev.user_id,
  fsev.source,
  fsev.status,
  fsev.perm_enabled,
  fsev.event_compliance_percentage,
  fsev.numeric_total,
  fsev.numeric_average,
  fsev.boolean_true_count,
  fsev.boolean_false_count,
  fsev.fields_count,
  fsev.created_at,
  fsev.updated_at,
  fsev.month,
  fsev.year,
  nd.node_code,
  nd.node_name,
  nd.node_reference,
  nd.structure_name,
  nd.level_name,
  nd.parent_node_id,
  nd.lineage_ids,
  nd.lineage_codes,
  nd.lineage_names,
  nd.lineage_refs,
  nd.depth,
  nd.is_active,
  nd.is_main,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', f.field_key,
        'label', f.field_label,
        'type', f.field_type,
        'value_text', f.value_text,
        'value_numeric', f.value_numeric,
        'value_boolean', f.value_boolean,
        'value_date', f.value_date,
        'value_json', f.value_json
      )
      ORDER BY f.field_key
    ) FILTER (WHERE f.field_key IS NOT NULL),
    '[]'::jsonb
  ) AS structured_fields,
  COALESCE(
    jsonb_object_agg(
      f.field_key,
      jsonb_build_object(
        'label', f.field_label,
        'type', f.field_type,
        'value_text', f.value_text,
        'value_numeric', f.value_numeric,
        'value_boolean', f.value_boolean,
        'value_date', f.value_date,
        'value_json', f.value_json
      )
    ) FILTER (WHERE f.field_key IS NOT NULL),
    '{}'::jsonb
  ) AS structured_map
FROM form_submission_enriched_view fsev
LEFT JOIN form_submission_facts f ON f.submission_id = fsev.submission_id
LEFT JOIN node_dimension nd ON nd.node_id = fsev.node_id
WHERE fsev.perm_enabled = TRUE
GROUP BY
  fsev.submission_id,
  fsev.tenant_id,
  fsev.project_id,
  fsev.form_id,
  fsev.node_id,
  fsev.user_id,
  fsev.source,
  fsev.status,
  fsev.perm_enabled,
  fsev.event_compliance_percentage,
  fsev.numeric_total,
  fsev.numeric_average,
  fsev.boolean_true_count,
  fsev.boolean_false_count,
  fsev.fields_count,
  fsev.created_at,
  fsev.updated_at,
  fsev.month,
  fsev.year,
  nd.node_code,
  nd.node_name,
  nd.node_reference,
  nd.structure_name,
  nd.level_name,
  nd.parent_node_id,
  nd.lineage_ids,
  nd.lineage_codes,
  nd.lineage_names,
  nd.lineage_refs,
  nd.depth,
  nd.is_active,
  nd.is_main;




