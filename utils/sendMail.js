const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "yourgmail@gmail.com",
    pass: "your_app_password", // not your normal password
  },
});

async function sendMail({ to, subject, html }) {
  await transporter.sendMail({
    from: '"Hindalco Support" <yourgmail@gmail.com>',
    to,
    subject,
    html,
  });
}