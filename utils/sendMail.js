const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  if (!to || !subject || !html) {
    throw new Error("Missing required fields: to, subject, html");
  }

  try {
    console.log("📧 Sending email →", to);

    const { data, error } = await resend.emails.send({
      from: "Support Team <onboarding@resend.dev>", // ✅ TESTING SENDER
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    if (error) {
      console.error("❌ Resend error:", error);
      throw new Error(error.message || "Resend failed");
    }

    console.log("✅ Email sent:", data?.id);
    return data;

  } catch (err) {
    console.error("❌ sendMail failed:", err.message);
    throw err;
  }
}

module.exports = sendMail;