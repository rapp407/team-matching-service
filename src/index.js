const appName = "team-matching-service";
const { query, closePool } = require('./db');
const config = require('./config/database');

async function main() {
  console.log(`${appName} is running.`);
  console.log(`Environment: ${config.app.env}`);
  console.log(`Server port: ${config.app.port}`);

  // Test database connection
  try {
    console.log('\n[DB] Testing connection...');
    const result = await query('SELECT NOW() as current_time');
    console.log('[DB] ✓ Connection successful');
    console.log('[DB] Server time:', result.rows[0].current_time);
  } catch (error) {
    console.error('[DB] ✗ Connection failed:', error.message);
    process.exit(1);
  }

  console.log('\nApplication ready for development.\n');
  // Start HTTP server (Express app)
  const app = require('./app');
  const server = app.listen(config.app.port, () => {
    console.log(`HTTP server listening on http://localhost:${config.app.port}`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    server.close(() => console.log('HTTP server closed'));
    await closePool();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
