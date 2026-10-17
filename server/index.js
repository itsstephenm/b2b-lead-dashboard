require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
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

// ── Authentication middleware ─────────────────────────────────────────────────

/**
 * verifyToken
 * Extracts and validates the Bearer JWT from the Authorization header.
 * Attaches the decoded payload to `req.user` on success.
 *
 *   401 – no token supplied
 *   403 – token present but invalid or expired
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token      = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token has expired. Please sign in again.'
      : 'Invalid token.';
    return res.status(403).json({ success: false, message });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'B2B Lead Capture API is running.' });
});

// POST /api/auth/login  – Authenticate admin and issue a JWT
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  // Validate against environment-configured admin credentials
  const emailMatch    = email    === process.env.ADMIN_EMAIL;
  const passwordMatch = password === process.env.ADMIN_PASSWORD;

  if (!emailMatch || !passwordMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  // Sign a 24-hour JWT containing the admin's email as the subject
  const token = jwt.sign(
    { sub: email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({ success: true, token });
});

// POST /api/leads  – Insert a new lead (public – no auth required)
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

// GET /api/leads  – Fetch all leads (newest first) [protected]
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
