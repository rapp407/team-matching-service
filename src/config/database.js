require('dotenv').config();

module.exports = {
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USER || 'admin',
    password: process.env.DATABASE_PASSWORD || 'secret123',
    database: process.env.DATABASE_NAME || 'mydb',
    // Connection URL alternative
    // url: process.env.DATABASE_URL
  },
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
  },
  mockSSO: {
    url: process.env.MOCK_SSO_URL || 'http://localhost:3001/auth',
    secret: process.env.MOCK_SSO_SECRET || 'your-secret-key-here',
  },
};
