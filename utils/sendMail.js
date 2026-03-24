const nodemailer = require("nodemailer");
const dns = require("dns");

// ✅ force IPv4
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  family: 4, // 🔥 force IPv4 (important)
  connectionTimeout: 10000, // 10 sec
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
      
Rating: ${rating}/5
      
Thanks,
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