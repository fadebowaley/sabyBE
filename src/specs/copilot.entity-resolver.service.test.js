const mockModels = {
  User: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
  Role: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
  Nodes: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
  ProjectForm: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
  Permission: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
};

const mockPostgresPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
};

const cacheStore = new Map();
const mockRedisClient = {
  status: 'ready',
  get: jest.fn(async (key) => cacheStore.get(key) || null),
  setex: jest.fn(async (key, _ttl, value) => {
    cacheStore.set(key, value);
  }),
};

const chain = (rows) => ({
  select: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(rows),
});

jest.mock('../models', () => mockModels);
jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));
jest.mock('../config/redis', () => ({
  get redisClient() {
    return mockRedisClient;
  },
}));

const resolverService = require('../services/copilotEntityResolver.service');

describe('copilotEntityResolver.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();
  });

  test('searchEntities returns ranked user/role hits', async () => {
    mockModels.User.find.mockReturnValue(
      chain([
        {
          _id: 'u1',
          tenantId: 'tenant-1',
          firstname: 'Israel',
          lastname: 'A',
          email: 'isreal@sotsm.org',
        },
      ])
    );
    mockModels.Role.find.mockReturnValue(
      chain([
        {
          _id: 'r1',
          tenantId: 'tenant-1',
          name: 'Regional Admin',
          description: 'Admin role',
        },
      ])
    );

    const results = await resolverService.searchEntities({
      tenantId: 'tenant-1',
      query: 'israel',
      entityTypes: ['user', 'role'],
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('entityType');
  });

  test('resolveEntityReference returns resolved on exact match', async () => {
    mockModels.Role.find.mockReturnValue(
      chain([
        {
          _id: 'r1',
          tenantId: 'tenant-1',
          name: 'Regional Admin',
          description: 'Admin role',
        },
      ])
    );

    const result = await resolverService.resolveEntityReference({
      tenantId: 'tenant-1',
      entityType: 'role',
      value: 'Regional Admin',
    });

    expect(result.status).toBe('resolved');
    expect(result.candidate.id).toBe('r1');
  });

  test('resolveEntityReference returns ambiguous when multiple candidates exist', async () => {
    mockModels.Role.find.mockReturnValue(
      chain([
        {
          _id: 'r1',
          tenantId: 'tenant-1',
          name: 'Regional Admin',
        },
        {
          _id: 'r2',
          tenantId: 'tenant-1',
          name: 'Regional Auditor',
        },
      ])
    );
    const result = await resolverService.resolveEntityReference({
      tenantId: 'tenant-1',
      entityType: 'role',
      value: 'Regional',
    });
    expect(result.status).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
  });

  test('resolveActionPayload resolves assign_role using userEmail + roleName', async () => {
    mockModels.User.find.mockReturnValue(
      chain([
        {
          _id: 'u1',
          tenantId: 'tenant-1',
          firstname: 'Israel',
          lastname: 'A',
          email: 'isreal@sotsm.org',
        },
      ])
    );
    mockModels.Role.find.mockReturnValue(
      chain([
        {
          _id: 'r1',
          tenantId: 'tenant-1',
          name: 'Regional Admin',
          description: 'Admin role',
        },
      ])
    );

    const result = await resolverService.resolveActionPayload({
      tenantId: 'tenant-1',
      actionType: 'assign_role',
      payload: {
        userEmail: 'isreal@sotsm.org',
        roleName: 'Regional Admin',
      },
    });

    expect(result.canExecute).toBe(true);
    expect(result.resolvedPayload.userId).toBe('u1');
    expect(result.resolvedPayload.roleId).toBe('r1');
  });

  test('searchEntities uses Redis cache on repeated query', async () => {
    mockModels.User.find.mockReturnValue(
      chain([
        {
          _id: 'u1',
          tenantId: 'tenant-1',
          firstname: 'Israel',
          lastname: 'A',
          email: 'isreal@sotsm.org',
        },
      ])
    );

    const first = await resolverService.searchEntities({
      tenantId: 'tenant-1',
      query: 'isreal',
      entityTypes: ['user'],
      limit: 5,
    });
    const second = await resolverService.searchEntities({
      tenantId: 'tenant-1',
      query: 'isreal',
      entityTypes: ['user'],
      limit: 5,
    });

    expect(first).toEqual(second);
    expect(mockModels.User.find).toHaveBeenCalledTimes(1);
    expect(mockRedisClient.setex).toHaveBeenCalled();
  });

  test('resolveActionPayload resolves grant_permission roleName + permissionName', async () => {
    mockModels.Role.find.mockReturnValue(
      chain([
        {
          _id: 'r1',
          tenantId: 'tenant-1',
          name: 'Regional Admin',
        },
      ])
    );
    mockModels.Permission.find.mockReturnValue(
      chain([
        {
          _id: 'p1',
          name: 'manage:user',
          resource: 'user',
          action: 'manage',
        },
      ])
    );

    const result = await resolverService.resolveActionPayload({
      tenantId: 'tenant-1',
      actionType: 'grant_permission',
      payload: {
        roleName: 'Regional Admin',
        permissionName: 'manage:user',
      },
    });

    expect(result.canExecute).toBe(true);
    expect(result.resolvedPayload.roleId).toBe('r1');
    expect(result.resolvedPayload.permissionId).toBe('p1');
  });
});
