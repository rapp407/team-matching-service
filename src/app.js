const express = require('express');
const auth = require('./middleware/auth');
const poolRoutes = require('./routes/poolRoutes');

const app = express();
app.use(express.json());

// Public health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Protected example route
app.get('/me', auth, (req, res) => {
  // `req.user` is populated by auth middleware
  res.json({ user: req.user });
});

// Pool routes
app.use(poolRoutes);

module.exports = app;
