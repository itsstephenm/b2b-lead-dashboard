require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Database connection pool ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Auth Middleware ────────────────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'B2B Lead Capture API is running.' });
});

// POST /api/leads  – Insert a new lead (Unprotected for public capture widget)
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

// POST /api/auth/login – Admin Login Endpoint (Unprotected)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  // Check against environment variables
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    // Create a token valid for 24 hours
    const token = jwt.sign({ email: email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return res.json({ success: true, token });
  }

  return res.status(401).json({ success: false, message: 'Invalid email or password' });
});

// GET /api/leads  – Fetch all leads (Protected with verifyToken)
app.get('/api/leads', verifyToken, async (req, res) => {
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