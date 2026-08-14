const nodemailer = require('nodemailer');

const FROM_NAME = process.env.EMAIL_FROM_NAME || 'IA Nexus (No-Reply)';
const FROM_ADDRESS = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@ianexus.app';
// Where replies are routed. Defaults to a no-reply address so user replies don't
// reach a person. Override with EMAIL_REPLY_TO if you have a monitored inbox.
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'no-reply@ianexus.app';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;

  const port = Number(process.env.EMAIL_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

function isEmailConfigured() {
  return !!getTransporter();
}

/**
 * Sends the 6-digit password reset code to the user.
 * If no email provider is configured, falls back to logging the code to the
 * server console (dev only) so the flow stays testable. The code is never
 * returned to the client.
 */
async function sendResetCode(email, code, expiresMinutes = 10) {
  const subject = 'Password Reset Verification Code';
  const text =
    `Your verification code is: ${code}\n\n` +
    `This code expires in ${expiresMinutes} minutes. ` +
    `If you did not request a password reset, please ignore this email.\n\n` +
    `This is an automated message — please do not reply to this email.`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 440px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
      <h1 style="font-size: 20px; color: #b91c1c; margin: 0 0 8px;">IA Nexus</h1>
      <h2 style="font-size: 17px; margin: 0 0 16px; color: #111827;">Password Reset</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
        Use the verification code below to reset your password.
      </p>
      <div style="font-size: 34px; font-weight: 700; letter-spacing: 8px; text-align: center;
                  background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;
                  padding: 18px; color: #111827; margin: 0 0 20px;">
        ${code}
      </div>
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 16px;">
        This code expires in <strong>${expiresMinutes} minutes</strong>.
        If you did not request a password reset, you can safely ignore this email.
      </p>
      <p style="font-size: 12px; line-height: 1.5; color: #9ca3af; margin: 0; border-top: 1px solid #e5e7eb; padding-top: 14px;">
        This is an automated message — please do not reply to this email.
      </p>
    </div>
  `;

  const t = getTransporter();
  if (!t) {
    console.log(
      `\n📧 [DEV — no email provider configured]\n` +
      `   Password reset code for ${email}: ${code}\n` +
      `   (expires in ${expiresMinutes} minutes)\n`
    );
    return { delivered: false, dev: true };
  }

  await t.sendMail({
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
    to: email,
    subject,
    text,
    html,
  });
  return { delivered: true };
}

/**
 * Sends the "confirm your email" link on signup. Same dev-console fallback as
 * sendResetCode when no email provider is configured.
 */
async function sendVerificationEmail(email, verifyUrl) {
  const subject = 'Verify your IA Nexus email';
  const text =
    `Confirm your email to finish setting up your IA Nexus account:\n\n${verifyUrl}\n\n` +
    `This link expires in 24 hours. If you didn't create this account, you can ignore this email.`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 440px; margin: 0 auto; padding: 32px 24px; color: #1f2937;">
      <h1 style="font-size: 20px; color: #b91c1c; margin: 0 0 8px;">IA Nexus</h1>
      <h2 style="font-size: 17px; margin: 0 0 16px; color: #111827;">Verify your email</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 20px;">
        One more step to finish setting up your account.
      </p>
      <a href="${verifyUrl}" style="display: inline-block; background: #b91c1c; color: #ffffff; text-decoration: none;
                  font-size: 15px; font-weight: 600; padding: 12px 24px; border-radius: 10px; margin: 0 0 20px;">
        Verify Email
      </a>
      <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 0 0 16px;">
        This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
      </p>
      <p style="font-size: 12px; line-height: 1.5; color: #9ca3af; margin: 0; border-top: 1px solid #e5e7eb; padding-top: 14px;">
        This is an automated message — please do not reply to this email.
      </p>
    </div>
  `;

  const t = getTransporter();
  if (!t) {
    console.log(`\n📧 [DEV — no email provider configured]\n   Verify email for ${email}: ${verifyUrl}\n`);
    return { delivered: false, dev: true };
  }

  await t.sendMail({
    from: `"${FROM_NAME}" <${FROM_ADDRESS}>`,
    replyTo: REPLY_TO,
    to: email,
    subject,
    text,
    html,
  });
  return { delivered: true };
}

module.exports = { sendResetCode, sendVerificationEmail, isEmailConfigured };
