require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

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

// Ensure lead_notes table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS lead_notes (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
`).catch(err => console.error('Error ensuring lead_notes table:', err.message));

// Ensure profiles table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'Employee',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
`).catch(err => console.error('Error ensuring profiles table:', err.message));

// Ensure qualifying columns exist on leads table
pool.query(`
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS location VARCHAR(255);
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_size VARCHAR(50);
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS timeline VARCHAR(50);
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS pain_point TEXT;
`).catch(err => console.error('Error ensuring qualifying columns on leads table:', err.message));

// ── Reusable Email Transporter ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Email Auto-Responder Helper (Non-blocking) ────────────────────────────────
async function sendWelcomeEmail(clientEmail, clientName) {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`[Auto-Responder] SMTP credentials not set. Simulated welcome email to: ${clientEmail}`);
      return;
    }

    const fromAddress = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const mailOptions = {
      from: `"B2B Solutions Team" <${fromAddress}>`,
      to: clientEmail,
      subject: 'Thank You for Reaching Out – We Received Your Inquiry',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1e293b;">
          <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="margin: 0; color: #0f172a; font-size: 20px;">B2B Platform Solutions</h2>
          </div>
          <p style="font-size: 16px; line-height: 1.5; margin-bottom: 16px;">
            Hello <strong>${clientName || 'there'}</strong>,
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 16px;">
            Thank you for reaching out to us! We have received your inquiry and our team is already reviewing your details.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
            A dedicated solutions specialist will connect with you within 1 business day to discuss how our custom enterprise solutions can support your business goals.
          </p>
          <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 6px 6px 0;">
            <p style="margin: 0; font-size: 14px; color: #475569;">
              Have questions in the meantime? Feel free to reply directly to this message and our support team will assist you.
            </p>
          </div>
          <p style="font-size: 14px; color: #64748b; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            Warm regards,<br />
            <strong>The B2B Growth & Partnerships Team</strong>
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Auto-Responder] Welcome email sent to ${clientEmail}: ${info.messageId}`);
  } catch (err) {
    console.error('[Auto-Responder] Failed to send welcome email:', err.message);
  }
}

// ── Automated Lead Scoring (0-100) ────────────────────────────────────────────
function calculateLeadScore(params) {
  // Support both object params or (email, purpose) legacy call signature
  const email = (typeof params === 'object' && params !== null ? params.email : params) || '';
  const source = typeof params === 'object' && params !== null ? params.source : arguments[1];
  const timeline = typeof params === 'object' && params !== null ? params.timeline : null;
  const company_size = typeof params === 'object' && params !== null ? params.company_size : null;

  // 1. Source Score: Direct (+10), campaigns/referrals (+20)
  const leadSource = (source && String(source).trim()) || 'Direct';
  const sourceScore = leadSource.toLowerCase() !== 'direct' ? 20 : 10;

  // 2. Email Domain Check (+30 pts for corporate domain)
  let emailScore = 0;
  if (email && email.includes('@')) {
    const domain = email.split('@')[1]?.toLowerCase().trim();
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];
    if (domain && !freeProviders.includes(domain)) {
      emailScore = 30;
    }
  }

  // 3. Timeline Score: 'ASAP' (+30), '1-3 Months' (+20), 'Just Inquiring' (+10)
  let timelineScore = 0;
  if (timeline === 'ASAP') {
    timelineScore = 30;
  } else if (timeline === '1-3 Months') {
    timelineScore = 20;
  } else if (timeline === 'Just Inquiring') {
    timelineScore = 10;
  }

  // 4. Company Size Score: '1-10' (+10), '11-30' (+20), '30+' (+30)
  let companySizeScore = 0;
  if (company_size === '30+') {
    companySizeScore = 30;
  } else if (company_size === '11-30') {
    companySizeScore = 20;
  } else if (company_size === '1-10') {
    companySizeScore = 10;
  }

  return sourceScore + emailScore + timelineScore + companySizeScore;
}

// ── Auth Middleware ────────────────────────────────────────────────────────────
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });

  // Decode unverified payload to inspect token issuer/format
  const decoded = jwt.decode(token);
  if (!decoded) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }

  // Determine secret: SUPABASE_JWT_SECRET or JWT_SECRET
  // Supabase tokens often have iss / sub / aud. If SUPABASE_JWT_SECRET is set, try it first.
  const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;

  jwt.verify(token, jwtSecret, async (err, verifiedUser) => {
    let userPayload = verifiedUser;

    if (err) {
      // Fallback: If SUPABASE_JWT_SECRET was used, try JWT_SECRET, or vice versa
      if (process.env.SUPABASE_JWT_SECRET && process.env.JWT_SECRET && process.env.SUPABASE_JWT_SECRET !== process.env.JWT_SECRET) {
        try {
          userPayload = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e2) {
          return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
        }
      } else {
        return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
      }
    }

    req.user = userPayload;

    // Identify user id or email to query profiles table
    // Supabase JWT stores uuid in sub (or id); email in email
    const userId = userPayload.sub || userPayload.id;
    const userEmail = userPayload.email;

    try {
      let profileResult = null;
      if (userId) {
        profileResult = await pool.query(
          `SELECT role, status, email FROM profiles WHERE id::text = $1`,
          [String(userId)]
        );
      }

      if ((!profileResult || profileResult.rows.length === 0) && userEmail) {
        profileResult = await pool.query(
          `SELECT role, status, email, id FROM profiles WHERE LOWER(email) = LOWER($1)`,
          [userEmail]
        );
      }

      if (profileResult && profileResult.rows.length > 0) {
        const profile = profileResult.rows[0];
        // If status !== 'active', return 403 error: "Account pending Admin approval."
        if (profile.status !== 'active') {
          return res.status(403).json({ success: false, message: 'Account pending Admin approval.' });
        }
        // Attach role & status to req.user
        req.user.role = profile.role;
        req.user.status = profile.status;
        if (profile.id) req.user.profile_id = profile.id;
      } else {
        // If user is the legacy env admin
        if (userEmail && userEmail === process.env.ADMIN_EMAIL) {
          req.user.role = 'Super Admin';
          req.user.status = 'active';
        } else {
          // If no profile entry exists yet, treat as pending approval
          return res.status(403).json({ success: false, message: 'Account pending Admin approval.' });
        }
      }

      next();
    } catch (dbErr) {
      console.error('Error verifying profile status in authenticateToken:', dbErr.message);
      // If table doesn't exist or query fails, allow env admin fallback
      if (userEmail && userEmail === process.env.ADMIN_EMAIL) {
        req.user.role = 'Super Admin';
        req.user.status = 'active';
        return next();
      }
      return res.status(500).json({ success: false, message: 'Internal server error verifying account status.' });
    }
  });
}

// Backwards compatibility alias
const verifyToken = authenticateToken;

// Middleware requireAdmin: checks if req.user.role is 'Admin' or 'Super Admin'
function requireAdmin(req, res, next) {
  const role = req.user && req.user.role;
  if (role === 'Admin' || role === 'Super Admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Access denied: Admin privileges required.' });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'B2B Lead Capture API is running.' });
});

// POST /api/leads  – Insert a new lead (Unprotected for public capture widget)
app.post('/api/leads', async (req, res) => {
  const { full_name, company, email, phone, purpose, source, location, company_size, timeline, pain_point } = req.body;

  if (!full_name || !email) {
    return res.status(400).json({ error: 'full_name and email are required.' });
  }

  const leadSource = source && String(source).trim() ? String(source).trim() : 'Direct';
  const leadScore = calculateLeadScore({ email, source: leadSource, timeline, company_size });

  try {
    const result = await pool.query(
      `INSERT INTO leads (full_name, company, email, phone, purpose, source, score, location, company_size, timeline, pain_point)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        full_name,
        company || null,
        email,
        phone || null,
        purpose || null,
        leadSource,
        leadScore,
        location || null,
        company_size || null,
        timeline || null,
        pain_point || null
      ]
    );

    // Email Trigger: Non-blocking asynchronous dispatch
    sendWelcomeEmail(email, full_name).catch(err => {
      console.error('[Auto-Responder] Non-blocking dispatch error:', err.message);
    });

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

// POST /api/auth/register – Public registration endpoint to create profile in pending state
app.post('/api/auth/register', async (req, res) => {
  const { email, id } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  try {
    const existing = await pool.query(
      'SELECT id, email, role, status FROM profiles WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existing.rowCount > 0) {
      return res.json({
        success: true,
        message: 'Account profile already registered.',
        profile: existing.rows[0]
      });
    }

    const insertResult = id
      ? await pool.query(
          `INSERT INTO profiles (id, email, role, status) VALUES ($1, $2, 'Employee', 'pending') RETURNING id, email, role, status`,
          [id, email]
        )
      : await pool.query(
          `INSERT INTO profiles (email, role, status) VALUES ($1, 'Employee', 'pending') RETURNING id, email, role, status`,
          [email]
        );

    res.json({
      success: true,
      message: 'Account registered. Pending admin approval.',
      profile: insertResult.rows[0]
    });
  } catch (err) {
    console.error('POST /api/auth/register error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error creating profile.' });
  }
});

// GET /api/leads  – Fetch all leads (Protected with verifyToken)
app.get('/api/leads', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*,
        COALESCE(
          (
            SELECT json_agg(json_build_object('id', ln.id, 'note', ln.note, 'created_at', ln.created_at) ORDER BY ln.created_at DESC)
            FROM lead_notes ln
            WHERE ln.lead_id = l.id
          ),
          '[]'::json
        ) AS notes
      FROM leads l
      ORDER BY l.created_at DESC
    `);
    res.json({ success: true, leads: result.rows });
  } catch (err) {
    console.error('GET /api/leads error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/leads/:id/notes – Fetch notes for a lead (Protected)
app.get('/api/leads/:id/notes', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, note, created_at FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json({ success: true, notes: result.rows });
  } catch (err) {
    console.error('GET /api/leads/:id/notes error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// POST /api/leads/:id/notes – Add a note to a lead (Protected)
app.post('/api/leads/:id/notes', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  if (!note) {
    return res.status(400).json({ success: false, message: 'Note content is required.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO lead_notes (lead_id, note) VALUES ($1, $2) RETURNING *',
      [id, note]
    );
    res.status(201).json({ success: true, note: result.rows[0] });
  } catch (err) {
    console.error('POST /api/leads/:id/notes error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// PUT /api/leads/:leadId/notes/:noteId – Update a note (Protected)
app.put(['/api/leads/:leadId/notes/:noteId', '/api/leads/:id/notes/:noteId'], verifyToken, async (req, res) => {
  const leadId = req.params.leadId || req.params.id;
  const { noteId } = req.params;
  const { note } = req.body;

  if (!note || !String(note).trim()) {
    return res.status(400).json({ success: false, message: 'Note content is required.' });
  }

  try {
    const result = await pool.query(
      'UPDATE lead_notes SET note = $1 WHERE id = $2 AND lead_id = $3 RETURNING *',
      [String(note).trim(), noteId, leadId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    res.json({ success: true, note: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/leads/:leadId/notes/:noteId error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// DELETE /api/leads/:leadId/notes/:noteId – Delete a note (Protected)
app.delete(['/api/leads/:leadId/notes/:noteId', '/api/leads/:id/notes/:noteId'], verifyToken, async (req, res) => {
  const leadId = req.params.leadId || req.params.id;
  const { noteId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM lead_notes WHERE id = $1 AND lead_id = $2 RETURNING *',
      [noteId, leadId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Note not found.' });
    }

    res.json({ success: true, message: 'Note deleted successfully.' });
  } catch (err) {
    console.error('DELETE /api/leads/:leadId/notes/:noteId error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

app.patch('/api/leads/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required.' });
  }

  try {
    const result = await pool.query(
      'UPDATE leads SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }
    res.json({ success: true, message: 'Status updated successfully.', lead: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/leads/:id/status error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// DELETE /api/leads/:id – Delete a lead (Protected with verifyToken)
app.delete('/api/leads/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM leads WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }
    res.json({ success: true, message: 'Lead deleted successfully.', lead: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/leads/:id error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// GET /api/auth/me – Return authenticated user profile & role
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: {
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      id: req.user.sub || req.user.id || req.user.profile_id
    }
  });
});

// ── User Management Endpoints (RBAC) ──────────────────────────────────────────

// GET /api/users – Returns all users from the profiles table (Requires requireAdmin)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, role, status, created_at, updated_at FROM profiles ORDER BY created_at ASC`
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error fetching team members.' });
  }
});

// PUT /api/users/:id – Updates a user's status and role (Requires requireAdmin)
// Super Admin restriction: Only 'Super Admin' can grant or revoke 'Super Admin' or 'Admin' role.
// Standard 'Admin' can only manage 'Employee' roles.
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, role } = req.body;
  const currentAdminRole = req.user.role; // 'Admin' or 'Super Admin'

  const allowedStatuses = ['pending', 'active'];
  const allowedRoles = ['Employee', 'Admin', 'Super Admin'];

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
  }

  if (role && !allowedRoles.includes(role)) {
    return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${allowedRoles.join(', ')}` });
  }

  try {
    // 1. Fetch the target user to know their existing role
    const targetQuery = await pool.query(`SELECT id, email, role, status FROM profiles WHERE id::text = $1`, [id]);
    if (targetQuery.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    const targetUser = targetQuery.rows[0];

    // 2. Enforce Super Admin restrictions
    if (currentAdminRole !== 'Super Admin') {
      // Standard Admin cannot change a Super Admin or Admin's role or status
      if (targetUser.role === 'Super Admin' || targetUser.role === 'Admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Standard Admins cannot modify Admin or Super Admin accounts.'
        });
      }

      // Standard Admin cannot elevate someone to Admin or Super Admin
      if (role && (role === 'Admin' || role === 'Super Admin')) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Only a Super Admin can grant Admin or Super Admin roles.'
        });
      }
    }

    const newStatus = status !== undefined ? status : targetUser.status;
    const newRole = role !== undefined ? role : targetUser.role;

    const updateResult = await pool.query(
      `UPDATE profiles
       SET status = $1, role = $2, updated_at = NOW()
       WHERE id::text = $3
       RETURNING id, email, role, status, created_at, updated_at`,
      [newStatus, newRole, id]
    );

    res.json({
      success: true,
      message: 'User updated successfully.',
      user: updateResult.rows[0]
    });
  } catch (err) {
    console.error('PUT /api/users/:id error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error updating user profile.' });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});