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
function calculateLeadScore(email, purpose) {
  let score = 10; // 1. Base Score: Start with 10 points

  // 2. Email Domain Check (+30 pts for corporate domain)
  if (email && email.includes('@')) {
    const domain = email.split('@')[1]?.toLowerCase().trim();
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];
    if (domain && !freeProviders.includes(domain)) {
      score += 30;
    }
  }

  // 3. Purpose Check
  if (purpose) {
    const standardDefaults = ['Software Development', 'IT Support', 'Consulting'];
    if (!standardDefaults.includes(purpose)) {
      // Custom / Other specific request (+30 pts)
      score += 30;
    } else if (purpose === 'Software Development' || purpose === 'Consulting') {
      score += 20;
    } else if (purpose === 'IT Support') {
      score += 10;
    }
  }

  return Math.min(100, Math.max(0, score));
}

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
  const { full_name, company, email, phone, purpose, source } = req.body;

  if (!full_name || !email) {
    return res.status(400).json({ error: 'full_name and email are required.' });
  }

  const leadSource = source && String(source).trim() ? String(source).trim() : 'Direct';
  const leadScore = calculateLeadScore(email, purpose);

  try {
    const result = await pool.query(
      `INSERT INTO leads (full_name, company, email, phone, purpose, source, score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [full_name, company || null, email, phone || null, purpose || null, leadSource, leadScore]
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

// PATCH /api/leads/:id/status – Update lead status (Protected with verifyToken)
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

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});