const nodemailer = require("nodemailer");
const dns = require("dns");

// 🔥 FORCE IPV4
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendMail({ to, subject, html, userName, rating }) {
  try {
    console.log("📧 Sending email →", to);

    await transporter.sendMail({
      from: `"Hindalco Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,

      text: `Hi ${userName},

Thank you for your feedback.

Rating: ${rating}/5

Regards,
Team Hindalco`,

      replyTo: process.env.EMAIL_USER,
    });

    console.log("✅ Email sent");

  } catch (err) {
    console.error("❌ Mail error:", err.message);
    throw err;
  }
}

module.exports = sendMail;