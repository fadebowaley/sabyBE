const { Nodes, Structures, Level, User } = require('../models');

/**
 * Saby Structure Intelligence Service
 *
 * Provides tenant-scoped derived Structure state, tree traversal,
 * deterministic defect detection, and pre-flight mutation simulation.
 *
 * Implements the canonical Structure State Projection and guarantees
 * source tagging and zero hallucinations.
 */

const DEFAULT_MAX_SPAN_OF_CONTROL = 20;
const DEFAULT_MAX_RECOMMENDED_DEPTH = 8;

/**
 * Builds the derived Structure state from a raw snapshot.
 * Pure function: deterministic, safe against cycles, and fast.
 */
const buildStructureState = (snapshot) => {
  const maxSpan = snapshot.maxSpanOfControl || DEFAULT_MAX_SPAN_OF_CONTROL;
  const maxDepthThreshold = snapshot.maxRecommendedDepth || DEFAULT_MAX_RECOMMENDED_DEPTH;

  const rawNodes = snapshot.nodes || [];
  const rawStructures = snapshot.structures || [];
  const rawLevels = snapshot.levels || [];
  const rawUsers = snapshot.users || [];

  const nodeInputById = new Map();
  rawNodes.forEach((node) => nodeInputById.set(node.nodeId, node));

  const structureById = new Map();
  rawStructures.forEach((s) => structureById.set(s.structureId, s));

  const levelById = new Map();
  rawLevels.forEach((l) => levelById.set(l.levelId, l));

  const activeUserIds = new Set(
    rawUsers
      .filter((user) => user.status !== false)
      .map((user) => user.userId)
  );

  // 1. Establish parent-child mappings
  const childrenMap = new Map();
  rawNodes.forEach((node) => childrenMap.set(node.nodeId, []));

  const parentMap = new Map();
  rawNodes.forEach((node) => {
    const parentId = node.parentId && String(node.parentId).trim() !== '' ? String(node.parentId) : null;
    parentMap.set(node.nodeId, parentId);

    if (parentId && nodeInputById.has(parentId)) {
      const existing = childrenMap.get(parentId) || [];
      if (!existing.includes(node.nodeId)) {
        existing.push(node.nodeId);
      }
      childrenMap.set(parentId, existing);
    }
  });

  // 2. Cycle detection (DFS with color marking: 0=UNVISITED, 1=VISITING, 2=VISITED)
  const cycleNodes = new Set();
  const visitedState = new Map();

  const detectCycles = (currentId, path) => {
    visitedState.set(currentId, 1);
    path.push(currentId);

    const children = childrenMap.get(currentId) || [];
    for (const childId of children) {
      const state = visitedState.get(childId) || 0;
      if (state === 1) {
        const cycleStartIndex = path.indexOf(childId);
        if (cycleStartIndex !== -1) {
          for (let i = cycleStartIndex; i < path.length; i++) {
            cycleNodes.add(path[i]);
          }
          cycleNodes.add(childId);
        }
      } else if (state === 0) {
        detectCycles(childId, path);
      }
    }

    path.pop();
    visitedState.set(currentId, 2);
  };

  rawNodes.forEach((node) => {
    let curr = node.nodeId;
    const seen = new Set();
    while (curr) {
      if (seen.has(curr)) {
        cycleNodes.add(curr);
        cycleNodes.add(node.nodeId);
        break;
      }
      seen.add(curr);
      curr = parentMap.get(curr);
    }
  });

  rawNodes.forEach((node) => {
    if ((visitedState.get(node.nodeId) || 0) === 0) {
      detectCycles(node.nodeId, []);
    }
  });

  // 3. Roots and orphans
  const roots = [];
  const orphanNodes = new Set();

  rawNodes.forEach((node) => {
    const pId = parentMap.get(node.nodeId);
    if (!pId) {
      roots.push(node.nodeId);
    } else if (!nodeInputById.has(pId)) {
      orphanNodes.add(node.nodeId);
    }
  });

  // 4. Depths and paths
  const depthMap = {};
  const pathMap = new Map();
  const pathNamesMap = new Map();

  const assignDepthAndPath = (nodeId, currentDepth, currentPath, currentPathNames) => {
    depthMap[nodeId] = currentDepth;
    const newPath = [...currentPath, nodeId];
    const nodeInput = nodeInputById.get(nodeId);
    const newPathNames = [...currentPathNames, nodeInput ? nodeInput.name : nodeId];

    pathMap.set(nodeId, newPath);
    pathNamesMap.set(nodeId, newPathNames);

    const children = childrenMap.get(nodeId) || [];
    for (const childId of children) {
      if (!newPath.includes(childId)) {
        assignDepthAndPath(childId, currentDepth + 1, newPath, newPathNames);
      }
    }
  };

  roots.forEach((rootId) => {
    if (!cycleNodes.has(rootId)) {
      assignDepthAndPath(rootId, 0, [], []);
    }
  });

  orphanNodes.forEach((orphanId) => {
    if (depthMap[orphanId] === undefined && !cycleNodes.has(orphanId)) {
      assignDepthAndPath(orphanId, 0, [], []);
    }
  });

  rawNodes.forEach((node) => {
    if (depthMap[node.nodeId] === undefined) {
      depthMap[node.nodeId] = 0;
      pathMap.set(node.nodeId, [node.nodeId]);
      pathNamesMap.set(node.nodeId, [node.name]);
    }
  });

  // 5. Descendant metrics
  const subtreeSizes = {};
  const memberCounts = {};
  const responsibleCounts = {};

  const descendantNodesMap = new Map();
  const descendantUsersMap = new Map();
  const descendantResponsibleMap = new Map();

  const collectDescendants = (nodeId, visited) => {
    if (descendantNodesMap.has(nodeId)) {
      return {
        allDescendantNodeIds: descendantNodesMap.get(nodeId),
        allMemberUserIds: descendantUsersMap.get(nodeId),
        allResponsibleUserIds: descendantResponsibleMap.get(nodeId),
      };
    }

    const nodeInput = nodeInputById.get(nodeId);
    const directMembers = new Set(nodeInput?.memberUserIds || []);
    const directResponsible = new Set(nodeInput?.responsibleUserIds || []);

    const allDescendantNodes = new Set();
    const allMembers = new Set(directMembers);
    const allResponsible = new Set(directResponsible);

    visited.add(nodeId);

    const children = childrenMap.get(nodeId) || [];
    for (const childId of children) {
      if (!visited.has(childId) && !cycleNodes.has(childId)) {
        allDescendantNodes.add(childId);
        const childDescendants = collectDescendants(childId, new Set(visited));
        childDescendants.allDescendantNodeIds.forEach((id) => allDescendantNodes.add(id));
        childDescendants.allMemberUserIds.forEach((id) => allMembers.add(id));
        childDescendants.allResponsibleUserIds.forEach((id) => allResponsible.add(id));
      }
    }

    descendantNodesMap.set(nodeId, allDescendantNodes);
    descendantUsersMap.set(nodeId, allMembers);
    descendantResponsibleMap.set(nodeId, allResponsible);

    return {
      allDescendantNodeIds: allDescendantNodes,
      allMemberUserIds: allMembers,
      allResponsibleUserIds: allResponsible,
    };
  };

  rawNodes.forEach((node) => {
    const res = collectDescendants(node.nodeId, new Set());
    const directMemberCount = (node.memberUserIds || []).length;
    const directResponsibleCount = (node.responsibleUserIds || []).length;

    subtreeSizes[node.nodeId] = res.allDescendantNodeIds.size;
    memberCounts[node.nodeId] = {
      direct: directMemberCount,
      totalDescendant: res.allMemberUserIds.size,
    };
    responsibleCounts[node.nodeId] = {
      direct: directResponsibleCount,
      totalDescendant: res.allResponsibleUserIds.size,
    };
  });

  // 6. Build Node States & Detect Defect Flags
  const nodesRecord = {};
  let rankInversionCount = 0;
  let emptyNodesCount = 0;
  let noResponsibleCount = 0;

  rawNodes.forEach((node) => {
    const pId = parentMap.get(node.nodeId);
    const parentNode = pId ? nodeInputById.get(pId) : null;
    const children = childrenMap.get(node.nodeId) || [];
    const memberUserIds = node.memberUserIds || [];
    const responsibleUserIds = node.responsibleUserIds || [];
    const depth = depthMap[node.nodeId] !== undefined ? depthMap[node.nodeId] : 0;
    const flags = [];

    const level = node.levelId ? levelById.get(node.levelId) : null;
    const structure = node.structureId ? structureById.get(node.structureId) : null;

    const levelRank = node.levelRank !== undefined ? node.levelRank : level?.rank ?? null;
    const levelName = node.levelName || level?.name || null;
    const structureName = node.structureName || structure?.name || null;
    const structureType = node.structureType || structure?.type || null;

    const isActive = node.isActive !== false;

    if (cycleNodes.has(node.nodeId)) flags.push('cycle');
    if (orphanNodes.has(node.nodeId)) flags.push('orphan');
    if (!isActive) flags.push('inactive');
    if (isActive && parentNode && parentNode.isActive === false) flags.push('inactiveParent');

    // Rank Inversion
    if (parentNode) {
      const parentLevel = parentNode.levelId ? levelById.get(parentNode.levelId) : null;
      const parentRank = parentNode.levelRank !== undefined ? parentNode.levelRank : parentLevel?.rank ?? null;
      const isCurrentSpecial = level?.isSpecial === true;
      const isParentSpecial = parentLevel?.isSpecial === true;

      if (
        !isCurrentSpecial &&
        !isParentSpecial &&
        parentRank !== null &&
        levelRank !== null &&
        parentRank >= levelRank
      ) {
        flags.push('rankInversion');
        rankInversionCount++;
      }
    }

    if (parentNode && parentNode.structureId && node.structureId && parentNode.structureId !== node.structureId) {
      flags.push('structureMismatch');
    }

    if (children.length === 0 && memberUserIds.length === 0) {
      flags.push('empty');
      emptyNodesCount++;
    }

    const hasActiveResponsible =
      rawUsers.length > 0
        ? responsibleUserIds.some((uid) => activeUserIds.has(uid))
        : responsibleUserIds.length > 0;

    if (memberUserIds.length > 0 && !hasActiveResponsible) {
      flags.push('noResponsible');
      noResponsibleCount++;
    }

    if (children.length > maxSpan) flags.push('excessiveSpan');
    if (depth > maxDepthThreshold) flags.push('deepHierarchy');

    nodesRecord[node.nodeId] = {
      nodeId: node.nodeId,
      mongoId: node.mongoId,
      name: node.name,
      parentId: pId,
      childIds: children,
      structureId: node.structureId || null,
      structureName,
      structureType,
      levelId: node.levelId || null,
      levelName,
      levelRank,
      isActive,
      memberUserIds,
      directMemberCount: memberUserIds.length,
      responsibleUserIds,
      hasResponsible: responsibleUserIds.length > 0,
      flags,
      depth,
      path: pathMap.get(node.nodeId) || [node.nodeId],
      pathNames: pathNamesMap.get(node.nodeId) || [node.name],
      subtreeSize: subtreeSizes[node.nodeId] || 0,
      totalMemberCount: memberCounts[node.nodeId]?.totalDescendant || memberUserIds.length,
      totalResponsibleCount: responsibleCounts[node.nodeId]?.totalDescendant || responsibleUserIds.length,
      source: node.source || `node:${node.nodeId}`,
    };
  });

  // 7. Structures & Levels State
  const structuresRecord = {};
  rawStructures.forEach((s) => {
    const nodeCount = rawNodes.filter((n) => String(n.structureId) === String(s.structureId)).length;
    structuresRecord[s.structureId] = {
      structureId: s.structureId,
      name: s.name,
      description: s.description || '',
      type: s.type || 'organizational',
      isActive: s.isActive !== false,
      nodeCount,
      source: s.source || `structure:${s.structureId}`,
    };
  });

  const levelsRecord = {};
  rawLevels.forEach((l) => {
    const nodeCount = rawNodes.filter((n) => String(n.levelId) === String(l.levelId)).length;
    levelsRecord[l.levelId] = {
      levelId: l.levelId,
      name: l.name,
      rank: typeof l.rank === 'number' ? l.rank : 0,
      structureId: l.structureId || null,
      isSpecial: l.isSpecial === true,
      specialType: l.specialType || null,
      nodeCount,
      source: l.source || `level:${l.levelId}`,
    };
  });

  // 8. Derived Metrics
  const nodeValues = Object.values(nodesRecord);
  const activeNodes = nodeValues.filter((n) => n.isActive).length;
  const totalDepths = Object.values(depthMap);
  const maxDepth = totalDepths.length > 0 ? Math.max(...totalDepths) : 0;

  const internalNodes = nodeValues.filter((n) => n.childIds.length > 0);
  const avgBranchingFactor =
    internalNodes.length > 0
      ? Number((internalNodes.reduce((acc, curr) => acc + curr.childIds.length, 0) / internalNodes.length).toFixed(2))
      : 0;

  const derived = {
    totalNodes: rawNodes.length,
    activeNodes,
    inactiveNodes: rawNodes.length - activeNodes,
    rootNodesCount: roots.length,
    maxDepth,
    avgBranchingFactor,
    orphanNodesCount: orphanNodes.size,
    emptyNodesCount,
    nodesWithoutResponsible: noResponsibleCount,
    nodesWithCycles: cycleNodes.size,
    nodesWithRankInversion: rankInversionCount,
    totalStructures: rawStructures.length,
    totalLevels: rawLevels.length,
  };

  return {
    tenantId: snapshot.tenantId,
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    nodes: nodesRecord,
    structures: structuresRecord,
    levels: levelsRecord,
    roots,
    depthMap,
    subtreeSizes,
    memberCounts,
    responsibleCounts,
    derived,
    sources: {
      nodes: 'node:*',
      ...(rawStructures.length > 0 ? { structures: 'structure:*' } : {}),
      ...(rawLevels.length > 0 ? { levels: 'level:*' } : {}),
      ...(rawUsers.length > 0 ? { users: 'user:*' } : {}),
    },
  };
};

/**
 * Narrows state to a slice based on selectors.
 */
const selectStructureState = (state, selector = {}) => {
  const { nodeId, rootNodeId, structureId, levelId, maxDepth } = selector;

  if (!nodeId && !rootNodeId && !structureId && !levelId && maxDepth === undefined) {
    return state;
  }

  const selectedNodeIds = new Set();

  const collectSubtree = (currId, currentRelDepth) => {
    selectedNodeIds.add(currId);
    if (maxDepth !== undefined && currentRelDepth >= maxDepth) return;

    const node = state.nodes[currId];
    if (node) {
      node.childIds.forEach((childId) => collectSubtree(childId, currentRelDepth + 1));
    }
  };

  if (rootNodeId && state.nodes[rootNodeId]) {
    collectSubtree(rootNodeId, 0);
  } else if (nodeId && state.nodes[nodeId]) {
    selectedNodeIds.add(nodeId);
    const node = state.nodes[nodeId];
    node.path.forEach((pId) => selectedNodeIds.add(pId));
  } else {
    Object.values(state.nodes).forEach((n) => {
      let keep = true;
      if (structureId && n.structureId !== structureId) keep = false;
      if (levelId && n.levelId !== levelId) keep = false;
      if (maxDepth !== undefined && n.depth > maxDepth) keep = false;
      if (keep) {
        selectedNodeIds.add(n.nodeId);
      }
    });
  }

  const filteredNodes = {};
  selectedNodeIds.forEach((id) => {
    if (state.nodes[id]) {
      filteredNodes[id] = state.nodes[id];
    }
  });

  return {
    ...state,
    nodes: filteredNodes,
    roots: state.roots.filter((r) => selectedNodeIds.has(r)),
  };
};

/**
 * Fetches MongoDB snapshot for the tenant.
 */
const getStructureSnapshot = async ({ tenantId }) => {
  if (!tenantId) {
    const error = new Error('tenantId is required');
    error.statusCode = 400;
    throw error;
  }

  const [rawNodes, rawStructures, rawLevels, rawUsers] = await Promise.all([
    Nodes.find({ tenantId, deletedAt: null })
      .select('nodeId name parent users level structure isActive')
      .populate('level', 'name rank isSpecial specialType')
      .populate('structure', 'name description type isActive')
      .lean(),
    Structures.find({ tenantId }).select('name description type isActive').lean(),
    Level.find({ tenantId, deletedAt: null }).select('name description rank isSpecial specialType').lean(),
    User.find({ tenantId }).select('userId firstname lastname email status isOwner isSuper isAdmin').lean(),
  ]);

  const userByObjectId = new Map(rawUsers.map((u) => [String(u._id), u]));
  const nodeByObjectId = new Map(rawNodes.map((n) => [String(n._id), n]));
  const nodeIdByObjectId = new Map(rawNodes.map((n) => [String(n._id), n.nodeId || String(n._id)]));

  const nodes = rawNodes.map((node) => {
    const levelRef = node.level;
    const structureRef = node.structure;
    const pId = node.parent ? nodeIdByObjectId.get(String(node.parent)) : null;

    const childIds = rawNodes
      .filter((candidate) => String(candidate.parent || '') === String(node._id))
      .map((candidate) => nodeIdByObjectId.get(String(candidate._id)))
      .filter(Boolean);

    const memberUserIds = (node.users || [])
      .map((ref) => userByObjectId.get(String(ref))?.userId)
      .filter(Boolean);

    return {
      nodeId: node.nodeId || String(node._id),
      mongoId: String(node._id),
      name: node.name || node.nodeId || String(node._id),
      parentId: pId || null,
      childIds,
      levelId: levelRef ? String(levelRef._id || levelRef) : null,
      levelName: levelRef?.name || null,
      levelRank: typeof levelRef?.rank === 'number' ? levelRef.rank : null,
      structureId: structureRef ? String(structureRef._id || structureRef) : null,
      structureName: structureRef?.name || null,
      structureType: structureRef?.type || null,
      isActive: node.isActive !== false,
      memberUserIds,
      responsibleUserIds: memberUserIds.length > 0 ? [memberUserIds[0]] : [], // fallback leader
      source: `node:${node.nodeId || node._id}`,
    };
  });

  const structures = rawStructures.map((s) => ({
    structureId: String(s._id),
    name: s.name,
    description: s.description || '',
    type: s.type || 'organizational',
    isActive: s.isActive !== false,
    source: `structure:${s._id}`,
  }));

  const levels = rawLevels.map((l) => ({
    levelId: String(l._id),
    name: l.name,
    rank: typeof l.rank === 'number' ? l.rank : 0,
    isSpecial: l.isSpecial === true,
    specialType: l.specialType || null,
    source: `level:${l._id}`,
  }));

  const users = rawUsers.map((u) => ({
    userId: u.userId || String(u._id),
    name: [u.firstname, u.lastname].filter(Boolean).join(' ') || u.email || u.userId,
    status: u.status !== false,
    email: u.email,
  }));

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    nodes,
    structures,
    levels,
    users,
  };
};

/**
 * Returns derived Structure state for a tenant with optional selector narrowing.
 */
const getStructureState = async ({ tenantId, nodeId, rootNodeId, structureId, levelId, maxDepth } = {}) => {
  const snapshot = await getStructureSnapshot({ tenantId });
  const state = buildStructureState(snapshot);
  return selectStructureState(state, { nodeId, rootNodeId, structureId, levelId, maxDepth });
};

/**
 * Returns tree view rooted at a specific node or roots.
 */
const getNodeSubtree = async ({ tenantId, nodeId, maxDepth } = {}) => {
  const snapshot = await getStructureSnapshot({ tenantId });
  const fullState = buildStructureState(snapshot);

  const targetId = nodeId || fullState.roots[0];
  if (!targetId || !fullState.nodes[targetId]) {
    return {
      rootNode: null,
      tree: null,
      subtreeSize: 0,
      totalMemberCount: 0,
      warnings: ['Specified node does not exist'],
    };
  }

  const rootNode = fullState.nodes[targetId];

  // Build recursive tree node representation
  const buildSubtreeJson = (currId, currentDepth) => {
    const node = fullState.nodes[currId];
    if (!node) return null;

    if (maxDepth !== undefined && currentDepth >= maxDepth) {
      return {
        nodeId: node.nodeId,
        name: node.name,
        levelName: node.levelName,
        childCount: node.childIds.length,
        hasMoreChildren: node.childIds.length > 0,
      };
    }

    return {
      nodeId: node.nodeId,
      name: node.name,
      levelName: node.levelName,
      levelRank: node.levelRank,
      depth: node.depth,
      flags: node.flags,
      directMemberCount: node.directMemberCount,
      totalMemberCount: node.totalMemberCount,
      subtreeSize: node.subtreeSize,
      children: node.childIds
        .map((childId) => buildSubtreeJson(childId, currentDepth + 1))
        .filter(Boolean),
    };
  };

  const tree = buildSubtreeJson(targetId, 0);

  return {
    rootNode,
    tree,
    depth: fullState.depthMap[targetId],
    subtreeSize: fullState.subtreeSizes[targetId] || 0,
    memberCounts: fullState.memberCounts[targetId] || { direct: 0, totalDescendant: 0 },
    warnings: rootNode.flags,
  };
};

/**
 * Returns structural metrics and defect counts for a tenant.
 */
const getStructureMetrics = async ({ tenantId }) => {
  const snapshot = await getStructureSnapshot({ tenantId });
  const state = buildStructureState(snapshot);

  const defectiveNodes = Object.values(state.nodes)
    .filter((n) => n.flags.length > 0)
    .map((n) => ({
      nodeId: n.nodeId,
      name: n.name,
      flags: n.flags,
      depth: n.depth,
      levelName: n.levelName,
    }));

  return {
    metrics: state.derived,
    healthScore: Math.max(
      0,
      100 -
        state.derived.nodesWithCycles * 25 -
        state.derived.orphanNodesCount * 15 -
        state.derived.nodesWithRankInversion * 10 -
        state.derived.nodesWithoutResponsible * 5
    ),
    defectiveNodesCount: defectiveNodes.length,
    defectiveNodes,
  };
};

/**
 * Simulates a structural mutation without writing to the database.
 * Evaluates impact, cycle introduction, orphan creation, and risk classification.
 */
const simulateStructuralMutation = async ({ tenantId, action, params = {} }) => {
  const snapshot = await getStructureSnapshot({ tenantId });
  const stateBefore = buildStructureState(snapshot);

  const { nodeId, newParentId, newLevelId, newStructureId } = params;

  if (!nodeId || !stateBefore.nodes[nodeId]) {
    return {
      allowed: false,
      riskLevel: 'CRITICAL',
      breakingErrors: [`Target node '${nodeId}' not found in tenant structure`],
      warnings: [],
      affectedNodesCount: 0,
      affectedMembersCount: 0,
    };
  }

  const targetNode = stateBefore.nodes[nodeId];
  const breakingErrors = [];
  const warnings = [];

  // Deep clone snapshot for in-memory mutation simulation
  const simulatedSnapshot = {
    ...snapshot,
    nodes: snapshot.nodes.map((n) => ({ ...n })),
  };

  const simulatedNode = simulatedSnapshot.nodes.find((n) => n.nodeId === nodeId);

  if (action === 'MOVE_NODE') {
    if (newParentId === nodeId) {
      breakingErrors.push(`Cannot set node '${nodeId}' as its own parent (direct self-cycle)`);
    } else if (newParentId && !stateBefore.nodes[newParentId]) {
      breakingErrors.push(`Target parent node '${newParentId}' does not exist`);
    } else {
      // Check if newParentId is already a descendant of nodeId (cycle check)
      const targetSubtreeNodeIds = new Set();
      const gatherChildren = (id) => {
        const node = stateBefore.nodes[id];
        if (node) {
          node.childIds.forEach((cId) => {
            targetSubtreeNodeIds.add(cId);
            gatherChildren(cId);
          });
        }
      };
      gatherChildren(nodeId);

      if (newParentId && targetSubtreeNodeIds.has(newParentId)) {
        breakingErrors.push(
          `Cannot move node '${nodeId}' under '${newParentId}' because '${newParentId}' is a descendant of '${nodeId}' (introduces cycle)`
        );
      }

      if (simulatedNode) {
        simulatedNode.parentId = newParentId || null;
      }
    }
  } else if (action === 'DELETE_NODE') {
    if (targetNode.childIds.length > 0) {
      warnings.push(
        `Node '${nodeId}' has ${targetNode.childIds.length} direct children. Deleting it will orphan these children unless reparented.`
      );
    }
    if (targetNode.totalMemberCount > 0) {
      warnings.push(
        `Node '${nodeId}' has ${targetNode.totalMemberCount} descendant members who will lose their organizational unit association.`
      );
    }
    // Simulate deletion by filtering node out
    simulatedSnapshot.nodes = simulatedSnapshot.nodes.filter((n) => n.nodeId !== nodeId);
  } else if (action === 'ASSIGN_LEVEL') {
    if (newLevelId && !snapshot.levels.some((l) => l.levelId === newLevelId)) {
      breakingErrors.push(`Target level '${newLevelId}' does not exist`);
    } else if (simulatedNode) {
      simulatedNode.levelId = newLevelId;
      const targetLevel = snapshot.levels.find((l) => l.levelId === newLevelId);
      simulatedNode.levelRank = targetLevel ? targetLevel.rank : null;
      simulatedNode.levelName = targetLevel ? targetLevel.name : null;
    }
  } else if (action === 'ASSIGN_STRUCTURE') {
    if (newStructureId && !snapshot.structures.some((s) => s.structureId === newStructureId)) {
      breakingErrors.push(`Target structure '${newStructureId}' does not exist`);
    } else if (simulatedNode) {
      simulatedNode.structureId = newStructureId;
    }
  } else {
    breakingErrors.push(`Unknown simulation action '${action}'`);
  }

  // Run simulation state
  const stateAfter = buildStructureState(simulatedSnapshot);

  // Check differences
  const cycleIntroduced = stateAfter.derived.nodesWithCycles > stateBefore.derived.nodesWithCycles;
  const orphanCreated = stateAfter.derived.orphanNodesCount > stateBefore.derived.orphanNodesCount;
  const rankInversionCreated = stateAfter.derived.nodesWithRankInversion > stateBefore.derived.nodesWithRankInversion;

  if (cycleIntroduced) {
    breakingErrors.push('Simulation detected that this mutation introduces circular hierarchy cycles');
  }
  if (orphanCreated) {
    warnings.push(`Simulation detected that ${stateAfter.derived.orphanNodesCount - stateBefore.derived.orphanNodesCount} nodes became orphaned`);
  }
  if (rankInversionCreated) {
    warnings.push('Simulation detected that a rank inversion is created (parent rank >= child rank)');
  }

  const affectedMembersCount = targetNode.totalMemberCount;
  const affectedNodesCount = targetNode.subtreeSize + 1;

  // Determine Risk Level
  let riskLevel = 'LOW';
  if (breakingErrors.length > 0 || cycleIntroduced) {
    riskLevel = 'CRITICAL';
  } else if (action === 'DELETE_NODE' || affectedMembersCount > 50 || rankInversionCreated) {
    riskLevel = 'HIGH';
  } else if (affectedMembersCount > 0 || affectedNodesCount > 1) {
    riskLevel = 'MEDIUM';
  }

  return {
    allowed: breakingErrors.length === 0,
    riskLevel,
    breakingErrors,
    warnings,
    action,
    targetNodeId: nodeId,
    targetNodeName: targetNode.name,
    impact: {
      affectedNodesCount,
      affectedMembersCount,
      previousParentId: targetNode.parentId,
      newParentId: params.newParentId || null,
      previousLevel: targetNode.levelName,
      newLevel: params.newLevelId ? stateAfter.levels[params.newLevelId]?.name : targetNode.levelName,
    },
    simulation: {
      cycleIntroduced,
      orphanCreated,
      rankInversionCreated,
      before: {
        totalNodes: stateBefore.derived.totalNodes,
        maxDepth: stateBefore.derived.maxDepth,
        orphans: stateBefore.derived.orphanNodesCount,
        cycles: stateBefore.derived.nodesWithCycles,
      },
      after: {
        totalNodes: stateAfter.derived.totalNodes,
        maxDepth: stateAfter.derived.maxDepth,
        orphans: stateAfter.derived.orphanNodesCount,
        cycles: stateAfter.derived.nodesWithCycles,
      },
    },
  };
};

module.exports = {
  buildStructureState,
  selectStructureState,
  getStructureSnapshot,
  getStructureState,
  getNodeSubtree,
  getStructureMetrics,
  simulateStructuralMutation,
};
