const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendMail({ to, subject, html }) {
  const { data, error } = await resend.emails.send({
    from: "Support Team <onboarding@resend.dev>", // use this for testing
    // from: "Support Team <noreply@yourdomain.com>", // use this after adding your domain
    to,
    subject,
    html,
  });

  if (error) {
    console.error("❌ Resend error:", error);
    throw new Error(error.message);
  }

  console.log("📧 Email sent via Resend:", data.id);
  return data;
}

module.exports = sendMail;
// const { Resend } = require("resend");
// const resend = new Resend(process.env.RESEND_API_KEY);

// async function sendMail({ to, subject, html }) {
//   try {
//     if (!to || !subject || !html) {
//       throw new Error("Missing required mail fields: to, subject, or html");
//     }

//     console.log(`📧 Sending email to ${to}`);
//     const response = await resend.emails.send({
//       from: "ankit.panwar@crmlanding.co.in",
//       to,
//       subject,
//       html,
//     });

//     console.log("✅ Email sent successfully:", response);
//     return response;
//   } catch (error) {
//     console.error("❌ Error sending email:", error.response?.data || error.message);
//     throw error;
//   }
// }

// module.exports = sendMail;
