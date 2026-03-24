const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Logging
app.use((req, res, next) => {
  console.log(`📩 [${req.method}] ${req.url}`);
  next();
});

// Health check
app.get("/ping", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running fine ✅",
    time: new Date().toLocaleString(),
  });
});
app.get("/test-mail", async (req, res) => {
  try {
    const sendMail = require("./utils/sendMail");

    await sendMail({
      to: "dhilliwalpooja80@gmail.com",
      subject: "Test Email ✅",
      html: "<h1>Email working 🚀</h1>",
    });

    res.send("✅ Email sent successfully");
  } catch (err) {
    res.status(500).send("❌ " + err.message);
  }
});

// Routes
app.use("/mail", require("./routes/mail"));
app.use("/webhook", require("./routes/webhook"));

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
