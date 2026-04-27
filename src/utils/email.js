// src/utils/email.js
const nodemailer = require('nodemailer');

// ── Transport ──────────────────────────────────────────────────────────────────

const createTransport = () => {
  if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
    // Dev fallback: log emails to console, do not throw
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendMail = async (options) => {
  const transporter = createTransport();
  if (!transporter) {
    // Dev mode — just log
    console.log('[EMAIL DEV] To:', options.to, '| Subject:', options.subject);
    return;
  }
  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'Cafeteria Ops'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    ...options,
  });
};

// ── Templates ──────────────────────────────────────────────────────────────────

/**
 * Welcome email sent to a newly created staff member.
 */
const sendWelcomeEmail = async ({ name, email, password, role, branchName, franchiseName, employeeId }) => {
  const roleLabel = {
    system_admin: 'System Administrator',
    cafeteria_manager: 'Cafeteria Manager',
    kitchen_staff: 'Kitchen Staff',
    counter_staff: 'Counter Staff',
  }[role] || role;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { background: #1a73e8; padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; }
  .header p { color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px; }
  .body { padding: 28px 32px; }
  .greeting { font-size: 16px; color: #333; margin-bottom: 16px; }
  .info-box { background: #f8f9ff; border: 1px solid #dde3ff; border-radius: 8px; padding: 18px 20px; margin: 20px 0; }
  .info-row { display: flex; padding: 6px 0; border-bottom: 1px solid #eef; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #888; font-size: 12px; min-width: 120px; }
  .info-value { color: #333; font-size: 13px; font-weight: 600; }
  .cred-box { background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  .cred-box h3 { margin: 0 0 10px; font-size: 13px; color: #f57c00; text-transform: uppercase; letter-spacing: 0.5px; }
  .cred-item { font-size: 13px; color: #555; margin: 4px 0; }
  .cred-item strong { color: #333; }
  .warning { font-size: 12px; color: #e53935; margin-top: 8px; }
  .footer { background: #f9f9f9; padding: 18px 32px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Welcome to Cafeteria Ops</h1>
    <p>Your employee account has been created</p>
  </div>
  <div class="body">
    <p class="greeting">Hello <strong>${name}</strong>,</p>
    <p style="color:#555;font-size:13px;">Your account has been set up on the Cafeteria Operations platform. Here are your details:</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Employee ID</span><span class="info-value">${employeeId}</span></div>
      <div class="info-row"><span class="info-label">Role</span><span class="info-value">${roleLabel}</span></div>
      ${franchiseName ? `<div class="info-row"><span class="info-label">Franchise</span><span class="info-value">${franchiseName}</span></div>` : ''}
      ${branchName ? `<div class="info-row"><span class="info-label">Branch</span><span class="info-value">${branchName}</span></div>` : ''}
    </div>
    <div class="cred-box">
      <h3>Login Credentials</h3>
      <p class="cred-item"><strong>Email:</strong> ${email}</p>
      <p class="cred-item"><strong>Password:</strong> ${password}</p>
      <p class="warning">Please change your password after first login.</p>
    </div>
    <p style="font-size:12px;color:#888;">Download the Cafeteria Ops mobile app and log in with the credentials above.</p>
  </div>
  <div class="footer">Cafeteria Operations Platform &mdash; Powered by MyRevealer Solutions</div>
</div>
</body></html>`;

  await sendMail({
    to: email,
    subject: `Welcome to Cafeteria Ops — Your account is ready`,
    html,
  });
};

/**
 * Notification email sent to branch manager email and franchise admin email
 * when a new staff member is added to their branch.
 */
const sendStaffAddedNotification = async ({ recipientEmail, recipientName, staffName, staffEmail, staffRole, branchName, franchiseName, employeeId, addedBy }) => {
  const roleLabel = {
    system_admin: 'System Administrator',
    cafeteria_manager: 'Cafeteria Manager',
    kitchen_staff: 'Kitchen Staff',
    counter_staff: 'Counter Staff',
  }[staffRole] || staffRole;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { background: #34a853; padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; }
  .header p { color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px; }
  .body { padding: 28px 32px; }
  .info-box { background: #f6fff8; border: 1px solid #c8e6c9; border-radius: 8px; padding: 18px 20px; margin: 20px 0; }
  .info-row { display: flex; padding: 6px 0; border-bottom: 1px solid #e8f5e9; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #888; font-size: 12px; min-width: 120px; }
  .info-value { color: #333; font-size: 13px; font-weight: 600; }
  .footer { background: #f9f9f9; padding: 18px 32px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>New Staff Member Added</h1>
    <p>${branchName}${franchiseName ? ` · ${franchiseName}` : ''}</p>
  </div>
  <div class="body">
    <p style="color:#555;font-size:13px;">Hello ${recipientName || 'Team'},</p>
    <p style="color:#555;font-size:13px;">A new staff member has been added to <strong>${branchName}</strong>:</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Name</span><span class="info-value">${staffName}</span></div>
      <div class="info-row"><span class="info-label">Employee ID</span><span class="info-value">${employeeId}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${staffEmail}</span></div>
      <div class="info-row"><span class="info-label">Role</span><span class="info-value">${roleLabel}</span></div>
      ${franchiseName ? `<div class="info-row"><span class="info-label">Franchise</span><span class="info-value">${franchiseName}</span></div>` : ''}
      <div class="info-row"><span class="info-label">Branch</span><span class="info-value">${branchName}</span></div>
      <div class="info-row"><span class="info-label">Added By</span><span class="info-value">${addedBy}</span></div>
    </div>
  </div>
  <div class="footer">Cafeteria Operations Platform &mdash; Powered by MyRevealer Solutions</div>
</div>
</body></html>`;

  await sendMail({
    to: recipientEmail,
    subject: `New staff added to ${branchName} — ${staffName}`,
    html,
  });
};

module.exports = { sendWelcomeEmail, sendStaffAddedNotification };
