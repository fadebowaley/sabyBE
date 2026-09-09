const crypto = require('crypto');
const httpStatus = require('http-status');

const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token || '')).digest('hex');

const mockUserModel = {
  findOne: jest.fn(),
  createUser: jest.fn(),
};

const mockWorkspaceInvitationModel = {
  findOne: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn(),
};

const mockProjectFormWorkspaceService = {
  WORKSPACE_STATUS_ACTIVE: 'active',
  ensureTenantWorkspaces: jest.fn(),
  findActiveWorkspace: jest.fn(),
  addWorkspaceMember: jest.fn(),
  listWorkspaces: jest.fn(),
};

const mockEmailService = {
  sendWorkspaceInvitationEmail: jest.fn(),
};

const mockSubscriptionService = {
  assertSubscriptionLimit: jest.fn(),
};

jest.mock('../config/config', () => ({
  clientUrl: 'https://saby.ai',
}));

jest.mock('../models', () => ({
  Permission: { find: jest.fn(), insertMany: jest.fn() },
  Role: { findOne: jest.fn(), create: jest.fn(), find: jest.fn() },
  User: mockUserModel,
  WorkspaceInvitation: mockWorkspaceInvitationModel,
}));

jest.mock('../services/projectFormWorkspace.service', () => mockProjectFormWorkspaceService);
jest.mock('../services/email.service', () => mockEmailService);
jest.mock('../services/subscription.service', () => mockSubscriptionService);
jest.mock('../services/studioAccess.service', () => ({
  invalidateStudioAccessState: jest.fn(),
}));

const workspaceInvitationService = require('../services/workspaceInvitation.service');

describe('workspaceInvitation.service cross-tenant guards', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('acceptWorkspaceInvitation', () => {
    const token = 'test-token-123';
    const invitation = {
      tokenHash: hashToken(token),
      tenantId: 'tenant-A',
      workspaceId: 'ws_1',
      email: 'person@example.com',
      workspaceRole: 'owner',
      accessProfileId: 'workspace_owner',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      invitedBy: '507f191e810c19729de860ea',
      invitedUserId: null,
      save: jest.fn().mockResolvedValue(true),
    };

    test('rejects when the email already belongs to another organisation (owner)', async () => {
      mockWorkspaceInvitationModel.findOne.mockResolvedValue(invitation);

      // tenant-scoped lookup finds nothing, global lookup finds a cross-tenant user
      mockUserModel.findOne
        .mockResolvedValueOnce(null) // tenantId + email
        .mockResolvedValueOnce({
          // global email lookup
          _id: '507f191e810c19729de860eb',
          email: 'person@example.com',
          tenantId: 'tenant-B',
          isOwner: true,
        });

      await expect(
        workspaceInvitationService.acceptWorkspaceInvitation({
          token,
          firstname: 'Jane',
          lastname: 'Doe',
          password: 'password1',
        })
      ).rejects.toMatchObject({
        statusCode: httpStatus.BAD_REQUEST,
        message: 'User already exists with another organisation, and cannot be added',
      });

      expect(mockUserModel.createUser).not.toHaveBeenCalled();
    });

    test('rejects a cross-tenant non-owner user too', async () => {
      mockWorkspaceInvitationModel.findOne.mockResolvedValue(invitation);

      mockUserModel.findOne
        .mockResolvedValueOnce(null) // tenantId + email
        .mockResolvedValueOnce({
          // global email lookup
          _id: '507f191e810c19729de860eb',
          email: 'person@example.com',
          tenantId: 'tenant-B',
          isOwner: false,
        });

      await expect(
        workspaceInvitationService.acceptWorkspaceInvitation({
          token,
          firstname: 'Jane',
          lastname: 'Doe',
          password: 'password1',
        })
      ).rejects.toMatchObject({
        statusCode: httpStatus.BAD_REQUEST,
        message: 'User already exists with another organisation, and cannot be added',
      });

      expect(mockUserModel.createUser).not.toHaveBeenCalled();
    });
  });

  describe('createWorkspaceInvitation', () => {
    const workspace = {
      workspaceId: 'ws_1',
      name: 'Main workspace',
      members: [],
    };

    beforeEach(() => {
      mockProjectFormWorkspaceService.ensureTenantWorkspaces.mockResolvedValue({
        onboarding: { workspaces: [workspace] },
      });
      mockProjectFormWorkspaceService.findActiveWorkspace.mockReturnValue(workspace);
      mockWorkspaceInvitationModel.updateMany.mockResolvedValue({});
      mockWorkspaceInvitationModel.create.mockResolvedValue({
        _id: 'inv-1',
        id: 'inv-1',
        workspaceId: 'ws_1',
        email: 'person@example.com',
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockEmailService.sendWorkspaceInvitationEmail.mockResolvedValue(true);
    });

    test('rejects when the email already belongs to another organisation', async () => {
      mockUserModel.findOne
        .mockResolvedValueOnce(null) // same-tenant lookup
        .mockResolvedValueOnce({
          // global lookup
          _id: '507f191e810c19729de860eb',
          email: 'person@example.com',
          tenantId: 'tenant-B',
          isOwner: true,
        });

      await expect(
        workspaceInvitationService.createWorkspaceInvitation({
          tenantId: 'tenant-A',
          actorUserId: '507f191e810c19729de860ea',
          workspaceId: 'ws_1',
          email: 'person@example.com',
          accessProfileId: 'viewer',
        })
      ).rejects.toMatchObject({
        statusCode: httpStatus.BAD_REQUEST,
        message: 'User already exists with another organisation, and cannot be added',
      });

      expect(mockWorkspaceInvitationModel.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendWorkspaceInvitationEmail).not.toHaveBeenCalled();
    });

    test('rejects when the user is already an active member of the workspace', async () => {
      const workspaceWithMember = {
        ...workspace,
        members: [
          {
            userId: '507f191e810c19729de860eb',
            role: 'viewer',
            status: 'active',
          },
        ],
      };
      mockProjectFormWorkspaceService.findActiveWorkspace.mockReturnValue(
        workspaceWithMember
      );

      mockUserModel.findOne.mockResolvedValue({
        _id: '507f191e810c19729de860eb',
        email: 'person@example.com',
        tenantId: 'tenant-A',
      });

      await expect(
        workspaceInvitationService.createWorkspaceInvitation({
          tenantId: 'tenant-A',
          actorUserId: '507f191e810c19729de860ea',
          workspaceId: 'ws_1',
          email: 'person@example.com',
          accessProfileId: 'viewer',
        })
      ).rejects.toMatchObject({
        statusCode: httpStatus.BAD_REQUEST,
        message: 'This user already belongs to the selected workspace',
      });

      expect(mockWorkspaceInvitationModel.create).not.toHaveBeenCalled();
    });
  });
});
