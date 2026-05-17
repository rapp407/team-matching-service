const express = require('express');
const auth = require('./middleware/auth');
const poolRoutes = require('./routes/poolRoutes');
const teamRoutes = require('./routes/teamRoutes');
const { respondToInvite } = require('./services/teamService');
const recommendationRoutes = require('./routes/recommendationRoutes');
const internalRoutes = require('./routes/internalRoutes');
const profileRoutes = require('./routes/profileRoutes');

const app = express();
app.use(express.json());

// Public health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Protected example route
app.get('/me', auth, (req, res) => {
  // `req.user` is populated by auth middleware
  res.json({ user: req.user });
});

// Direct invite response route to ensure endpoint #6 is always mounted
app.put('/invites/:id/respond', auth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') {
      return res.status(403).json({ error: 'forbidden', detail: 'Only student can perform this action' });
    }

    const { id } = req.params;
    const { response } = req.body;
    const { student_id } = req.user;

    if (!response) {
      return res.status(400).json({ error: 'missing_required_fields', required: ['response'] });
    }

    const normalizedResponse = String(response).toLowerCase();
    if (!['accepted', 'rejected'].includes(normalizedResponse)) {
      return res.status(400).json({ error: 'invalid_response', detail: 'response harus accepted atau rejected' });
    }

    const invite = await respondToInvite({
      inviteId: id,
      respondentStudentId: student_id,
      response: normalizedResponse,
    });

    return res.status(200).json({ data: invite });
  } catch (err) {
    if (err.message === 'invite_not_found') {
      return res.status(err.status || 404).json({ error: 'invite_not_found', detail: err.detail });
    }
    if (err.message === 'team_not_found') {
      return res.status(err.status || 404).json({ error: 'team_not_found', detail: err.detail });
    }
    if (err.message === 'forbidden') {
      return res.status(err.status || 403).json({ error: 'forbidden', detail: err.detail });
    }
    if (err.message === 'invalid_invite_status') {
      return res.status(err.status || 400).json({ error: 'invalid_invite_status', detail: err.detail });
    }
    if (err.message === 'invitee_not_found') {
      return res.status(err.status || 404).json({ error: 'invitee_not_found', detail: err.detail });
    }
    if (err.message === 'invitee_not_available') {
      return res.status(err.status || 400).json({ error: 'invitee_not_available', detail: err.detail });
    }
    if (err.message === 'already_member') {
      return res.status(err.status || 409).json({ error: 'already_member', detail: err.detail });
    }
    if (err.message === 'invalid_response') {
      return res.status(err.status || 400).json({ error: 'invalid_response', detail: err.detail });
    }
    console.error('[APP] PUT /invites/:id/respond error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Pool routes
app.use(poolRoutes);

// Team routes
app.use(teamRoutes);

// Recommendation routes
app.use(recommendationRoutes);

// Internal routes
app.use(internalRoutes);

// Profile routes
app.use(profileRoutes);

module.exports = app;
