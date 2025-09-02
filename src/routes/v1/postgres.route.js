const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const postgresService = require('../../services/postgres.service');
const catchAsync = require('../../utils/catchAsync');

const router = express.Router();

/**
 * @route   GET /v1/postgres/status
 * @desc    Get PostgreSQL connection status and database info
 * @access  Public
 */
router.get(
  '/status',
  catchAsync(async (req, res) => {
    try {
      const dbInfo = await postgresService.getDatabaseInfo();
      res.status(200).json({
        success: true,
        message: 'PostgreSQL connection is working',
        data: {
          status: 'connected',
          database: dbInfo.database,
          user: dbInfo.user,
          version: dbInfo.version,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'PostgreSQL connection failed',
        error: error.message,
      });
    }
  })
);

/**
 * @route   POST /v1/postgres/test-table
 * @desc    Create a test table and insert sample data
 * @access  Private
 */
router.post(
  '/test-table',
  auth(),
  catchAsync(async (req, res) => {
    try {
      // Create a test table
      const tableSchema = `
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `;

      await postgresService.createTableIfNotExists('test_users', tableSchema);

      // Insert sample data
      const sampleData = {
        name: 'Test User',
        email: 'test@example.com',
      };

      const insertedData = await postgresService.insertData('test_users', sampleData);

      res.status(201).json({
        success: true,
        message: 'Test table created and sample data inserted',
        data: insertedData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating test table',
        error: error.message,
      });
    }
  })
);

/**
 * @route   GET /v1/postgres/test-data
 * @desc    Get all data from test table
 * @access  Private
 */
router.get(
  '/test-data',
  auth(),
  catchAsync(async (req, res) => {
    try {
      const data = await postgresService.getData('test_users');

      res.status(200).json({
        success: true,
        message: 'Test data retrieved successfully',
        data: data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving test data',
        error: error.message,
      });
    }
  })
);

/**
 * @route   DELETE /v1/postgres/cleanup
 * @desc    Clean up test table
 * @access  Private
 */
router.delete(
  '/cleanup',
  auth(),
  catchAsync(async (req, res) => {
    try {
      // Drop the test table
      await postgresService.executeQuery('DROP TABLE IF EXISTS test_users');

      res.status(200).json({
        success: true,
        message: 'Test table cleaned up successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error cleaning up test table',
        error: error.message,
      });
    }
  })
);

module.exports = router;
