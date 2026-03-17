require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { Resend } = require('resend');
const { pool, setupDatabase } = require('./db');

const app    = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['POST'],
}));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── POST /api/contact ─────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, company, role, message, referral } = req.body;

  // Validate required fields
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  try {
    // 1. Save to database
    const result = await pool.query(
      `INSERT INTO contact_submissions (name, email, phone, company, role, message, referral, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        phone?.trim()   || null,
        company?.trim() || null,
        role?.trim()    || null,
        message.trim(),
        referral?.trim() || null,
        ip,
      ]
    );

    const submission = result.rows[0];

    // 2. Send notification email
    await resend.emails.send({
      from:    'Villa Concierge Co. <noreply@villamanagementgroup.com>',
      to:      'info@villamanagementgroup.com',
      replyTo: email.trim(),
      subject: `New Contact Form Submission — ${name.trim()}`,
      html: buildEmailHtml({ name, email, phone, company, role, message, referral, submission }),
    });

    return res.status(200).json({ success: true, id: submission.id });

  } catch (err) {
    console.error('Submission error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again or call us directly.' });
  }
});

// ── Email template ────────────────────────────────────────────
function buildEmailHtml({ name, email, phone, company, role, message, referral, submission }) {
  const roleLabels = {
    adjuster: 'Independent Adjuster',
    carrier:  'Insurance Carrier',
    hr:       'HR / Relocation Manager',
    staffing: 'Staffing Agency',
    contractor: 'General Contractor',
    homeowner: 'Homeowner',
    family:   'Displaced Family',
    other:    'Other',
  };

  const referralLabels = {
    'adjuster-referral': 'Adjuster or colleague referral',
    google:              'Google / search engine',
    linkedin:            'LinkedIn',
    'furnished-finder':  'Furnished Finder',
    'insurance-carrier': 'Insurance carrier',
    conference:          'Conference or trade show',
    other:               'Other',
  };

  const row = (label, value) => value
    ? `<tr>
        <td style="padding:8px 12px;font-weight:600;color:#1F2D3D;white-space:nowrap;vertical-align:top;width:160px;">${label}</td>
        <td style="padding:8px 12px;color:#333;">${value}</td>
       </tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-top:4px solid #C9A84C;border-radius:2px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:#1F2D3D;padding:28px 32px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#C9A84C;font-weight:700;">Villa Concierge Co.</p>
            <h1 style="margin:6px 0 0;font-size:20px;color:#ffffff;font-weight:600;">New Contact Form Submission</h1>
          </td>
        </tr>

        <!-- Submission details -->
        <tr>
          <td style="padding:32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f9f7f3;border-radius:2px;">
              ${row('Name',     name)}
              ${row('Email',    `<a href="mailto:${email}" style="color:#C9A84C;">${email}</a>`)}
              ${row('Phone',    phone)}
              ${row('Company',  company)}
              ${row('Role',     roleLabels[role] || role)}
              ${row('Referral', referralLabels[referral] || referral)}
            </table>

            <h2 style="margin:28px 0 10px;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#1F2D3D;">Message</h2>
            <div style="background:#f9f7f3;padding:16px 20px;color:#333;line-height:1.7;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

            <p style="margin:28px 0 0;font-size:12px;color:#999;">
              Submission #${submission.id} &nbsp;·&nbsp; ${new Date(submission.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} CT
            </p>
          </td>
        </tr>

        <!-- Reply CTA -->
        <tr>
          <td style="background:#f4f1eb;padding:20px 32px;border-top:1px solid #e8e0d0;">
            <a href="mailto:${email}" style="display:inline-block;background:#C9A84C;color:#1F2D3D;font-weight:700;font-size:13px;padding:10px 24px;text-decoration:none;letter-spacing:0.06em;">Reply to ${name.split(' ')[0]}</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

setupDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Database setup failed:', err);
    process.exit(1);
  });
