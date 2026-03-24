const nodemailer = require("nodemailer");
const dns = require("dns");

// ✅ force IPv4
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4, // force IPv4
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 5000,
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