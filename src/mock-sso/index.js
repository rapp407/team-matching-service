const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.MOCK_SSO_PORT || 3001;

// Simple token -> user mapping for development
const tokens = {
  'valid-student-1': { student_id: 's1001', role: 'student', student_name: 'Student One' },
  'valid-po-1': { student_id: 's2001', role: 'student', student_name: 'PO One' },
  'valid-admin-1': { student_id: 'admin1', role: 'student', student_name: 'Administrator' },
};

app.get('/auth', (req, res) => {
  const auth = req.get('authorization') || '';
  const m = auth.match(/Bearer\s+(.+)/i);
  if (!m) {
    return res.status(401).json({ error: 'missing_token' });
  }

  const token = m[1].trim();
  const user = tokens[token];
  if (!user) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  // Return basic user info that middleware will consume
  return res.json({ student_id: user.student_id, role: user.role, student_name: user.student_name });
});

app.get('/', (req, res) => res.send('Mock SSO running'));

app.listen(port, () => {
  console.log(`Mock SSO listening on http://localhost:${port}`);
});
