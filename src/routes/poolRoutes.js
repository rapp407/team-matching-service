const express = require('express');
const auth = require('../middleware/auth');
const { joinPool, getPoolList, withdrawFromPool } = require('../services/poolService');

const router = express.Router();

/**
 * POST /pool
 * Join pool dengan validasi duplikasi dan kewajiban mengisi skills
 */
router.post('/pool', auth, async (req, res) => {
  try {
    // 1. TAMBAHKAN 'skills' DI DALAM DESTRUCTURING INI
    const { program_studi, sdg_topics, availability, notes, period, skills } = req.body; 
    const { student_id, student_name } = req.user;

    // 2. VALIDASI WAJIB (Termasuk skills)
    if (!program_studi || !period || !skills || !Array.isArray(skills) || skills.length === 0) {
      return res.status(400).json({ 
        error: 'missing_required_fields', 
        required: ['program_studi', 'period', 'skills'] 
      });
    }

    const poolEntry = await joinPool(student_id, student_name, program_studi, {
      sdg_topics,
      availability,
      notes,
      period,
      skills // 3. Sekarang skills sudah terdefinisi dan siap dikirim ke service
    });

    return res.status(201).json({ data: poolEntry });
  } catch (err) {
    if (err.message === 'duplicate_entry') {
      return res.status(err.status || 409).json({ error: 'duplicate_entry', detail: err.detail });
    }
    console.error('[POOL] POST /pool error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /pool
 * List pool dengan pagination dan filter
 * Query: period, program_studi, sdg_topic, status, page, limit, skill
 */
router.get('/pool', auth, async (req, res) => {
  try {
    const { period = '2024-1', program_studi, sdg_topic, status = 'waiting', page = 1, limit = 10, skill = null } = req.query;

    const result = await getPoolList({
      period,
      program_studi: program_studi || null,
      sdg_topic: sdg_topic ? parseInt(sdg_topic, 10) : null,
      status,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      skill: skill || null,
    });

    return res.json(result);
  } catch (err) {
    console.error('[POOL] GET /pool error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * DELETE /pool/me
 * Keluar pool (withdraw) - validasi belum in_team
 * Query: period (wajib)
 */
router.delete('/pool/me', auth, async (req, res) => {
  try {
    const { period } = req.query;
    const { student_id } = req.user;

    if (!period) {
      return res.status(400).json({ error: 'missing_required_fields', required: ['period'] });
    }

    const result = await withdrawFromPool(student_id, period);
    return res.json({ data: result });
  } catch (err) {
    if (err.message === 'not_found') {
      return res.status(err.status || 404).json({ error: 'not_found', detail: err.detail });
    }
    if (err.message === 'invalid_status') {
      return res.status(err.status || 400).json({ error: 'invalid_status', detail: err.detail });
    }
    console.error('[POOL] DELETE /pool/me error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }

});

module.exports = router;
