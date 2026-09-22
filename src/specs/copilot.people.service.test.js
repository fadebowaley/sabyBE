const mockModels = {
  User: { find: jest.fn() },
  Role: { find: jest.fn() },
  Nodes: { find: jest.fn() },
  Permission: { find: jest.fn() },
};

const mockAgentTaskService = {
  createTask: jest.fn(),
  createTaskStep: jest.fn(),
  setCurrentTaskStep: jest.fn(),
};

const chain = (rows) => ({
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(rows),
});

jest.mock('../models', () => mockModels);
jest.mock('../services/agentTask.service', () => mockAgentTaskService);

const peopleService = require('../services/copilotPeople.service');

const users = [
  {
    _id: 'u1obj',
    userId: 'u-1',
    firstname: 'Ada',
    lastname: 'Obi',
    email: 'ada@saby.test',
    status: true,
    isEmailVerified: true,
    isOwner: true,
    roles: ['r1obj'],
  },
  {
    _id: 'u2obj',
    userId: 'u-2',
    firstname: 'Bola',
    lastname: 'Eze',
    email: 'bola@saby.test',
    status: true,
    isEmailVerified: false,
    roles: [],
  },
  {
    _id: 'u3obj',
    userId: 'u-3',
    firstname: 'Chidi',
    lastname: 'Nwosu',
    email: 'chidi@saby.test',
    status: false,
    isEmailVerified: true,
    roles: ['r2obj'],
  },
];

const roles = [
  {
    _id: 'r1obj',
    name: 'Administrator',
    permissions: ['p1obj'],
    isActive: true,
  },
  { _id: 'r2obj', name: 'Finance Officer', permissions: [], isActive: true },
];

const nodes = [
  {
    _id: 'n1obj',
    nodeId: 'n-lagos',
    name: 'Lagos',
    parent: null,
    users: ['u1obj', 'u3obj'],
    level: { _id: 'l1obj', name: 'Region', rank: 1 },
    structure: { _id: 's1obj', name: 'Branch', type: 'branch' },
    isActive: true,
  },
  {
    _id: 'n2obj',
    nodeId: 'n-ikeja',
    name: 'Ikeja',
    parent: 'n1obj',
    users: [],
    level: null,
    structure: null,
    isActive: true,
  },
];

const permissions = [
  { _id: 'p1obj', name: 'user:read', resource: 'user', action: 'read' },
];

const primeModels = () => {
  mockModels.User.find.mockReturnValue(chain(users));
  mockModels.Role.find.mockReturnValue(chain(roles));
  mockModels.Nodes.find.mockReturnValue(chain(nodes));
  mockModels.Permission.find.mockReturnValue(chain(permissions));
};

describe('copilotPeople.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getPeopleState derives flags, membership, and role grants', async () => {
    primeModels();

    const state = await peopleService.getPeopleState({ tenantId: 'tenant-1' });

    const ada = state.users.find((user) => user.userId === 'u-1');
    expect(ada.flags).toEqual([]);
    expect(ada.memberNodeIds).toEqual(['n-lagos']);
    expect(ada.roleNames).toEqual(['Administrator']);

    const bola = state.users.find((user) => user.userId === 'u-2');
    expect(bola.flags).toEqual(['unverified', 'noRole', 'noOrgAssignment']);

    const chidi = state.users.find((user) => user.userId === 'u-3');
    expect(chidi.flags).toEqual(['inactive']);

    expect(state.units.find((unit) => unit.nodeId === 'n-lagos')).toMatchObject(
      {
        activeMemberCount: 1,
        childIds: ['n-ikeja'],
        levelName: 'Region',
        structureName: 'Branch',
        responsibilityKnown: false,
      }
    );
    expect(state.roles.find((role) => role.roleId === 'r1obj').userCount).toBe(
      1
    );
    expect(state.permissions[0].roleIds).toEqual(['r1obj']);
    expect(state.derived.userCount).toBe(3);
    expect(state.derived.unverifiedUserCount).toBe(1);
  });

  test('getPeopleState narrows to a single user', async () => {
    primeModels();

    const state = await peopleService.getPeopleState({
      tenantId: 'tenant-1',
      userId: 'u-1',
    });

    expect(state.users.map((user) => user.userId)).toEqual(['u-1']);
    expect(state.units.map((unit) => unit.nodeId)).toEqual(['n-lagos']);
    expect(state.roles.map((role) => role.roleId)).toEqual(['r1obj']);
  });

  test('observePeople returns evidence-backed observations only', async () => {
    primeModels();

    const result = await peopleService.observePeople({ tenantId: 'tenant-1' });

    expect(
      result.observations.map((observation) => observation.ruleId)
    ).toEqual(['data_quality', 'lifecycle_problem']);
    expect(result.observations[0].severity).toBe('warning');
    expect(result.observations[1].severity).toBe('critical');
    expect(result.deferred.length).toBe(2);
  });

  test('observePeople fires role_assignment_mismatch under a roleUnit policy', async () => {
    primeModels();

    const result = await peopleService.observePeople({
      tenantId: 'tenant-1',
      ruleId: 'role_assignment_mismatch',
      policy: {
        roleUnit: [
          { roleId: 'r1obj', expectedStructureTypes: ['region'] },
          { roleId: 'r2obj', maxUnits: 1 },
        ],
      },
    });

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      ruleId: 'role_assignment_mismatch',
      severity: 'warning',
      subject: { kind: 'USER', id: 'u-1' },
      summary: 'Ada Obi assigned against the r1obj policy',
    });
    expect(result.observations[0].evidence[0].source).toBe('policy:r1obj');
    expect(result.deferred.map((rule) => rule.ruleId)).toEqual([
      'access_anomaly',
    ]);
  });

  test('observePeople fires access_anomaly beyond the expected permission set', async () => {
    primeModels();

    const result = await peopleService.observePeople({
      tenantId: 'tenant-1',
      ruleId: 'access_anomaly',
      policy: {
        permissionBreadth: [
          { roleId: 'r1obj', expectedPermissionIds: ['p-other'] },
        ],
      },
    });

    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      ruleId: 'access_anomaly',
      severity: 'warning',
      subject: { kind: 'ROLE', id: 'r1obj' },
      summary: 'Role Administrator grants 1 permission(s) beyond its policy',
    });
    expect(result.observations[0].evidence[1]).toEqual({
      source: 'permission:p1obj',
      detail: 'granted but not in policy: user:read',
    });
    expect(result.deferred.map((rule) => rule.ruleId)).toEqual([
      'role_assignment_mismatch',
    ]);
  });

  test('recordPeopleEvent persists an audited task and step', async () => {
    mockAgentTaskService.createTask.mockResolvedValue({ id: 'task-1' });
    mockAgentTaskService.createTaskStep.mockResolvedValue({ id: 'step-1' });
    mockAgentTaskService.setCurrentTaskStep.mockResolvedValue({ id: 'task-1' });

    const result = await peopleService.recordPeopleEvent({
      tenantId: 'tenant-1',
      requestedByUserId: 'u-1',
      kind: 'observation',
      summary: 'Lagos has no admin',
      ruleId: 'org_gap',
    });

    expect(mockAgentTaskService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        intent: 'people.observation',
        status: 'completed',
      })
    );
    expect(mockAgentTaskService.createTaskStep).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        toolName: 'people.event.record',
      })
    );
    expect(result).toEqual({
      taskId: 'task-1',
      stepId: 'step-1',
      durableTarget: {
        taskType: 'people.observation',
        stepType: 'observation',
      },
    });
  });

  test('recordPeopleEvent rejects an invalid kind', async () => {
    await expect(
      peopleService.recordPeopleEvent({
        tenantId: 'tenant-1',
        kind: 'other',
        summary: 'x',
      })
    ).rejects.toThrow('kind must be observation or decision');
  });
});
