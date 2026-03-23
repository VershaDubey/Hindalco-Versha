const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  try {
    if (!to || !subject || !html) {
      throw new Error("Missing required mail fields: to, subject, or html");
    }

    console.log(`📧 Attempting to send email to: ${to}`);

    const { data, error } = await resend.emails.send({
      from: "Support Team <dhilliwalpooja80@gmail.com>", // verified domain
      to,
      subject,
      html,
    });

    if (error) {
      console.error("❌ Resend API error:", JSON.stringify(error));
      throw new Error(JSON.stringify(error));
    }

    console.log("✅ Email sent successfully. Resend ID:", data?.id);
    return data;

  } catch (err) {
    console.error("❌ sendMail exception:", err?.message || err);
    throw err;
  }
}

module.exports = sendMail;