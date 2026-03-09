const mockStructures = { find: jest.fn() };
const mockLevel = { find: jest.fn(), deleteOne: jest.fn() };
const mockNodes = { find: jest.fn(), deleteOne: jest.fn() };
const mockRole = { find: jest.fn(), deleteOne: jest.fn() };
const mockUser = { find: jest.fn(), deleteOne: jest.fn(), updateOne: jest.fn() };

const mockStructureService = {
  createStructure: jest.fn(),
  updateStructureById: jest.fn(),
};
const mockLevelService = {
  createLevel: jest.fn(),
  updateLevelById: jest.fn(),
};
const mockNodeService = {
  createNode: jest.fn(),
  updateNodeById: jest.fn(),
  getNodeById: jest.fn(),
  assignUsersToNode: jest.fn(),
};
const mockRoleService = {
  createRole: jest.fn(),
  updateRoleById: jest.fn(),
};
const mockUserService = {
  ownerCreate: jest.fn(),
  updateUserById: jest.fn(),
  assignRoles: jest.fn(),
};

jest.mock('../models', () => ({
  Structures: mockStructures,
  Level: mockLevel,
  Nodes: mockNodes,
  Role: mockRole,
  User: mockUser,
}));
jest.mock('../services/structure.service', () => mockStructureService);
jest.mock('../services/level.service', () => mockLevelService);
jest.mock('../services/node.service', () => mockNodeService);
jest.mock('../services/role.service', () => mockRoleService);
jest.mock('../services/user.service', () => mockUserService);

const {
  validateOnboardingCsvDryRun,
  importOnboardingCsv,
} = require('../services/copilotOnboarding.service');

const asLeanQuery = (rows) => {
  const lean = jest.fn().mockResolvedValue(rows);
  return {
    lean,
    select: jest.fn().mockReturnValue({ lean }),
  };
};

describe('copilot onboarding service (dry-run)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStructures.find.mockReturnValue(asLeanQuery([]));
    mockLevel.find.mockReturnValue(asLeanQuery([]));
    mockNodes.find.mockReturnValue(asLeanQuery([]));
    mockRole.find.mockReturnValue(asLeanQuery([]));
    mockUser.find.mockReturnValue(asLeanQuery([]));
    mockLevel.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mockNodes.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mockRole.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mockUser.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mockUser.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  test('passes dry-run when references are resolvable in CSV', async () => {
    const csvText = [
      'record_type,structure_name,level_name,level_rank,node_name,parent_node_name,role_name,user_email,first_name,last_name',
      'structure,National,,,,,,,,',
      'level,National,Region,2,,,,,,',
      'node,National,Region,2,Ibadan Zone,,,,,',
      'role,,,,,,Pastor,,,',
      'user,,,,,,,pastor.one@sotsm.org,Pastor,One',
      'user_role,,,,,,Pastor,pastor.one@sotsm.org,,',
      'user_node,,,,Ibadan Zone,,,pastor.one@sotsm.org,,',
    ].join('\n');

    const result = await validateOnboardingCsvDryRun({
      tenantId: 'tenant-1',
      csvText,
    });

    expect(result.ok).toBe(true);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.rowCount).toBe(7);
  });

  test('returns errors for missing references', async () => {
    const csvText = [
      'record_type,structure_name,level_name,level_rank,node_name,parent_node_name,role_name,user_email,first_name,last_name',
      'user_role,,,,,,Pastor,unknown@sotsm.org,,',
    ].join('\n');

    const result = await validateOnboardingCsvDryRun({
      tenantId: 'tenant-1',
      csvText,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'missing_user_reference')).toBe(
      true
    );
    expect(result.errors.some((e) => e.code === 'missing_role_reference')).toBe(
      true
    );
  });

  test('executes onboarding import successfully when dry-run passes', async () => {
    const csvText = [
      'record_type,structure_name,level_name,level_rank,node_name,parent_node_name,role_name,user_email,first_name,last_name',
      'structure,National,,,,,,,,',
      'level,National,Region,2,,,,,,',
      'node,National,Region,2,Ibadan Zone,,,,,',
      'role,,,,,,Pastor,,,',
      'user,,,,,,,pastor.one@sotsm.org,Pastor,One',
      'user_role,,,,,,Pastor,pastor.one@sotsm.org,,',
      'user_node,,,,Ibadan Zone,,,pastor.one@sotsm.org,,',
    ].join('\n');

    mockLevelService.createLevel.mockResolvedValue({
      _id: 'lvl1',
      name: 'Region',
      rank: 2,
      toObject() {
        return this;
      },
    });
    mockStructureService.createStructure.mockResolvedValue({
      _id: 'str1',
      name: 'National',
      level: 'lvl1',
      toObject() {
        return this;
      },
    });
    mockNodeService.createNode.mockResolvedValue({
      _id: 'node1',
      name: 'Ibadan Zone',
      users: [],
      toObject() {
        return this;
      },
    });
    mockRoleService.createRole.mockResolvedValue({
      _id: 'role1',
      name: 'Pastor',
      toObject() {
        return this;
      },
    });
    mockUserService.ownerCreate.mockResolvedValue({
      _id: 'user1',
      email: 'pastor.one@sotsm.org',
      roles: [],
      toObject() {
        return this;
      },
    });
    mockUserService.assignRoles.mockResolvedValue({
      _id: 'user1',
      email: 'pastor.one@sotsm.org',
      roles: ['role1'],
      toObject() {
        return this;
      },
    });
    mockNodeService.getNodeById.mockResolvedValue({
      _id: 'node1',
      users: [],
    });
    mockNodeService.assignUsersToNode.mockResolvedValue({
      _id: 'node1',
      name: 'Ibadan Zone',
      users: ['user1'],
      toObject() {
        return this;
      },
    });

    const result = await importOnboardingCsv({
      tenantId: 'tenant-1',
      csvText,
      actorUser: { _id: 'actor1', userId: 'u-actor', isOwner: true },
    });

    expect(result.ok).toBe(true);
    expect(result.summary.rolledBack).toBe(false);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.created).toBeGreaterThan(0);
    expect(mockLevelService.createLevel).toHaveBeenCalled();
    expect(mockStructureService.createStructure).toHaveBeenCalled();
    expect(mockNodeService.createNode).toHaveBeenCalled();
    expect(mockRoleService.createRole).toHaveBeenCalled();
    expect(mockUserService.ownerCreate).toHaveBeenCalled();
    expect(mockUserService.assignRoles).toHaveBeenCalled();
    expect(mockNodeService.assignUsersToNode).toHaveBeenCalled();
  });

  test('rolls back created records when a later stage fails', async () => {
    const csvText = [
      'record_type,structure_name,level_name,level_rank,node_name,parent_node_name,role_name,user_email,first_name,last_name',
      'structure,National,,,,,,,,',
      'level,National,Region,2,,,,,,',
      'node,National,Region,2,Ibadan Zone,,,,,',
      'role,,,,,,Pastor,,,',
      'user,,,,,,,pastor.one@sotsm.org,Pastor,One',
      'user_role,,,,,,Pastor,pastor.one@sotsm.org,,',
    ].join('\n');

    mockLevelService.createLevel.mockResolvedValue({
      _id: 'lvl1',
      name: 'Region',
      rank: 2,
      toObject() {
        return this;
      },
    });
    mockStructureService.createStructure.mockResolvedValue({
      _id: 'str1',
      name: 'National',
      level: 'lvl1',
      toObject() {
        return this;
      },
    });
    mockNodeService.createNode.mockResolvedValue({
      _id: 'node1',
      name: 'Ibadan Zone',
      users: [],
      toObject() {
        return this;
      },
    });
    mockRoleService.createRole.mockResolvedValue({
      _id: 'role1',
      name: 'Pastor',
      toObject() {
        return this;
      },
    });
    mockUserService.ownerCreate.mockResolvedValue({
      _id: 'user1',
      email: 'pastor.one@sotsm.org',
      roles: [],
      toObject() {
        return this;
      },
    });
    mockUserService.assignRoles.mockRejectedValue(new Error('assign failed'));

    const result = await importOnboardingCsv({
      tenantId: 'tenant-1',
      csvText,
      actorUser: { _id: 'actor1', userId: 'u-actor', isOwner: true },
    });

    expect(result.ok).toBe(false);
    expect(result.summary.rolledBack).toBe(true);
    expect(mockUser.deleteOne).toHaveBeenCalledWith({ _id: 'user1' });
    expect(mockRole.deleteOne).toHaveBeenCalledWith({ _id: 'role1' });
    expect(mockNodes.deleteOne).toHaveBeenCalledWith({ _id: 'node1' });
    expect(mockLevel.deleteOne).toHaveBeenCalledWith({ _id: 'lvl1' });
  });
});
