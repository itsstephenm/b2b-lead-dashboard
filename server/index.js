require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

// ── App setup ─────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Database connection pool ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'B2B Lead Capture API is running.' });
});

// POST /api/leads  – Insert a new lead
app.post('/api/leads', async (req, res) => {
  const { full_name, company, email, phone } = req.body;

  if (!full_name || !email) {
    return res.status(400).json({ error: 'full_name and email are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leads (full_name, company, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [full_name, company || null, email, phone || null]
    );
    res.status(201).json({ success: true, lead: result.rows[0] });
  } catch (err) {
    console.error('POST /api/leads error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/leads  – Fetch all leads (newest first)
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM leads ORDER BY created_at DESC'
    );
    res.json({ success: true, leads: result.rows });
  } catch (err) {
    console.error('GET /api/leads error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
