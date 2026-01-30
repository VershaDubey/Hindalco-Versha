const express = require("express");
const router = express.Router();
const sendMail = require("../utils/sendMail");

router.post("/send", async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    const response = await sendMail({ to, subject, html });

    res.status(200).json({
      success: true,
      message: "Email sent successfully",
      response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;
