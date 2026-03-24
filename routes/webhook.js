const express = require("express");
const router = express.Router();
const sendMail = require("../utils/sendMail");

// simple email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post("/", async (req, res) => {
  try {
    console.log("📦 Webhook payload:", req.body);

    const callStatus = (req.body.status || "").toLowerCase();
    const extracted = req.body.extracted_data || {};

    const email = extracted.email;
    const userName = extracted.user_name || "Customer";

    console.log("📧 Debug:", { callStatus, email });

    // ✅ Only send when call is completed
    if (callStatus !== "completed") {
      return res.json({
        success: true,
        message: "Call not completed, email skipped",
      });
    }

    if (!isValidEmail(email)) {
      return res.json({
        success: false,
        message: "Invalid email",
      });
    }

    // ✅ SEND EMAIL
    await sendMail({
      to: email,
      subject: "Thank you for your feedback 🙏",
      html: `
        <div style="font-family:Arial;">
          <h2>Hi ${userName} 👋</h2>
          <p>Thank you for your time on the call.</p>
          <p>Please share your feedback:</p>
          <a href="${process.env.FEEDBACK_FORM_URL}"
             style="background:#28a745;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;">
             Give Feedback
          </a>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "Email sent successfully",
    });

  } catch (err) {
    console.error("❌ Webhook error:", err.message);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;