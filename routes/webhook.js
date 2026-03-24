const express = require("express");
const router = express.Router();
const axios = require("axios");
const sendMail = require("../utils/sendMail");
const spokenToEmail = require("../utils/spokenToEmail");
const https = require("https");
const agent = new https.Agent({ rejectUnauthorized: false });
const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── HELPERS ─────────────────────────────────────────

function cleanMobile(mobile) {
  if (!mobile) return "";
  const numeric = String(mobile).replace(/[^0-9]/g, "");
  return numeric.slice(-10);
}

function resolveEmail(rawEmail, spokenToEmailFn) {
  if (!rawEmail) return "";
  const trimmed = rawEmail.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return spokenToEmailFn(trimmed);
}

// ─── SALESFORCE TOKEN ───────────────────────────────

async function getSalesforceToken() {
  const params = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.SALESFORCE_CLIENT_ID,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET,
    username: process.env.SALESFORCE_USERNAME,
    password: process.env.SALESFORCE_PASSWORD,
  });

  const resp = await axios.post(
    "https://login.salesforce.com/services/oauth2/token",
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json", // 🔥 ADD THIS
      },
      httpsAgent: agent,
    }
  );

  console.log("✅ TOKEN RESPONSE:", resp.data); // debug

  return resp.data;
}

// ─── WEBHOOK ────────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const extracted = req.body.extracted_data || {};
    const telephoneData = req.body.telephony_data || {};
    const callStatus = (req.body.status || "").toLowerCase();

    const email = resolveEmail(extracted.email || "", spokenToEmail);
    const cleanedMobile = cleanMobile(extracted.mobile || "");

    const payload = {
      subject: "Service Appointment",
      operation: "insert",
      user_name: extracted.user_name || "Web User",
      email,
      mobile: cleanedMobile,
      issuedesc: extracted.issuedesc || "",
      fulladdress: extracted.fulladdress || "",
      recording_link: telephoneData?.recording_url || "",
      origin: "Phone",
      priority: "High",
    };

    let sfResponse = null;

    // ─── SALESFORCE (SAFE BLOCK) ─────────────────────
    try {
      const tokenData = await getSalesforceToken();

      sfResponse = await axios.post(
        `${tokenData.instance_url}/services/apexrest/caseService`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
          httpsAgent: agent,
        }
      );

      console.log("✅ Salesforce success");

    } catch (sfError) {
      console.error("❌ Salesforce ERROR:", sfError.response?.data || sfError.message);
    }

    // ─── EMAIL (INDEPENDENT) ─────────────────────────
    try {
      console.log("📧 Email Debug:", { email, callStatus });

      if (email && email.includes("@")) {
        await sendMail({
          to: "dhilliwalpooja80@gmail.com", // 🔥 keep fixed for testing
          subject: "Test Email",
          html: "<h2>Email working ✅</h2>",
        });

        console.log("✅ Email sent");
      } else {
        console.log("❌ Invalid email:", email);
      }

    } catch (mailErr) {
      console.error("❌ Email ERROR:", mailErr.message);

      return res.status(500).json({
        success: false,
        error: mailErr.message,
      });
    }

    // ─── FINAL RESPONSE ─────────────────────────────
    res.status(200).json({
      success: true,
      message: "Process completed",
      salesforce: sfResponse ? "Success" : "Failed",
      email: "Sent",
    });

  } catch (error) {
    console.error("❌ Webhook error:", error.response?.data || error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;