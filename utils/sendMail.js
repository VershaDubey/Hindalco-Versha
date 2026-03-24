const SibApiV3Sdk = require("sib-api-v3-sdk");

const client = SibApiV3Sdk.ApiClient.instance;

const apiKey = client.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

async function sendMail({ to, subject, html, userName, rating }) {
  try {
    console.log("📧 Sending email →", to);

    const response = await tranEmailApi.sendTransacEmail({
      sender: {
        email: process.env.EMAIL_USER,
        name: "Hindalco Support",
      },
      to: [
        {
          email: to,
        },
      ],
      subject: subject,
      htmlContent: html,
    });

    console.log("✅ Email sent:", response.messageId);

  } catch (err) {
    console.error("❌ Email error:", err.response?.body || err.message);
    throw err;
  }
}

module.exports = sendMail;