const mongoose = require('mongoose');

/**
 * Counter Schema for generating sequential IDs
 * Used for creating readable form references like #SB-000001
 */
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // counter name (e.g., 'formReference')
  seq: { type: Number, default: 0 },      // current sequence number
  prefix: { type: String, default: 'SB'}, // prefix for the reference
  digits: { type: Number, default: 6 },   // number of digits to pad
});

/**
 * Get next sequence number for a counter
 * @param {string} counterName - Name of the counter
 * @returns {Promise<number>}
 */
CounterSchema.statics.getNextSequence = async function (counterName) {
  const counter = await this.findByIdAndUpdate(
    counterName,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter.seq;
};

/**
 * Generate a formatted reference
 * @param {string} counterName - Name of the counter
 * @returns {Promise<string>} Formatted reference (e.g., #SB-000001)
 */
CounterSchema.statics.generateReference = async function (counterName) {
  const seq = await this.getNextSequence(counterName);
  const counter = await this.findById(counterName);
  
  const prefix = counter?.prefix || 'SB';
  const digits = counter?.digits || 6;
  const paddedNumber = String(seq).padStart(digits, '0');
  
  return `#${prefix}-${paddedNumber}`;
};

const Counter = mongoose.model('Counter', CounterSchema);

module.exports = Counter;


