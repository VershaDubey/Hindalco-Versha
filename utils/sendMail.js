const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  if (!to || !subject || !html) {
    throw new Error("Missing required mail fields: to, subject, or html");
  }

  const { data, error } = await resend.emails.send({
    from: "Support Team <no-reply@your-verified-domain.com>",
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || JSON.stringify(error));
  }

  return data;
}

module.exports = sendMail;