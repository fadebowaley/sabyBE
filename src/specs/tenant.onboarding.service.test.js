const logger = require('../config/logger');

const mockModels = {
  TenantOnboarding: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
  User: {
    findById: jest.fn(),
  },
  Level: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Structures: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Nodes: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  GlobalSettings: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
};

jest.mock('../models', () => mockModels);
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { completeOnboarding } = require('../services/tenantOnboarding.service');

describe('tenantOnboarding.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects non-owner onboarding completion', async () => {
    mockModels.User.findById.mockResolvedValue({
      _id: 'user-staff',
      tenantId: 'tenant-1',
      isOwner: false,
      isSuper: false,
      isSaby: false,
    });

    await expect(
      completeOnboarding({
        userId: 'user-staff',
        payload: {
          owner: { phoneNumber: '+2348000000000', roleTitle: 'Manager' },
          company: { name: 'Acme Ltd', timezone: 'Africa/Lagos' },
          node: { rootNodeName: 'Acme HQ', rootLevelName: 'Headquarters' },
        },
      })
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test('sanitizes onboarding payload and emits structured audit log', async () => {
    const userDoc = {
      _id: 'user-owner',
      tenantId: 'tenant-1',
      isOwner: true,
      isSuper: false,
      isSaby: false,
      email: 'owner@acme.test',
      phoneNumber: '',
      profile: {},
      customFields: {
        onboarding: {
          phoneOtp: {
            verified: true,
            phoneNumber: '+2348000000000123',
          },
        },
      },
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockModels.User.findById.mockResolvedValue(userDoc);

    mockModels.TenantOnboarding.findOne.mockReturnValue({
      lean: async () => null,
    });
    mockModels.GlobalSettings.findOne.mockReturnValue({
      lean: async () => null,
    });
    mockModels.Nodes.findOne
      .mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: async () => null,
          }),
        }),
      })
      .mockReturnValueOnce({
        sort: async () => null,
      });

    mockModels.Level.findOne.mockImplementation((query) => {
      if (query.name) return Promise.resolve(null);
      if (Object.prototype.hasOwnProperty.call(query, 'rank')) {
        return Promise.resolve(null);
      }
      return {
        sort: () => ({
          lean: async () => ({ rank: 2 }),
        }),
      };
    });
    mockModels.Level.create.mockResolvedValue({
      _id: 'level-1',
      name: 'Headquarters',
      rank: 0,
    });

    mockModels.Structures.findOne.mockResolvedValue(null);
    mockModels.Structures.create.mockResolvedValue({
      _id: 'structure-1',
    });

    const rootNodeDoc = {
      _id: 'node-root-1',
      name: 'Acme HQ',
      users: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockModels.Nodes.create.mockResolvedValue(rootNodeDoc);

    mockModels.GlobalSettings.findOneAndUpdate.mockResolvedValue({
      _id: 'settings-1',
    });
    mockModels.TenantOnboarding.findOneAndUpdate.mockResolvedValue({
      _id: 'profile-1',
      tenantId: 'tenant-1',
    });

    const result = await completeOnboarding({
      userId: 'user-owner',
      payload: {
        owner: {
          phoneNumber: ' +234 (800) 000-0000 ext 123 ',
          roleTitle: ' Lead Pastor ',
        },
        company: {
          name: ' Acme Ltd ',
          email: ' OPS@ACME.TEST ',
          phone: ' +234 805 000 1111 ',
          industry: 'Unknown Industry',
          size: '5000',
          timezone: 'Invalid/Timezone',
          country: ' Nigeria ',
          state: ' Oyo ',
          city: ' Ibadan ',
          address: ' Challenge ',
        },
        node: {
          rootNodeName: ' Acme HQ ',
          rootLevelName: ' Headquarters ',
          rootNodeAddress: ' Challenge ',
        },
      },
    });

    expect(result.completed).toBe(true);

    expect(mockModels.GlobalSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          organizationName: 'Acme Ltd',
          contactEmail: 'ops@acme.test',
          contactPhone: '+2348050001111',
          timezone: 'Africa/Lagos',
        }),
      }),
      expect.any(Object)
    );

    expect(mockModels.Level.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'Headquarters',
        rank: 0,
      })
    );

    expect(mockModels.TenantOnboarding.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          company: expect.objectContaining({
            industry: 'Other',
            size: 'unspecified',
            timezone: 'Africa/Lagos',
            email: 'ops@acme.test',
            phone: '+2348050001111',
          }),
          owner: expect.objectContaining({
            phoneNumber: '+2348000000000123',
            roleTitle: 'Lead Pastor',
          }),
        }),
      }),
      expect.any(Object)
    );

    expect(logger.info).toHaveBeenCalledWith(
      '[TenantOnboarding] onboarding_completed',
      expect.objectContaining({
        event: 'tenant_onboarding_completed',
        tenantId: 'tenant-1',
        userId: 'user-owner',
        changedFields: expect.arrayContaining(['company.name']),
      })
    );
  });

  test('handles duplicate level creation conflicts by reusing existing level', async () => {
    const userDoc = {
      _id: 'user-owner',
      tenantId: 'tenant-1',
      isOwner: true,
      isSuper: false,
      isSaby: false,
      email: 'owner@acme.test',
      phoneNumber: '',
      profile: {},
      customFields: {
        onboarding: {
          phoneOtp: {
            verified: true,
            phoneNumber: '+2348000000000',
          },
        },
      },
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockModels.User.findById.mockResolvedValue(userDoc);

    mockModels.TenantOnboarding.findOne.mockReturnValue({
      lean: async () => null,
    });
    mockModels.GlobalSettings.findOne.mockReturnValue({
      lean: async () => null,
    });
    mockModels.Nodes.findOne
      .mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: async () => null,
          }),
        }),
      })
      .mockReturnValueOnce({
        sort: async () => null,
      });

    let levelNameLookups = 0;
    let rankLookups = 0;
    mockModels.Level.findOne.mockImplementation((query) => {
      if (query.name) {
        levelNameLookups += 1;
        return Promise.resolve(null);
      }
      if (Object.prototype.hasOwnProperty.call(query, 'rank')) {
        rankLookups += 1;
        if (rankLookups >= 2) {
          return Promise.resolve({
            _id: 'level-existing',
            name: 'Headquarters',
            rank: 0,
          });
        }
        return Promise.resolve(null);
      }
      return {
        sort: () => ({
          lean: async () => ({ rank: 1 }),
        }),
      };
    });
    mockModels.Level.create.mockRejectedValueOnce({
      code: 11000,
      message: 'E11000 duplicate key error collection: levels',
    });

    mockModels.Structures.findOne.mockResolvedValue(null);
    mockModels.Structures.create.mockResolvedValue({
      _id: 'structure-1',
    });

    const rootNodeDoc = {
      _id: 'node-root-1',
      name: 'Acme HQ',
      users: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockModels.Nodes.create.mockResolvedValue(rootNodeDoc);
    mockModels.GlobalSettings.findOneAndUpdate.mockResolvedValue({
      _id: 'settings-1',
    });
    mockModels.TenantOnboarding.findOneAndUpdate.mockResolvedValue({
      _id: 'profile-1',
      tenantId: 'tenant-1',
    });

    const result = await completeOnboarding({
      userId: 'user-owner',
      payload: {
        owner: { phoneNumber: '+2348000000000', roleTitle: 'Owner' },
        company: { name: 'Acme Ltd', timezone: 'Africa/Lagos' },
        node: { rootNodeName: 'Acme HQ', rootLevelName: 'Headquarters' },
      },
    });

    expect(result.rootNode.levelName).toBe('Headquarters');
    expect(mockModels.Level.create).toHaveBeenCalledTimes(1);
  });

  test('accepts local owner phone input when OTP was verified in 234 format', async () => {
    const userDoc = {
      _id: 'user-owner',
      tenantId: 'tenant-1',
      isOwner: true,
      isSuper: false,
      isSaby: false,
      email: 'owner@acme.test',
      phoneNumber: '',
      profile: {},
      customFields: {
        onboarding: {
          phoneOtp: {
            verified: true,
            phoneNumber: '2348107771205',
          },
        },
      },
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockModels.User.findById.mockResolvedValue(userDoc);

    mockModels.TenantOnboarding.findOne.mockReturnValue({
      lean: async () => null,
    });
    mockModels.GlobalSettings.findOne.mockReturnValue({
      lean: async () => null,
    });
    mockModels.Nodes.findOne
      .mockReturnValueOnce({
        select: () => ({
          populate: () => ({
            lean: async () => null,
          }),
        }),
      })
      .mockReturnValueOnce({
        sort: async () => null,
      });

    mockModels.Level.findOne.mockImplementation((query) => {
      if (query.name) return Promise.resolve(null);
      if (Object.prototype.hasOwnProperty.call(query, 'rank')) {
        return Promise.resolve(null);
      }
      return {
        sort: () => ({
          lean: async () => ({ rank: 1 }),
        }),
      };
    });
    mockModels.Level.create.mockResolvedValue({
      _id: 'level-1',
      name: 'Headquarters',
      rank: 0,
    });

    mockModels.Structures.findOne.mockResolvedValue(null);
    mockModels.Structures.create.mockResolvedValue({
      _id: 'structure-1',
    });

    const rootNodeDoc = {
      _id: 'node-root-1',
      name: 'SABY HQ',
      users: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockModels.Nodes.create.mockResolvedValue(rootNodeDoc);
    mockModels.GlobalSettings.findOneAndUpdate.mockResolvedValue({
      _id: 'settings-1',
    });
    mockModels.TenantOnboarding.findOneAndUpdate.mockResolvedValue({
      _id: 'profile-1',
      tenantId: 'tenant-1',
    });

    await expect(
      completeOnboarding({
        userId: 'user-owner',
        payload: {
          owner: { phoneNumber: '08107771205', roleTitle: 'Administrator' },
          company: { name: 'SABY', timezone: 'Africa/Lagos' },
          node: { rootNodeName: 'SABY HQ', rootLevelName: 'Headquarters' },
        },
      })
    ).resolves.toMatchObject({ completed: true });
  });
});
