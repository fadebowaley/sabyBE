const mockUserService = {
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserById: jest.fn(),
  updateUserById: jest.fn(),
  softDeleteUserById: jest.fn(),
  assignRoles: jest.fn(),
};

const mockRoleService = {
  getRoleById: jest.fn(),
  assignPermissions: jest.fn(),
  removePermissionsFromRole: jest.fn(),
};

const mockNodeService = {
  getNodeById: jest.fn(),
  moveNodeToParent: jest.fn(),
};

const mockProjectFormService = {
  createProjectForm: jest.fn(),
  getProjectFormById: jest.fn(),
  archiveProjectForm: jest.fn(),
  restoreProjectFormById: jest.fn(),
};

const mockSubmissionService = {
  queueSubmission: jest.fn(),
  queueUpdateSubmission: jest.fn(),
};

const mockInmailService = {
  sendMessage: jest.fn(),
  markAsRead: jest.fn(),
};

const mockWorkItemService = {
  createWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
  deleteWorkItem: jest.fn(),
};

jest.mock('../services/user.service', () => mockUserService);
jest.mock('../services/role.service', () => mockRoleService);
jest.mock('../services/node.service', () => mockNodeService);
jest.mock('../models', () => ({
  User: {
    findById: jest.fn().mockImplementation((id) => Promise.resolve({ _id: id })),
    findOne: jest.fn().mockImplementation((q) => Promise.resolve({ _id: q?.userId || 'user-1' })),
  },
  Nodes: {
    find: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
      select: jest.fn().mockResolvedValue([{ users: ['user-branch-1', 'user-branch-2'] }]),
    }),
    findOne: jest.fn().mockResolvedValue({ _id: 'node-branch-1', path: 'node-root#node-branch-1', tenantId: 'tenant-1' }),
    bulkWrite: jest.fn().mockResolvedValue({}),
  },
  Level: {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    findOne: jest.fn(),
  },
  Structures: {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    findOne: jest.fn(),
  },
  InMail: {
    findOne: jest.fn().mockImplementation(({ _id }) =>
      Promise.resolve({
        _id: _id || 'inmail-1',
        to: ['user-2'],
        subject: 'Test Subject',
        tenantId: 'tenant-1',
      })
    ),
  },
  WorkItem: {
    findOne: jest.fn().mockImplementation((q) =>
      Promise.resolve({
        _id: q?._id || 'work-item-1',
        title: 'Strategy Session',
        status: 'scheduled',
        shareCode: 'abc1234',
        meeting: { joinUrl: 'https://meet.google.com/test' },
        tenantId: 'tenant-1',
      })
    ),
    findOneAndUpdate: jest.fn().mockImplementation((q, u) =>
      Promise.resolve({
        _id: q?._id || 'work-item-1',
        status: u?.$set?.status || 'completed',
        tenantId: 'tenant-1',
      })
    ),
    findOneAndDelete: jest.fn().mockImplementation((q) =>
      Promise.resolve({
        _id: q?._id || 'work-item-1',
        tenantId: 'tenant-1',
      })
    ),
  },
  ProjectForm: {
    findOne: jest.fn().mockImplementation((q) =>
      Promise.resolve({
        _id: q?._id || 'pf-1',
        projectId: 'proj-1',
        identity: { name: 'Test Form' },
        tenantId: 'tenant-1',
      })
    ),
  },
}));
jest.mock('../services/projectForm.service', () => mockProjectFormService);
jest.mock('../services/submission.service', () => mockSubmissionService);
jest.mock('../services/inmail.service', () => mockInmailService);
jest.mock('../services/workItem.service', () => mockWorkItemService);

const {
  executeActionEvent,
} = require('../services/copilotCommandHandler.service');

describe('copilot command handler service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleService.getRoleById.mockResolvedValue({
      _id: 'role-1',
      tenantId: 'tenant-1',
    });
  });

  test('handles create_user using existing userService.createUser', async () => {
    mockUserService.createUser.mockResolvedValue({
      _id: 'user-1',
      email: 'new@example.com',
    });

    const result = await executeActionEvent({
      action_type: 'create_user',
      tenant_id: 'tenant-1',
      actor_user_id: '507f1f77bcf86cd799439011',
      payload_json: {
        userBody: {
          email: 'new@example.com',
          firstname: 'New',
          lastname: 'User',
          password: 'NewSecret123!',
        },
      },
    });

    expect(mockUserService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        createdBy: '507f1f77bcf86cd799439011',
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
      deletedUser: { _id: '507f1f77bcf86cd799439012' },
    });

    const result = await executeActionEvent({
      action_type: 'deactivate_user',
      tenant_id: 'tenant-1',
      entity_id: '507f1f77bcf86cd799439012',
      payload_json: {},
    });

    expect(mockUserService.softDeleteUserById).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012'
    );
    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        resultType: 'user_deactivated',
        entityId: '507f1f77bcf86cd799439012',
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
    mockRoleService.getRoleById.mockResolvedValue({
      _id: 'role-1',
      tenantId: 'tenant-1',
    });
    mockRoleService.assignPermissions.mockResolvedValue({
      _id: 'role-1',
      tenantId: 'tenant-1',
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
    mockRoleService.getRoleById.mockResolvedValue({
      _id: 'role-1',
      tenantId: 'tenant-1',
    });
    mockRoleService.removePermissionsFromRole.mockResolvedValue({
      _id: 'role-1',
      tenantId: 'tenant-1',
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

  test('blocks reset_password when target user belongs to another tenant', async () => {
    mockUserService.getUserByEmail.mockResolvedValue({
      _id: 'user-1',
      email: 'person@example.com',
      tenantId: 'tenant-2',
    });

    await expect(
      executeActionEvent({
        action_type: 'reset_password',
        tenant_id: 'tenant-1',
        actor_user_id: '507f1f77bcf86cd799439011',
        payload_json: {
          email: 'person@example.com',
          newPassword: 'NewSecret123!',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('does not belong to tenant'),
    });
    expect(mockUserService.updateUserById).not.toHaveBeenCalled();
  });

  test('blocks assign_role when target user belongs to another tenant', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: 'user-1',
      tenantId: 'tenant-2',
    });

    await expect(
      executeActionEvent({
        action_type: 'assign_role',
        tenant_id: 'tenant-1',
        entity_id: 'user-1',
        payload_json: {
          roleIds: ['role-1'],
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('User does not belong to tenant'),
    });
    expect(mockUserService.assignRoles).not.toHaveBeenCalled();
  });

  test('blocks grant_permission when target role belongs to another tenant', async () => {
    mockRoleService.getRoleById.mockResolvedValue({
      _id: 'role-1',
      tenantId: 'tenant-2',
    });

    await expect(
      executeActionEvent({
        action_type: 'grant_permission',
        tenant_id: 'tenant-1',
        entity_id: 'role-1',
        payload_json: {
          permissionIds: ['perm-1'],
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('Role does not belong to tenant'),
    });
    expect(mockRoleService.assignPermissions).not.toHaveBeenCalled();
  });

  test('blocks move_node when target parent belongs to another tenant', async () => {
    mockNodeService.getNodeById
      .mockResolvedValueOnce({
        _id: 'node-1',
        tenantId: 'tenant-1',
      })
      .mockResolvedValueOnce({
        _id: 'node-2',
        tenantId: 'tenant-2',
      });

    await expect(
      executeActionEvent({
        action_type: 'move_node',
        tenant_id: 'tenant-1',
        entity_id: 'node-1',
        payload_json: {
          targetParentId: 'node-2',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining(
        'Target parent node does not belong to tenant'
      ),
    });
    expect(mockNodeService.moveNodeToParent).not.toHaveBeenCalled();
  });

  test('blocks archive_project when project belongs to another tenant', async () => {
    mockProjectFormService.getProjectFormById.mockResolvedValue({
      _id: 'project-1',
      tenantId: 'tenant-2',
    });

    await expect(
      executeActionEvent({
        action_type: 'archive_project',
        tenant_id: 'tenant-1',
        entity_id: 'project-1',
        payload_json: {},
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('Project does not belong to tenant'),
    });
    expect(mockProjectFormService.archiveProjectForm).not.toHaveBeenCalled();
  });

  test('handles send_inmail with read-back verification', async () => {
    mockInmailService.sendMessage.mockResolvedValueOnce({
      _id: 'inmail-123',
      to: ['user-2'],
      subject: 'Quarterly Review',
    });

    const result = await executeActionEvent({
      action_type: 'send_inmail',
      tenant_id: 'tenant-1',
      actor_user_id: 'actor-1',
      payload_json: {
        to: ['user-2'],
        subject: 'Quarterly Review',
        body: 'Please see attached Q3 review',
      },
    });

    expect(result).toMatchObject({
      handled: true,
      resultType: 'send_inmail_completed',
      messageId: 'inmail-123',
    });
    expect(mockInmailService.sendMessage).toHaveBeenCalled();
  });

  test('handles send_announcement with node-based recipient expansion', async () => {
    mockInmailService.sendMessage.mockResolvedValueOnce({
      _id: 'inmail-ann-1',
      to: ['user-branch-1', 'user-branch-2'],
      subject: 'Policy Update',
    });

    const result = await executeActionEvent({
      action_type: 'send_announcement',
      tenant_id: 'tenant-1',
      actor_user_id: 'actor-1',
      payload_json: {
        targetNodeId: 'node-branch-1',
        subject: 'Policy Update',
        body: 'All staff in branch note the new shift policy',
      },
    });

    expect(result).toMatchObject({
      handled: true,
      resultType: 'send_announcement_completed',
    });
    expect(mockInmailService.sendMessage).toHaveBeenCalled();
  });

  test('handles mark_inmail_read', async () => {
    mockInmailService.markAsRead.mockResolvedValueOnce({
      _id: 'inmail-123',
      read: true,
    });

    const result = await executeActionEvent({
      action_type: 'mark_inmail_read',
      tenant_id: 'tenant-1',
      actor_user_id: 'actor-1',
      payload_json: {
        messageId: 'inmail-123',
      },
    });

    expect(result).toEqual({
      handled: true,
      resultType: 'mark_inmail_read_completed',
      messageId: 'inmail-123',
      isRead: true,
    });
    expect(mockInmailService.markAsRead).toHaveBeenCalledWith('inmail-123', 'actor-1');
  });

  test('handles create_task with MongoDB WorkItem read-back verification', async () => {
    mockWorkItemService.createWorkItem.mockResolvedValueOnce({
      _id: 'task-101',
      title: 'Audit Report',
      status: 'scheduled',
    });

    const result = await executeActionEvent({
      action_type: 'create_task',
      tenant_id: 'tenant-1',
      actor_user_id: 'actor-1',
      payload_json: {
        title: 'Audit Report',
        dueAt: '2026-09-30T17:00:00Z',
      },
    });

    expect(result).toMatchObject({
      handled: true,
      resultType: 'task_created',
      taskItemId: 'task-101',
      title: 'Strategy Session',
    });
    expect(mockWorkItemService.createWorkItem).toHaveBeenCalled();
  });

  test('handles create_event with video conference and shareCode', async () => {
    mockWorkItemService.createWorkItem.mockResolvedValueOnce({
      _id: 'event-202',
      title: 'Strategy Session',
      shareCode: 'abc1234',
      meeting: { joinUrl: 'https://meet.google.com/test' },
    });

    const result = await executeActionEvent({
      action_type: 'create_event',
      tenant_id: 'tenant-1',
      actor_user_id: 'actor-1',
      payload_json: {
        title: 'Strategy Session',
        videoConference: true,
      },
    });

    expect(result).toMatchObject({
      handled: true,
      resultType: 'event_created',
      eventId: 'event-202',
      shareCode: 'abc1234',
      meetingUrl: 'https://meet.google.com/test',
    });
    expect(mockWorkItemService.createWorkItem).toHaveBeenCalled();
  });

  test('handles delete_event', async () => {
    const result = await executeActionEvent({
      action_type: 'delete_event',
      tenant_id: 'tenant-1',
      actor_user_id: 'actor-1',
      payload_json: {
        eventId: 'event-202',
      },
    });

    expect(result).toMatchObject({
      handled: true,
      resultType: 'event_deleted',
      eventId: 'event-202',
    });
  });

  test('handles create_project_form with read-back verification', async () => {
    mockProjectFormService.createProjectForm.mockResolvedValue({
      _id: 'pf-101',
      projectId: 'proj-101',
      identity: { name: 'Field Intake Form' },
    });

    const result = await executeActionEvent({
      action_type: 'action_create_project_form',
      tenant_id: 'tenant-1',
      actor_user_id: '507f1f77bcf86cd799439011',
      payload_json: {
        title: 'Field Intake Form',
        elements: [
          { id: 'fld_1', type: 'text', properties: { label: 'Full Name' } },
        ],
      },
    });

    expect(result).toMatchObject({
      handled: true,
      resultType: 'project_created',
      entityId: 'pf-101',
      projectId: 'proj-1',
      projectName: 'Test Form',
    });
    expect(mockProjectFormService.createProjectForm).toHaveBeenCalled();
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
