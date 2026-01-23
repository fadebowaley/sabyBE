const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

/**
 * PostgreSQL Service
 * Example service showing how to use PostgreSQL connection
 */
class PostgresService {
  /**
   * Execute a query with parameters
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, params = []) {
    try {
      const client = await postgresPool.connect();
      const result = await client.query(query, params);
      client.release();
      return result;
    } catch (error) {
      logger.error('PostgreSQL query error:', error);
      throw error;
    }
  }

  /**
   * Get database information
   * @returns {Promise<Object>} Database info
   */
  async getDatabaseInfo() {
    try {
      const result = await this.executeQuery(
        'SELECT version(), current_database(), current_user'
      );
      return {
        version: result.rows[0].version,
        database: result.rows[0].current_database,
        user: result.rows[0].current_user,
      };
    } catch (error) {
      logger.error('Error getting database info:', error);
      throw error;
    }
  }

  /**
   * Create a table if it doesn't exist (example)
   * @param {string} tableName - Name of the table
   * @param {string} schema - Table schema
   * @returns {Promise<boolean>} Success status
   */
  async createTableIfNotExists(tableName, schema) {
    try {
      const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`;
      await this.executeQuery(query);
      logger.info(`Table ${tableName} created or already exists`);
      return true;
    } catch (error) {
      logger.error(`Error creating table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Insert data into a table
   * @param {string} tableName - Name of the table
   * @param {Object} data - Data to insert
   * @returns {Promise<Object>} Insert result
   */
  async insertData(tableName, data) {
    try {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns
        .map((_, index) => `$${index + 1}`)
        .join(', ');

      const query = `INSERT INTO ${tableName} (${columns.join(
        ', '
      )}) VALUES (${placeholders}) RETURNING *`;
      const result = await this.executeQuery(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error inserting data into ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get data from a table
   * @param {string} tableName - Name of the table
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<Array>} Query results
   */
  async getData(tableName, conditions = {}) {
    try {
      let query = `SELECT * FROM ${tableName}`;
      const values = [];
      let paramIndex = 1;

      if (Object.keys(conditions).length > 0) {
        const whereClauses = [];
        for (const [key, value] of Object.entries(conditions)) {
          whereClauses.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      const result = await this.executeQuery(query, values);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting data from ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update data in a table
   * @param {string} tableName - Name of the table
   * @param {Object} data - Data to update
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<Object>} Update result
   */
  async updateData(tableName, data, conditions) {
    try {
      const setClauses = [];
      const whereClauses = [];
      const values = [];
      let paramIndex = 1;

      // Build SET clause
      for (const [key, value] of Object.entries(data)) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      // Build WHERE clause
      for (const [key, value] of Object.entries(conditions)) {
        whereClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      const query = `UPDATE ${tableName} SET ${setClauses.join(
        ', '
      )} WHERE ${whereClauses.join(' AND ')} RETURNING *`;
      const result = await this.executeQuery(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating data in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Delete data from a table
   * @param {string} tableName - Name of the table
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<number>} Number of deleted rows
   */
  async deleteData(tableName, conditions) {
    try {
      const whereClauses = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(conditions)) {
        whereClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      const query = `DELETE FROM ${tableName} WHERE ${whereClauses.join(
        ' AND '
      )} RETURNING *`;
      const result = await this.executeQuery(query, values);
      return result.rowCount;
    } catch (error) {
      logger.error(`Error deleting data from ${tableName}:`, error);
      throw error;
    }
  }
}

module.exports = new PostgresService();
