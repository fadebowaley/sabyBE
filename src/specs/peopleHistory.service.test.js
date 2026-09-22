const mockPostgresPool = { query: jest.fn() };
jest.mock('../config/postgres', () => ({ postgresPool: mockPostgresPool }));

const svc = require('../services/peopleHistory.service');

const TENANT = 'tenant-people-history';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('subjectOf', () => {
  test('maps user actions to USER subjects', () => {
    expect(svc.subjectOf('deactivate_user', { userId: 'u-1' })).toEqual({
      kind: 'USER',
      id: 'u-1',
    });
    expect(
      svc.subjectOf('assign_role', {
        userId: 'u-2',
        roleId: 'r-1',
      })
    ).toEqual({ kind: 'USER', id: 'u-2' });
    expect(
      svc.subjectOf('assign_user_to_node', {
        userBody: { userId: 'u-3' },
        nodeId: 'n-1',
      })
    ).toEqual({ kind: 'USER', id: 'u-3' });
  });

  test('does not guess a subject when the payload has no user id', () => {
    expect(svc.subjectOf('assign_role', {})).toBeNull();
  });

  test('maps role actions to ROLE subjects', () => {
    expect(
      svc.subjectOf('grant_permission', { roleId: 'r-1', permissionId: 'p-1' })
    ).toEqual({ kind: 'ROLE', id: 'r-1' });
    expect(
      svc.subjectOf('create_role', { roleBody: { name: 'Auditor' } })
    ).toEqual({
      kind: 'ROLE',
      id: 'Auditor',
    });
  });

  test('maps node actions to NODE subjects', () => {
    expect(
      svc.subjectOf('move_node', { nodeId: 'n-1', newParentId: 'n-2' })
    ).toEqual({ kind: 'NODE', id: 'n-1' });
  });

  test('returns null for non-people actions', () => {
    expect(svc.subjectOf('submit_data', {})).toBeNull();
  });
});

describe('recordPeopleMutation', () => {
  test('inserts a tenant-scoped row and returns the created record', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'h-1', action_type: 'deactivate_user', subject_kind: 'USER' },
      ],
    });

    const result = await svc.recordPeopleMutation({
      tenantId: TENANT,
      actionEventId: 'event-1',
      actionType: 'deactivate_user',
      payload: { userId: 'u-1', reason: 'offboarding' },
      actorUserId: 'actor-1',
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (action_event_id) DO NOTHING'),
      expect.arrayContaining([
        TENANT,
        'event-1',
        'deactivate_user',
        'USER',
        'u-1',
      ])
    );
    expect(result.id).toBe('h-1');
  });

  test('returns null and does not insert for non-people actions', async () => {
    const result = await svc.recordPeopleMutation({
      tenantId: TENANT,
      actionEventId: 'event-1',
      actionType: 'submit_data',
      payload: {},
    });

    expect(result).toBeNull();
    expect(mockPostgresPool.query).not.toHaveBeenCalled();
  });

  test('returns null when the subject cannot be resolved', async () => {
    const result = await svc.recordPeopleMutation({
      tenantId: TENANT,
      actionEventId: 'event-1',
      actionType: 'assign_role',
      payload: {},
    });

    expect(result).toBeNull();
    expect(mockPostgresPool.query).not.toHaveBeenCalled();
  });

  test('returns null on a duplicate action event (idempotency)', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.recordPeopleMutation({
      tenantId: TENANT,
      actionEventId: 'event-1',
      actionType: 'assign_role',
      payload: { userId: 'u-9', roleId: 'r-9' },
    });
    expect(result).toBeNull();
  });
});

describe('listPeopleHistory', () => {
  test('returns rows newest first scoped to tenant and optional filters', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [{ id: 'h-1', subject_kind: 'USER', subject_id: 'u-1' }],
    });

    const rows = await svc.listPeopleHistory({
      tenantId: TENANT,
      subjectKind: 'USER',
      subjectId: 'u-1',
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at DESC'),
      [TENANT, 'USER', 'u-1', 50]
    );
    expect(rows).toHaveLength(1);
  });
});

describe('detectFlux', () => {
  test('returns access_flux observations for subjects with heavy churn', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          subject_kind: 'USER',
          subject_id: 'u-1',
          changes: 4,
          role_changes: 3,
          last_changed_at: new Date(Date.now() - 3600_000),
        },
      ],
    });

    const observations = await svc.detectFlux({ tenantId: TENANT });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY subject_kind, subject_id'),
      [TENANT, 168, 10]
    );
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      ruleId: 'access_flux',
      severity: 'warning',
      subject: { kind: 'USER', id: 'u-1' },
    });
    expect(observations[0].evidence[0]).toMatchObject({
      source: 'history:USER:u-1',
    });
  });

  test('returns an empty list when there is no churn', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });
    const observations = await svc.detectFlux({ tenantId: TENANT });
    expect(observations).toEqual([]);
  });
});
