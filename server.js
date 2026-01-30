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

// Routes
app.use("/mail", require("./routes/mail"));
app.use("/webhook", require("./routes/webhook"));

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
