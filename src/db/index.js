const { Pool } = require('pg');
const config = require('../config/database');

// Create pool with config
const pool = new Pool(config.database);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test connection
pool.on('connect', () => {
  console.log('Database connection pool initialized');
});

/**
 * Execute a single query
 * @param {string} query - SQL query string
 * @param {array} values - Query parameters
 * @returns {Promise} Query result
 */
async function query(text, values = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, values);
    const duration = Date.now() - start;
    console.log('[DB] Executed query', { duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('[DB ERROR]', error);
    throw error;
  }
}

/**
 * Get a client from the pool for transaction
 * @returns {Promise} Client instance
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Close pool connection (for graceful shutdown)
 */
async function closePool() {
  await pool.end();
  console.log('Database connection pool closed');
}

module.exports = {
  pool,
  query,
  getClient,
  closePool,
};
