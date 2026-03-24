const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  if (!to || !subject || !html) {
    throw new Error("Missing required fields");
  }

  try {
    console.log("📧 Sending email →", to);

    const { data, error } = await resend.emails.send({
      from: "Support <onboarding@resend.dev>", // ✅ correct
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    if (error) {
      console.error("❌ Resend error:", error);
      throw new Error(JSON.stringify(error));
    }

    console.log("✅ Email sent:", data?.id);
    return data;

  } catch (err) {
    console.error("❌ Mail failed:", err.message);
    throw err;
  }
}

module.exports = sendMail;