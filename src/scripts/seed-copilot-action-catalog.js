#!/usr/bin/env node

const { postgresPool, closePool } = require('../config/postgres');

const ACTIONS = [
  ['create_user', 'user', true, 'deactivate_user', false, false, 0],
  ['update_user', 'user', false, null, false, false, 0],
  ['deactivate_user', 'user', true, 'reactivate_user', true, true, 0],
  ['reactivate_user', 'user', true, 'deactivate_user', false, true, 0],
  ['delete_user', 'user', false, null, true, true, 0],
  ['reset_password', 'user', false, null, false, true, 0],
  ['verify_account', 'user', false, null, false, true, 0],
  ['create_role', 'role', true, 'delete_role', false, true, 0],
  ['delete_role', 'role', false, null, true, true, 0],
  ['assign_role', 'user_role', true, 'unassign_role', false, true, 0],
  ['unassign_role', 'user_role', true, 'assign_role', false, true, 0],
  [
    'grant_permission',
    'role_permission',
    true,
    'revoke_permission',
    false,
    true,
    0,
  ],
  [
    'revoke_permission',
    'role_permission',
    true,
    'grant_permission',
    false,
    true,
    0,
  ],
  ['create_project', 'project', true, 'archive_project', false, true, 0],
  ['archive_project', 'project', true, 'restore_project', false, true, 0],
  ['restore_project', 'project', true, 'archive_project', false, true, 0],
  ['create_payment', 'payment', false, null, false, true, 0],
  ['process_payment', 'payment', false, null, false, true, 0],
  ['complete_payment', 'payment', false, null, false, true, 0],
  ['cancel_payment', 'payment', false, null, false, true, 0],
  ['refund_payment', 'payment', false, null, false, true, 0],
  ['create_node', 'node', true, 'delete_node', false, true, 0],
  ['delete_node', 'node', false, null, true, true, 0],
  ['restore_node', 'node', true, 'delete_node', false, true, 0],
  ['move_node', 'node', false, null, false, true, 0],
  [
    'assign_user_to_node',
    'node_user',
    true,
    'unassign_user_from_node',
    false,
    true,
    0,
  ],
  [
    'unassign_user_from_node',
    'node_user',
    true,
    'assign_user_to_node',
    false,
    true,
    0,
  ],
  ['submit_data', 'submission', true, 'withdraw_submission', false, false, 300],
  [
    'withdraw_submission',
    'submission',
    true,
    'reopen_submission',
    false,
    true,
    0,
  ],
  ['approve_submission', 'submission', true, 'revoke_approval', false, true, 0],
  ['revoke_approval', 'submission', true, 'approve_submission', false, true, 0],
  [
    'reject_submission',
    'submission',
    true,
    'reopen_submission',
    false,
    true,
    0,
  ],
  [
    'reopen_submission',
    'submission',
    true,
    'reject_submission',
    false,
    true,
    0,
  ],
  ['delete_submission', 'submission', false, null, true, true, 0],
  ['create_task', 'task', true, 'cancel_task', false, false, 0],
  ['complete_task', 'task', true, 'reopen_task', false, false, 0],
  ['reopen_task', 'task', true, 'complete_task', false, false, 0],
  ['cancel_task', 'task', true, 'reopen_task', false, false, 0],
];

const seed = async () => {
  await Promise.all(
    ACTIONS.map((action) =>
      postgresPool.query(
        `INSERT INTO copilot.action_catalog (
        action_type,
        entity_type,
        can_reverse,
        reverse_action_type,
        is_destructive,
        requires_approval,
        preempt_window_sec,
        default_payload_schema,
        metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,'{}'::jsonb)
      ON CONFLICT (action_type) DO UPDATE SET
        entity_type = EXCLUDED.entity_type,
        can_reverse = EXCLUDED.can_reverse,
        reverse_action_type = EXCLUDED.reverse_action_type,
        is_destructive = EXCLUDED.is_destructive,
        requires_approval = EXCLUDED.requires_approval,
        preempt_window_sec = EXCLUDED.preempt_window_sec,
        updated_at = NOW()`,
        action
      )
    )
  );

  const result = await postgresPool.query(
    'SELECT COUNT(*)::int AS total FROM copilot.action_catalog'
  );
  // eslint-disable-next-line no-console
  console.log(
    `[seed-copilot-action-catalog] total actions: ${result.rows[0].total}`
  );
};

seed()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error('[seed-copilot-action-catalog] failed:', error.message);
    await closePool();
    process.exit(1);
  });
