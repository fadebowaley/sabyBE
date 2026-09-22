const { User, Role, Nodes, Permission } = require('../models');
const agentTaskService = require('./agentTask.service');

/**
 * People intelligence read path.
 *
 * Produces the same derived People state and deterministic observations as the
 * governed `copilot-saby` runtime (src/people/state.ts and src/people/detect.ts)
 * so the CLI path and the governed path see one representation. Every fact
 * carries a source id, and unknown data never becomes a flag.
 *
 * Ports the canonical TypeScript implementation; keep the two in sync when the
 * rule set or flag derivation changes.
 */

const DEFERRED_DETECTION_RULES = [
  {
    ruleId: 'role_assignment_mismatch',
    reason:
      'needs a normative role↔unit mapping that the data model does not define',
  },
  {
    ruleId: 'access_anomaly',
    reason:
      "needs a definition of 'broader than assignment' beyond raw permission breadth",
  },
];

const personNameOf = (person) => {
  const parts = [person.firstname, person.lastname].filter(
    (part) => typeof part === 'string' && part.length > 0
  );
  return parts.length > 0 ? parts.join(' ') : person.email || person.userId;
};

const membershipsByUser = (units) => {
  const index = new Map();
  units.forEach((unit) => {
    (unit.memberUserIds || []).forEach((userId) => {
      index.set(userId, [...(index.get(userId) || []), unit]);
    });
  });
  return index;
};

/**
 * Fetches the tenant-scoped people snapshot from Mongo. Nodes carry their
 * members (User refs) and hierarchy; roles carry their permission refs.
 */
const getPeopleSnapshot = async ({ tenantId }) => {
  if (!tenantId) {
    const error = new Error('tenantId is required');
    error.statusCode = 400;
    throw error;
  }

  const [users, roles, nodes, permissions] = await Promise.all([
    User.find({ tenantId })
      .select(
        'userId firstname lastname email status isEmailVerified isPhoneVerified isOwner isSuper isAdmin onboardingComplete roles'
      )
      .lean(),
    Role.find({ tenantId }).select('name permissions isActive').lean(),
    Nodes.find({ tenantId, deletedAt: null })
      .select('nodeId name parent users level structure isActive')
      .populate('level', 'name rank')
      .populate('structure', 'name type')
      .lean(),
    Permission.find({}).select('name resource action').lean(),
  ]);

  const userByObjectId = new Map(users.map((user) => [String(user._id), user]));
  const nodeIdByObjectId = new Map(
    nodes.map((node) => [String(node._id), node.nodeId || String(node._id)])
  );
  const permissionById = new Map(
    permissions.map((permission) => [String(permission._id), permission])
  );

  const locationFor = (ref) => {
    if (!ref) return {};
    const id = String(ref._id || ref);
    return {
      id,
      name: ref.name || null,
      rank: ref.rank,
      type: ref.type,
    };
  };

  const units = nodes.map((node) => {
    const level = locationFor(node.level);
    const structure = locationFor(node.structure);
    const parentId = node.parent
      ? nodeIdByObjectId.get(String(node.parent))
      : null;
    return {
      nodeId: nodeIdByObjectId.get(String(node._id)),
      name: node.name || node.nodeId || String(node._id),
      parentId: parentId || null,
      childIds: nodes
        .filter(
          (candidate) => String(candidate.parent || '') === String(node._id)
        )
        .map((candidate) => nodeIdByObjectId.get(String(candidate._id)))
        .filter(Boolean),
      levelId: level.id,
      levelName: level.name || undefined,
      levelRank: level.rank,
      structureId: structure.id,
      structureName: structure.name || undefined,
      structureType: structure.type,
      memberUserIds: (node.users || [])
        .map((ref) => userByObjectId.get(String(ref))?.userId)
        .filter(Boolean),
      isActive: node.isActive !== false,
    };
  });

  const referencedPermissionIds = new Set(
    roles.flatMap((role) => (role.permissions || []).map(String))
  );

  const snapshot = {
    tenantId,
    generatedAt: new Date().toISOString(),
    users: users.map((user) => ({
      userId: user.userId || String(user._id),
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      status: user.status === true,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isOwner: user.isOwner,
      isSuper: user.isSuper,
      isAdmin: user.isAdmin,
      onboardingComplete: user.onboardingComplete,
      roleIds: (user.roles || []).map(String),
    })),
    units,
    roles: roles.map((role) => ({
      roleId: String(role._id),
      name: role.name,
      permissionIds: (role.permissions || []).map(String),
      isActive: role.isActive !== false,
    })),
    permissions: [...referencedPermissionIds]
      .map((id) => permissionById.get(id))
      .filter(Boolean)
      .map((permission) => ({
        permissionId: String(permission._id),
        name:
          permission.name ||
          [permission.action, permission.resource].filter(Boolean).join(':'),
      })),
  };

  return snapshot;
};

/**
 * Builds the derived state from a snapshot (port of buildPeopleState).
 */
const buildPeopleState = (snapshot) => {
  const unitsProvided = snapshot.units !== undefined;
  const rolesProvided = snapshot.roles !== undefined;
  const permissionsProvided = snapshot.permissions !== undefined;
  const units = snapshot.units || [];
  const roles = snapshot.roles || [];
  const permissions = snapshot.permissions || [];

  const memberships = membershipsByUser(units);
  const activeUserIds = new Set(
    snapshot.users.filter((user) => user.status).map((user) => user.userId)
  );
  const roleNameById = new Map(roles.map((role) => [role.roleId, role.name]));

  const users = snapshot.users.map((person) => {
    const memberUnits = memberships.get(person.userId) || [];
    const roleIds = person.roleIds || [];
    const flags = [];
    if (person.isEmailVerified === false) flags.push('unverified');
    if (!person.status) flags.push('inactive');
    if (roleIds.length === 0) flags.push('noRole');
    if (roleIds.length > 1) flags.push('multiRole');
    if (unitsProvided && memberUnits.length === 0)
      flags.push('noOrgAssignment');

    return {
      userId: person.userId,
      name: personNameOf(person),
      email: person.email,
      status: person.status,
      isEmailVerified: person.isEmailVerified,
      isPhoneVerified: person.isPhoneVerified,
      isOwner: person.isOwner || false,
      isSuper: person.isSuper || false,
      isAdmin: person.isAdmin || false,
      onboardingComplete: person.onboardingComplete,
      roleIds,
      roleNames: roleIds.map((roleId) => roleNameById.get(roleId) || roleId),
      memberNodeIds: memberUnits.map((unit) => unit.nodeId),
      memberNodeNames: memberUnits.map((unit) => unit.name),
      flags,
      source: `user:${person.userId}`,
    };
  });

  const unitStates = units.map((unit) => {
    const memberUserIds = unit.memberUserIds || [];
    const responsibleUserIds = unit.responsibleUserIds || [];
    const flags = [];
    if (unit.isActive === false) flags.push('inactive');
    if (memberUserIds.length === 0) flags.push('noMembers');
    if (
      unit.responsibleUserIds !== undefined &&
      !responsibleUserIds.some((id) => activeUserIds.has(id))
    ) {
      flags.push('noActiveResponsible');
    }

    return {
      nodeId: unit.nodeId,
      name: unit.name,
      parentId: unit.parentId || null,
      childIds: unit.childIds || [],
      path: unit.path,
      levelId: unit.levelId,
      levelName: unit.levelName,
      levelRank: unit.levelRank,
      structureId: unit.structureId,
      structureName: unit.structureName,
      structureType: unit.structureType,
      memberUserIds,
      activeMemberCount: memberUserIds.filter((id) => activeUserIds.has(id))
        .length,
      responsibleUserIds,
      hasResponsible: responsibleUserIds.length > 0,
      responsibilityKnown: unit.responsibleUserIds !== undefined,
      flags,
      source: `node:${unit.nodeId}`,
    };
  });

  const rolesState = roles.map((role) => ({
    roleId: role.roleId,
    name: role.name || role.roleId,
    permissionIds: role.permissionIds || [],
    userCount: snapshot.users.filter((user) =>
      (user.roleIds || []).includes(role.roleId)
    ).length,
    isActive: role.isActive !== false,
    source: `role:${role.roleId}`,
  }));

  const permissionsState = permissions.map((permission) => ({
    permissionId: permission.permissionId,
    name: permission.name,
    roleIds: roles
      .filter((role) =>
        (role.permissionIds || []).includes(permission.permissionId)
      )
      .map((role) => role.roleId),
    source: `permission:${permission.permissionId}`,
  }));

  const { policy } = snapshot;

  return {
    tenantId: snapshot.tenantId,
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    users,
    units: unitStates,
    roles: rolesState,
    permissions: permissionsState,
    policy,
    derived: {
      userCount: users.length,
      activeUserCount: users.filter((user) => user.status).length,
      inactiveUserCount: users.filter((user) => !user.status).length,
      unverifiedUserCount: users.filter((user) =>
        user.flags.includes('unverified')
      ).length,
      usersWithoutRole: users.filter((user) => user.flags.includes('noRole'))
        .length,
      usersWithoutOrgAssignment: users.filter((user) =>
        user.flags.includes('noOrgAssignment')
      ).length,
      unitCount: unitStates.length,
      unitsWithoutResponsible: unitStates.filter((unit) => !unit.hasResponsible)
        .length,
      roleCount: rolesState.length,
      permissionCount: permissionsState.length,
    },
    sources: {
      users: 'user:*',
      ...(unitsProvided ? { units: 'node:*' } : {}),
      ...(rolesProvided ? { roles: 'role:*' } : {}),
      ...(permissionsProvided ? { permissions: 'permission:*' } : {}),
      ...(policy ? { policy: 'tenant:policy' } : {}),
    },
  };
};

const selectPeopleState = (state, selector = {}) => {
  const { userId, nodeId, roleId } = selector;
  if (userId === undefined && nodeId === undefined && roleId === undefined) {
    return state;
  }

  const users = state.users.filter(
    (person) =>
      (userId === undefined || person.userId === userId) &&
      (nodeId === undefined || person.memberNodeIds.includes(nodeId)) &&
      (roleId === undefined || person.roleIds.includes(roleId))
  );
  const selectedUserIds = new Set(users.map((person) => person.userId));
  const selectedRoleIds = new Set([
    ...(roleId === undefined ? [] : [roleId]),
    ...users.flatMap((person) => person.roleIds),
  ]);

  const units = state.units.filter(
    (unit) =>
      unit.nodeId === nodeId ||
      unit.memberUserIds.some((memberId) => selectedUserIds.has(memberId))
  );
  const roles = state.roles.filter((role) => selectedRoleIds.has(role.roleId));
  const selectedPermissionIds = new Set(
    roles.flatMap((role) => role.permissionIds)
  );
  const permissions = state.permissions.filter((permission) =>
    selectedPermissionIds.has(permission.permissionId)
  );

  return {
    ...state,
    users,
    units,
    roles,
    permissions,
    derived: {
      ...state.derived,
      userCount: users.length,
      roleCount: roles.length,
      permissionCount: permissions.length,
      unitCount: units.length,
    },
  };
};

const dataQuality = (state) =>
  state.users.flatMap((user) => {
    const evidence = [];
    if (user.flags.includes('noRole')) {
      evidence.push({ source: user.source, detail: 'no role assigned' });
    }
    if (user.flags.includes('noOrgAssignment')) {
      evidence.push({
        source: user.source,
        detail: 'no organizational unit membership',
      });
    }
    if (user.flags.includes('unverified')) {
      evidence.push({ source: user.source, detail: 'email not verified' });
    }
    if (evidence.length === 0) return [];

    const requiresAttention =
      user.flags.includes('noRole') || user.flags.includes('noOrgAssignment');
    return [
      {
        ruleId: 'data_quality',
        severity: requiresAttention ? 'warning' : 'info',
        subject: { kind: 'USER', id: user.userId },
        summary: `Incomplete organizational data for ${user.name}`,
        evidence,
      },
    ];
  });

const lifecycleProblem = (state) =>
  state.users.flatMap((user) => {
    if (user.status) return [];
    if (user.roleIds.length === 0 && user.memberNodeIds.length === 0) return [];
    return [
      {
        ruleId: 'lifecycle_problem',
        severity: 'critical',
        subject: { kind: 'USER', id: user.userId },
        summary: `${user.name} is inactive but still holds access`,
        evidence: [
          { source: user.source, detail: 'status inactive' },
          ...user.roleIds.map((roleId) => ({
            source: `role:${roleId}`,
            detail: 'role retained',
          })),
          ...user.memberNodeIds.map((nodeId) => ({
            source: `node:${nodeId}`,
            detail: 'membership retained',
          })),
        ],
      },
    ];
  });

const membersOf = (state, unit) =>
  state.users.filter(
    (user) => user.status && user.memberNodeIds.includes(unit.nodeId)
  );

const orgGap = (state) =>
  state.units.flatMap((unit) => {
    if (unit.flags.includes('inactive')) return [];
    const members = membersOf(state, unit);
    if (members.length === 0) return [];
    if (members.some((member) => member.isAdmin || member.isOwner)) return [];
    return [
      {
        ruleId: 'org_gap',
        severity: 'warning',
        subject: { kind: 'NODE', id: unit.nodeId },
        summary: `${unit.name} has active members but no active admin or owner`,
        evidence: [
          {
            source: unit.source,
            detail: `${members.length} active member(s), none admin/owner`,
          },
          ...members.map((member) => ({
            source: member.source,
            detail: 'active member, not admin/owner',
          })),
        ],
      },
    ];
  });

const missingResponsibility = (state) => {
  const activeUserIds = new Set(
    state.users.filter((user) => user.status).map((user) => user.userId)
  );
  return state.units.flatMap((unit) => {
    if (unit.flags.includes('inactive')) return [];
    if (!unit.responsibilityKnown) return [];
    const members = membersOf(state, unit);
    if (members.length === 0) return [];
    if (unit.responsibleUserIds.some((id) => activeUserIds.has(id))) return [];
    return [
      {
        ruleId: 'missing_responsibility',
        severity: 'warning',
        subject: { kind: 'NODE', id: unit.nodeId },
        summary: `${unit.name} has no active responsible user`,
        evidence: [
          {
            source: unit.source,
            detail:
              unit.responsibleUserIds.length === 0
                ? 'no responsible user designated'
                : 'designated responsible user is not active',
          },
          ...members.map((member) => ({
            source: member.source,
            detail: 'active member',
          })),
        ],
      },
    ];
  });
};

const identityDuplicate = (state) => {
  const byEmail = new Map();
  state.users.forEach((user) => {
    const key = String(user.email || '')
      .trim()
      .toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) || []), user]);
  });

  return [...byEmail.entries()].flatMap(([email, users]) => {
    if (users.length < 2) return [];
    return [
      {
        ruleId: 'identity_duplicate',
        severity: 'warning',
        subject: { kind: 'USER', id: users[0].userId },
        summary: `${users.length} accounts share the email ${email}`,
        evidence: users.map((user) => ({
          source: user.source,
          detail: `account email ${user.email}`,
        })),
      },
    ];
  });
};

const roleAssignmentMismatch = (state) => {
  const { roleUnit: expected } = state.policy || {};
  if (!expected) return [];

  const structureTypeByNodeId = new Map(
    state.units
      .filter((unit) => unit.structureType !== undefined)
      .map((unit) => [unit.nodeId, unit.structureType])
  );

  return state.users.flatMap((user) => {
    const mismatched = user.roleIds.flatMap((roleId) => {
      const entry = expected.find((candidate) => candidate.roleId === roleId);
      if (!entry) return [];
      const evidence = [];

      if (
        entry.expectedStructureTypes !== undefined &&
        user.memberNodeIds.length > 0
      ) {
        const { expectedStructureTypes } = entry;
        const structureTypes = user.memberNodeIds.map((nodeId) =>
          structureTypeByNodeId.get(nodeId)
        );
        const inside =
          expectedStructureTypes.length > 0 &&
          structureTypes.some(
            (type) =>
              type !== undefined && expectedStructureTypes.includes(type)
          );
        if (!inside) {
          evidence.push({
            source: `policy:${roleId}`,
            detail: `expected structure types [${expectedStructureTypes.join(
              ', '
            )}], got [${structureTypes
              .filter((type) => type !== undefined)
              .join(', ')}]`,
          });
        }
      }

      if (
        entry.maxUnits !== undefined &&
        user.memberNodeIds.length > entry.maxUnits
      ) {
        evidence.push({
          source: `policy:${roleId}`,
          detail: `holds ${user.memberNodeIds.length} units, capped at ${entry.maxUnits}`,
        });
      }

      if (evidence.length === 0) return [];
      return [{ roleId, evidence }];
    });

    return mismatched.map(({ roleId, evidence }) => ({
      ruleId: 'role_assignment_mismatch',
      severity: 'warning',
      subject: { kind: 'USER', id: user.userId },
      summary: `${user.name} assigned against the ${roleId} policy`,
      evidence,
    }));
  });
};

const accessAnomaly = (state) => {
  const { permissionBreadth: expected } = state.policy || {};
  if (!expected) return [];

  return state.roles.flatMap((role) => {
    const entry = expected.find(
      (candidate) => candidate.roleId === role.roleId
    );
    if (!entry || !entry.expectedPermissionIds) return [];

    const expectedIds = new Set(entry.expectedPermissionIds);
    const extraIds = role.permissionIds.filter(
      (permissionId) => !expectedIds.has(permissionId)
    );
    if (extraIds.length === 0) return [];

    const permissionNameById = new Map(
      state.permissions.map((permission) => [
        permission.permissionId,
        permission.name,
      ])
    );
    return [
      {
        ruleId: 'access_anomaly',
        severity: 'warning',
        subject: { kind: 'ROLE', id: role.roleId },
        summary: `Role ${role.name} grants ${extraIds.length} permission(s) beyond its policy`,
        evidence: [
          {
            source: `policy:${role.roleId}`,
            detail: `expected [${entry.expectedPermissionIds.join(', ')}]`,
          },
          ...extraIds.map((permissionId) => ({
            source: `permission:${permissionId}`,
            detail: `granted but not in policy: ${
              permissionNameById.get(permissionId) || permissionId
            }`,
          })),
        ],
      },
    ];
  });
};

const detectObservations = (state, options = {}) =>
  [
    ...dataQuality(state),
    ...lifecycleProblem(state),
    ...orgGap(state),
    ...missingResponsibility(state),
    ...identityDuplicate(state),
    ...roleAssignmentMismatch(state),
    ...accessAnomaly(state),
  ]
    .filter(
      (observation) =>
        options.ruleId === undefined || observation.ruleId === options.ruleId
    )
    .filter(
      (observation) =>
        options.userId === undefined ||
        observation.subject.id === options.userId
    )
    .filter(
      (observation) =>
        options.nodeId === undefined ||
        observation.subject.id === options.nodeId
    );

/**
 * Returns the tenant-scoped derived People state, optionally narrowed to a
 * user, node, or role.
 */
const getPeopleState = async ({ tenantId, userId, nodeId, roleId } = {}) => {
  const snapshot = await getPeopleSnapshot({ tenantId });
  const state = buildPeopleState(snapshot);
  return selectPeopleState(state, { userId, nodeId, roleId });
};

/**
 * Runs the deterministic detection rules and returns observations with
 * evidence, plus the rules deliberately not implemented.
 */
const deferredDetectionRules = (policy) =>
  DEFERRED_DETECTION_RULES.filter(
    (rule) =>
      (rule.ruleId === 'role_assignment_mismatch' &&
        (policy || {}).roleUnit === undefined) ||
      (rule.ruleId === 'access_anomaly' &&
        (policy || {}).permissionBreadth === undefined) ||
      (rule.ruleId !== 'role_assignment_mismatch' &&
        rule.ruleId !== 'access_anomaly')
  );

const observePeople = async ({
  tenantId,
  ruleId,
  userId,
  nodeId,
  policy,
} = {}) => {
  const snapshot = await getPeopleSnapshot({ tenantId });
  const state = buildPeopleState(policy ? { ...snapshot, policy } : snapshot);
  return {
    observations: detectObservations(state, { ruleId, userId, nodeId }),
    deferred: deferredDetectionRules(state.policy),
    derived: state.derived,
  };
};

/**
 * Persists an observation or decision as an audited agent task + step. No
 * business mutation occurs; this only records traceability.
 */
const recordPeopleEvent = async ({
  tenantId,
  requestedByUserId = null,
  kind,
  summary,
  ruleId = null,
  subject = null,
  evidence = [],
  suggestedCapability = null,
  responseClass = null,
  rationale = null,
  verification = null,
} = {}) => {
  if (!tenantId) {
    const error = new Error('tenantId is required');
    error.statusCode = 400;
    throw error;
  }
  if (kind !== 'observation' && kind !== 'decision') {
    const error = new Error('kind must be observation or decision');
    error.statusCode = 400;
    throw error;
  }
  if (!summary) {
    const error = new Error('summary is required');
    error.statusCode = 400;
    throw error;
  }

  const task = await agentTaskService.createTask({
    tenantId,
    requestedByUserId,
    source: 'copilot_api',
    workflowName: 'people_intelligence',
    intent: 'people.observation',
    goalText: summary,
    status: 'completed',
    riskLevel: 'LOW',
    contextJson: {
      kind,
      ruleId,
      subject,
      evidence,
      suggestedCapability,
      responseClass,
      rationale,
      verification,
    },
  });

  const step = await agentTaskService.createTaskStep({
    taskId: task.id,
    tenantId,
    stepIndex: 0,
    title: kind,
    status: 'completed',
    toolName: 'people.event.record',
    inputJson: { kind, ruleId, subject },
    outputJson: { responseClass, verification },
  });
  await agentTaskService.setCurrentTaskStep({
    taskId: task.id,
    stepId: step.id,
  });

  return {
    taskId: task.id,
    stepId: step.id,
    durableTarget: { taskType: 'people.observation', stepType: kind },
  };
};

module.exports = {
  DEFERRED_DETECTION_RULES,
  deferredDetectionRules,
  getPeopleSnapshot,
  buildPeopleState,
  selectPeopleState,
  detectObservations,
  getPeopleState,
  observePeople,
  recordPeopleEvent,
};
