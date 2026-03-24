const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendMail({ to, subject, html }) {
  try {
    console.log("📧 Sending email →", to);

    await transporter.sendMail({
      from: `"Hindalco Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log("✅ Email sent");
  } catch (err) {
    console.error("❌ Mail error:", err.message);
    throw err;
  }
}

module.exports = sendMail;