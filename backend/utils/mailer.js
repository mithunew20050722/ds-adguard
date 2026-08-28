const nodemailer = require("nodemailer");

// Uses Gmail SMTP by default. To use Gmail:
//  1. Turn on 2-Step Verification on the Gmail account.
//  2. Create an "App Password" (Google Account -> Security -> App passwords).
//  3. Set SMTP_USER to the gmail address and SMTP_PASS to that 16-char app password.
// Any other SMTP provider works too -- just set SMTP_HOST/SMTP_PORT instead.
function buildTransport() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendPasswordResetOtp(toEmail, otp) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP_USER / SMTP_PASS are not set in environment variables.");
  }

  const transport = buildTransport();

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "Your Private DNS AdGuard password reset code",
    text: `Your password reset code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="color:#123a34;">Private DNS AdGuard</h2>
        <p>Your password reset code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color:#0f8a73;">${otp}</p>
        <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetOtp };
