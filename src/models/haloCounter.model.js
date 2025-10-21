const mongoose = require('mongoose');

// Schema for general halo counter
const haloCounterSchema = new mongoose.Schema({
  name: { type: String, default: 'halo' },
  seq: { type: Number, default: 0 },
});

// Schema for halo node counter
const haloNCounterSchema = new mongoose.Schema({
  name: { type: String, default: 'haloNode' },
  seq: { type: Number, default: 0 },
});

// Create models with OverwriteModelError protection
const HaloCounter =
  mongoose.models.HaloCounter ||
  mongoose.model('HaloCounter', haloCounterSchema, 'halo_counters');
const HaloNCounter =
  mongoose.models.HaloNCounter ||
  mongoose.model('HaloNCounter', haloNCounterSchema, 'halo_counters');

// Export both models
module.exports = {
  HaloCounter,
  HaloNCounter,
};
