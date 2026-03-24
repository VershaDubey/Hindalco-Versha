const express = require("express");
const router = express.Router();
const sendMail = require("../utils/sendMail");

// email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post("/", async (req, res) => {
  try {
    console.log("📦 Webhook payload:", JSON.stringify(req.body, null, 2));

    const callStatus = (req.body.status || "").toLowerCase();
    const extracted = req.body.extracted_data || {};

    const email = extracted.email;
    const userName = extracted.user_name || "Customer";
    const rating = extracted.rate || extracted.rating || "N/A";

    console.log("📧 Debug:", { callStatus, email, userName, rating });

    // Only send when call completed
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

    // 🎯 EMAIL TEMPLATE
    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #eee; border-radius:8px;">
        
        <h2 style="color:#C8202D;">Thank You for Your Feedback 🙏</h2>

        <p>Hi <strong>${userName}</strong>,</p>

        <p>
          Thank you for sharing your feedback with <strong>Hindalco Premium Aluminium</strong>.
        </p>

        <p>
          We’ve recorded your rating of 
          <strong>${rating}/5</strong> and truly appreciate your inputs.
        </p>

        <p>
          Our team is reviewing your feedback and will work towards improving your experience.
        </p>

        <p>
          If you need any assistance or would like to share anything further, you can connect with us below:
        </p>

        <div style="text-align:center; margin:30px 0;">
          <a href="${process.env.FEEDBACK_FORM_URL}"
             style="background:#C8202D; color:#ffffff; padding:12px 25px; text-decoration:none; border-radius:6px; font-weight:bold;">
             Share More Feedback
          </a>
        </div>

        <hr style="border:none; border-top:1px solid #eee;" />

        <p style="font-size:14px; color:#555;">
          Regards,<br/>
          <strong>Team Hindalco Premium Aluminium</strong>
        </p>

      </div>
    `;

    // 🚀 SEND EMAIL
    await sendMail({
      to: email,
      subject: "We Value Your Feedback | Hindalco Premium Aluminium",
      html: htmlTemplate,
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