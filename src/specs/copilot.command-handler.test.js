const mockUserService = {
  createUser: jest.fn(),
  updateUserById: jest.fn(),
  softDeleteUserById: jest.fn(),
};

const mockRoleService = {
  assignPermissions: jest.fn(),
  removePermissionsFromRole: jest.fn(),
};

const mockSubmissionService = {
  queueSubmission: jest.fn(),
  queueUpdateSubmission: jest.fn(),
};

jest.mock('../services/user.service', () => mockUserService);
jest.mock('../services/role.service', () => mockRoleService);
jest.mock('../services/submission.service', () => mockSubmissionService);

const { executeActionEvent } = require('../services/copilotCommandHandler.service');

describe('copilot command handler service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('handles create_user using existing userService.createUser', async () => {
    mockUserService.createUser.mockResolvedValue({
      _id: 'user-1',
      email: 'new@example.com',
    });

    const result = await executeActionEvent({
      action_type: 'create_user',
      tenant_id: 'tenant-1',
      actor_user_id: 'actor-1',
      payload_json: {
        userBody: {
          email: 'new@example.com',
          firstname: 'New',
          lastname: 'User',
          password: 'secret',
        },
      },
    });

    expect(mockUserService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        createdBy: 'actor-1',
        isOwner: false,
        isSuper: false,
        email: 'new@example.com',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({ handled: true, resultType: 'user_created' })
    );
  });

  test('handles submit_data using existing queueSubmission', async () => {
    mockSubmissionService.queueSubmission.mockResolvedValue({
      jobId: 'job-1',
      status: 'queued',
    });

    const result = await executeActionEvent({
      action_type: 'submit_data',
      tenant_id: 'tenant-1',
      actor_user_id: 'user-1',
      payload_json: {
        submissionBody: {
          projectId: 'project-1',
          formId: 'form-1',
          payload: { amount: 10 },
        },
      },
    });

    expect(mockSubmissionService.queueSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        projectId: 'project-1',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        resultType: 'submission_queued',
        jobId: 'job-1',
      })
    );
  });

  test('rejects create_user when actor_user_id and createdBy are missing', async () => {
    await expect(
      executeActionEvent({
        action_type: 'create_user',
        tenant_id: 'tenant-1',
        payload_json: {
          userBody: {
            email: 'new@example.com',
            firstname: 'New',
            lastname: 'User',
            password: 'secret',
          },
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('create_user requires actor_user_id'),
    });
  });

  test('handles update_user using existing userService.updateUserById', async () => {
    mockUserService.updateUserById.mockResolvedValue({
      _id: 'user-1',
      email: 'updated@example.com',
    });

    const result = await executeActionEvent({
      action_type: 'update_user',
      tenant_id: 'tenant-1',
      entity_id: 'user-1',
      payload_json: {
        userBody: {
          email: 'updated@example.com',
        },
      },
    });

    expect(mockUserService.updateUserById).toHaveBeenCalledWith(
      'user-1',
      { email: 'updated@example.com' },
      null
    );
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        resultType: 'user_updated',
        entityId: 'user-1',
      })
    );
  });

  test('handles deactivate_user using existing userService.softDeleteUserById', async () => {
    mockUserService.softDeleteUserById.mockResolvedValue({
      deletedUser: { _id: 'user-2' },
    });

    const result = await executeActionEvent({
      action_type: 'deactivate_user',
      tenant_id: 'tenant-1',
      entity_id: 'user-2',
      payload_json: {},
    });

    expect(mockUserService.softDeleteUserById).toHaveBeenCalledWith('user-2');
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        resultType: 'user_deactivated',
        entityId: 'user-2',
      })
    );
  });

  test('handles approve_submission using existing queueUpdateSubmission', async () => {
    mockSubmissionService.queueUpdateSubmission.mockResolvedValue({
      jobId: 'job-approve-1',
      status: 'queued',
    });

    const result = await executeActionEvent({
      action_type: 'approve_submission',
      tenant_id: 'tenant-1',
      actor_user_id: 'user-1',
      entity_id: 'submission-1',
      payload_json: {
        updates: {
          meta: { reason: 'copilot-approved' },
        },
      },
    });

    expect(mockSubmissionService.queueUpdateSubmission).toHaveBeenCalledWith({
      submissionId: 'submission-1',
      updates: {
        meta: { reason: 'copilot-approved' },
        status: 'approved',
      },
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        resultType: 'submission_approval_queued',
        submissionId: 'submission-1',
      })
    );
  });

  test('handles grant_permission using existing roleService.assignPermissions', async () => {
    mockRoleService.assignPermissions.mockResolvedValue({
      _id: 'role-1',
      permissions: ['perm-1'],
    });

    const result = await executeActionEvent({
      action_type: 'grant_permission',
      tenant_id: 'tenant-1',
      entity_id: 'role-1',
      payload_json: {
        permissionIds: ['perm-1'],
      },
    });

    expect(mockRoleService.assignPermissions).toHaveBeenCalledWith('role-1', [
      'perm-1',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        resultType: 'permission_granted',
        entityId: 'role-1',
      })
    );
  });

  test('handles revoke_permission using existing roleService.removePermissionsFromRole', async () => {
    mockRoleService.removePermissionsFromRole.mockResolvedValue({
      _id: 'role-1',
      permissions: [],
    });

    const result = await executeActionEvent({
      action_type: 'revoke_permission',
      tenant_id: 'tenant-1',
      entity_id: 'role-1',
      payload_json: {
        permissionIds: ['perm-1'],
      },
    });

    expect(mockRoleService.removePermissionsFromRole).toHaveBeenCalledWith(
      'role-1',
      ['perm-1']
    );
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        resultType: 'permission_revoked',
        entityId: 'role-1',
      })
    );
  });

  test('returns noop for unsupported action type', async () => {
    const result = await executeActionEvent({
      action_type: 'some_unhandled_action',
      tenant_id: 'tenant-1',
      payload_json: {},
    });

    expect(result).toEqual({ handled: false, resultType: 'noop' });
  });
});
