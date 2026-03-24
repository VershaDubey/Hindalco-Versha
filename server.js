const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// health check
app.get("/ping", (req, res) => {
  res.json({ success: true, message: "Server running ✅" });
});

// webhook route
app.use("/webhook", require("./routes/webhook"));

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});