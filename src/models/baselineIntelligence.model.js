const mongoose = require('mongoose');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

/**
 * Baseline Intelligence Model
 * Stores computed analytics for nodes and networks
 * Supports both node-level and network-level metrics
 */
const baselineIntelligenceSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    
    nodeId: {
      type: String,
      index: true,
      default: null, // null for network-level baselines
    },
    
    type: {
      type: String,
      enum: ['node', 'network'],
      required: true,
      index: true,
    },
    
    metrics: {
      // User demographics and composition
      users: {
        total: { type: Number, default: 0 },
        active: { type: Number, default: 0 },
        inactive: { type: Number, default: 0 },
        
        verification: {
          email: { type: Number, default: 0 },
          phone: { type: Number, default: 0 },
          emailRate: { type: Number, default: 0 }, // percentage
          phoneRate: { type: Number, default: 0 }, // percentage
        },
        
        demographics: {
          gender: {
            male: { type: Number, default: 0 },
            female: { type: Number, default: 0 },
            other: { type: Number, default: 0 },
            unknown: { type: Number, default: 0 },
          },
          
          ageGroups: {
            'under18': { type: Number, default: 0 },
            '19to30': { type: Number, default: 0 },
            '31to45': { type: Number, default: 0 },
            '46to60': { type: Number, default: 0 },
            'over60': { type: Number, default: 0 },
            'unknown': { type: Number, default: 0 },
          },
          
          maritalStatus: {
            single: { type: Number, default: 0 },
            married: { type: Number, default: 0 },
            divorced: { type: Number, default: 0 },
            widowed: { type: Number, default: 0 },
            unknown: { type: Number, default: 0 },
          },
          
          averageAge: { type: Number, default: 0 },
        },
        
        hierarchy: {
          owners: { type: Number, default: 0 },
          supers: { type: Number, default: 0 },
          ordinary: { type: Number, default: 0 },
          sabyUsers: { type: Number, default: 0 },
        },
        
        roles: [
          {
            roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
            roleName: String,
            count: { type: Number, default: 0 },
          }
        ],
        
        geography: [
          {
            state: String,
            lga: String,
            count: { type: Number, default: 0 },
          }
        ],
        
        professional: [
          {
            category: String,
            occupation: String,
            count: { type: Number, default: 0 },
          }
        ],
      },
      
      // Node facility information (only for node-level baselines)
      facility: {
        propertyStatus: String, // Owned, Rented, Leased, Other
        facilityStatus: String, // Active, Inactive, Under Construction
        buildingType: String,
        estimatedValue: Number,
        establishmentAge: Number, // years since dateOfEstablishment
        
        location: {
          city: String,
          state: String,
          country: String,
          postalCode: String,
        },
        
        hierarchy: {
          level: String,
          depth: Number,
          parentCount: Number,
          childCount: Number,
        },
      },
      
      // Network-level aggregations (only for network-level baselines)
      network: {
        totalNodes: { type: Number, default: 0 },
        activeNodes: { type: Number, default: 0 },
        inactiveNodes: { type: Number, default: 0 },
        
        nodesByType: [
          {
            structureType: String,
            levelName: String,
            count: { type: Number, default: 0 },
          }
        ],
        
        nodesByProperty: {
          owned: { type: Number, default: 0 },
          rented: { type: Number, default: 0 },
          leased: { type: Number, default: 0 },
          other: { type: Number, default: 0 },
        },
        
        nodesByFacility: {
          active: { type: Number, default: 0 },
          inactive: { type: Number, default: 0 },
          underConstruction: { type: Number, default: 0 },
        },
        
        regionalDistribution: [
          {
            region: String,
            state: String,
            country: String,
            nodes: { type: Number, default: 0 },
            users: { type: Number, default: 0 },
          }
        ],
        
        hierarchyStats: {
          maxDepth: { type: Number, default: 0 },
          averageDepth: { type: Number, default: 0 },
          totalLevels: { type: Number, default: 0 },
        },
        
        establishmentStats: {
          averageAge: { type: Number, default: 0 },
          oldestNode: { type: Number, default: 0 },
          newestNode: { type: Number, default: 0 },
        },
      },
      
      // Custom fields analytics (tenant-specific)
      customFields: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      
      // Enhanced custom field analytics
      customAnalytics: {
        // Numeric field analytics
        numeric: [
          {
            fieldName: String,           // e.g., "averageAttendance"
            displayName: String,         // e.g., "Average Attendance"
            fieldType: String,           // "number", "currency", "percentage"
            statistics: {
              total: Number,             // Sum of all values
              average: Number,           // Mean value
              median: Number,            // Median value
              min: Number,               // Minimum value
              max: Number,               // Maximum value
              count: Number,             // Number of records with this field
              standardDeviation: Number  // Standard deviation
            },
            distribution: [             // Value distribution
              {
                range: String,          // e.g., "0-100", "101-200"
                count: Number,          // Number of records in this range
                percentage: Number      // Percentage of total
              }
            ]
          }
        ],
        
        // Categorical field analytics
        categorical: [
          {
            fieldName: String,          // e.g., "riskLevel"
            displayName: String,        // e.g., "Risk Level"
            values: [
              {
                value: String,          // e.g., "High", "Medium", "Low"
                count: Number,          // Number of records with this value
                percentage: Number      // Percentage of total
              }
            ],
            mostCommon: String,         // Most frequent value
            diversity: Number           // Number of unique values
          }
        ],
        
        // Date field analytics
        temporal: [
          {
            fieldName: String,          // e.g., "lastVisit"
            displayName: String,        // e.g., "Last Visit Date"
            statistics: {
              earliest: Date,           // Earliest date
              latest: Date,             // Latest date
              averageAge: Number,       // Average days from now
              count: Number             // Number of records with dates
            },
            patterns: [
              {
                period: String,         // "daily", "weekly", "monthly"
                trend: String,          // "increasing", "decreasing", "stable"
                seasonality: Boolean    // Whether seasonal patterns exist
              }
            ]
          }
        ],
        
        // Boolean field analytics
        boolean: [
          {
            fieldName: String,          // e.g., "isVip"
            displayName: String,        // e.g., "VIP Status"
            trueCount: Number,          // Number of true values
            falseCount: Number,         // Number of false values
            truePercentage: Number,     // Percentage of true values
            nullCount: Number           // Number of null/undefined values
          }
        ]
      },
    },
    
    // Generated insights
    insights: [
      {
        type: {
          type: String,
          enum: ['demographic', 'geographic', 'facility', 'operational', 'custom'],
          required: true,
        },
        category: String, // subcategory for grouping
        text: { type: String, required: true },
        priority: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical'],
          default: 'medium',
        },
        dataPoints: [String], // supporting data references
        recommendations: [String], // actionable suggestions
        createdAt: { type: Date, default: Date.now },
      }
    ],
    
    // Computation metadata
    lastComputed: { type: Date, default: Date.now },
    computedBy: { type: String, default: 'system' }, // 'system' or userId
    computationDuration: { type: Number, default: 0 }, // milliseconds
    version: { type: Number, default: 1 }, // for schema evolution
    
    // Data freshness tracking
    sourceDataHash: String, // hash of source data for change detection
    dependsOn: [String], // list of nodeIds this baseline depends on
  },
  {
    timestamps: true,
  }
);

// Add plugins
baselineIntelligenceSchema.plugin(toJSON);
baselineIntelligenceSchema.plugin(paginate);
baselineIntelligenceSchema.plugin(tenantPlugin);

// Indexes for performance
baselineIntelligenceSchema.index({ tenantId: 1, type: 1 });
baselineIntelligenceSchema.index({ tenantId: 1, nodeId: 1 }, { unique: true, sparse: true });
baselineIntelligenceSchema.index({ tenantId: 1, type: 1, lastComputed: -1 });
baselineIntelligenceSchema.index({ 'insights.priority': 1, 'insights.type': 1 });

/**
 * Get baseline by node
 * @param {string} tenantId 
 * @param {string} nodeId 
 * @returns {Promise<BaselineIntelligence>}
 */
baselineIntelligenceSchema.statics.getNodeBaseline = async function(tenantId, nodeId) {
  return this.findOne({ tenantId, nodeId, type: 'node' });
};

/**
 * Get network baseline
 * @param {string} tenantId 
 * @returns {Promise<BaselineIntelligence>}
 */
baselineIntelligenceSchema.statics.getNetworkBaseline = async function(tenantId) {
  return this.findOne({ tenantId, type: 'network', nodeId: null });
};

/**
 * Upsert baseline data
 * @param {string} tenantId 
 * @param {string} nodeId - null for network baseline
 * @param {string} type - 'node' or 'network'
 * @param {Object} metrics 
 * @param {Array} insights 
 * @param {Object} metadata 
 * @returns {Promise<BaselineIntelligence>}
 */
baselineIntelligenceSchema.statics.upsertBaseline = async function(
  tenantId, 
  nodeId, 
  type, 
  metrics, 
  insights = [], 
  metadata = {}
) {
  const filter = { tenantId, type };
  if (nodeId) filter.nodeId = nodeId;
  
  const update = {
    metrics,
    insights,
    lastComputed: new Date(),
    computedBy: metadata.computedBy || 'system',
    computationDuration: metadata.duration || 0,
    sourceDataHash: metadata.sourceDataHash,
    dependsOn: metadata.dependsOn || [],
    $inc: { version: 1 },
  };
  
  return this.findOneAndUpdate(filter, update, { 
    upsert: true, 
    new: true,
    setDefaultsOnInsert: true 
  });
};

/**
 * Get stale baselines that need recomputation
 * @param {string} tenantId 
 * @param {number} maxAgeMinutes 
 * @returns {Promise<BaselineIntelligence[]>}
 */
baselineIntelligenceSchema.statics.getStaleBaselines = async function(tenantId, maxAgeMinutes = 60) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  return this.find({ 
    tenantId, 
    lastComputed: { $lt: cutoff } 
  });
};

/**
 * Delete baselines for a node
 * @param {string} tenantId 
 * @param {string} nodeId 
 * @returns {Promise<Object>}
 */
baselineIntelligenceSchema.statics.deleteNodeBaselines = async function(tenantId, nodeId) {
  return this.deleteMany({ tenantId, nodeId });
};

/**
 * Get insights by priority and type
 * @param {string} tenantId 
 * @param {string} nodeId - optional, null for network insights
 * @param {string} priority - optional filter
 * @param {string} type - optional filter
 * @returns {Promise<Array>}
 */
baselineIntelligenceSchema.statics.getInsights = async function(
  tenantId, 
  nodeId = null, 
  priority = null, 
  type = null
) {
  const filter = { tenantId };
  if (nodeId) filter.nodeId = nodeId;
  else filter.nodeId = null; // network insights
  
  const pipeline = [
    { $match: filter },
    { $unwind: '$insights' },
  ];
  
  if (priority) {
    pipeline.push({ $match: { 'insights.priority': priority } });
  }
  
  if (type) {
    pipeline.push({ $match: { 'insights.type': type } });
  }
  
  pipeline.push(
    { $sort: { 'insights.priority': -1, 'insights.createdAt': -1 } },
    { $replaceRoot: { newRoot: '$insights' } }
  );
  
  return this.aggregate(pipeline);
};

/**
 * @typedef BaselineIntelligence
 */
const BaselineIntelligence = mongoose.model('BaselineIntelligence', baselineIntelligenceSchema);

module.exports = BaselineIntelligence;
