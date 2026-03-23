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

// ─── Translate & Sentiment ────────────────────────────────────────────────────
async function translateAndAnalyzeSentiment(transcript) {
  try {
    if (!transcript || transcript.trim() === "") {
      return { translatedText: "", sentiment: "Neutral" };
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that translates text to English and analyzes sentiment.
          Respond ONLY in JSON:
          {
            "translatedText": "...",
            "sentiment": "Positive/Negative/Neutral"
          }`,
        },
        { role: "user", content: transcript },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return {
      translatedText: result.translatedText || transcript,
      sentiment: result.sentiment || "Neutral",
    };
  } catch (error) {
    console.error("❌ Error in translation/sentiment:", error?.message || error);
    return { translatedText: transcript, sentiment: "Neutral" };
  }
}

// ─── Format Duration ──────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (seconds == null) return "0 sec";
  const totalMilliseconds = Math.floor(Number(seconds) * 1000);
  const minutes = Math.floor(totalMilliseconds / 60000);
  const remainingAfterMinutes = totalMilliseconds % 60000;
  const secs = Math.floor(remainingAfterMinutes / 1000);
  const milliseconds = remainingAfterMinutes % 1000;
  let result = "";
  if (minutes > 0) result += `${minutes} min `;
  if (secs > 0) result += `${secs} sec `;
  if (milliseconds > 0) result += `${milliseconds} ms`;
  return result.trim() || "0 sec";
}

// ─── Clean Mobile ─────────────────────────────────────────────────────────────
function cleanMobile(mobile) {
  if (!mobile) return "";
  const numeric = String(mobile).replace(/[^0-9]/g, "");
  if (numeric.length <= 10) return numeric;
  return numeric.slice(-10);
}

// ─── Smart Email Parser ───────────────────────────────────────────────────────
function isAlreadyValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function resolveEmail(rawEmail, spokenToEmailFn) {
  if (!rawEmail) return "";
  const trimmed = rawEmail.trim();
  if (isAlreadyValidEmail(trimmed)) {
    return trimmed.toLowerCase();
  }
  return spokenToEmailFn(trimmed);
}

// ─── Salesforce Token ─────────────────────────────────────────────────────────
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      httpsAgent: agent,
    }
  );
  return resp.data;
}

// ─── Webhook POST ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    console.log("📦 Webhook received payload:", JSON.stringify(req.body, null, 2));

    // ── Debug log — check these values first if email is not working ──────────
    console.log("🔍 DEBUG →", {
      status: req.body.status,
      rawEmail: req.body.extracted_data?.email,
      mobile: req.body.extracted_data?.mobile,
      rating: req.body.extracted_data?.rate || req.body.extracted_data?.rating,
    });

    const extracted = req.body.extracted_data || {};
    const telephoneData = req.body.telephony_data || {};
    const transcriptedData = req.body.transcript || "";
    const callStatus = (req.body.status || "").trim().toLowerCase();

    let conversationDurationSeconds =
      req.body.conversation_duration || req.body.conversationDueration || null;

    if (!extracted || Object.keys(extracted).length === 0) {
      return res.status(400).json({ error: "No extracted_data found in payload" });
    }

    let {
      user_name,
      mobile,
      pincode,
      technician_visit_date,
      issuedesc,
      fulladdress,
      rate: extracted_rate,
      rating,
      feedback: extracted_feedback,
      comment,
      email: rawEmail,
    } = extracted;

    // Smart email resolution — handles both clean and spoken email formats
    const email = resolveEmail(rawEmail || "", spokenToEmail);

    const cleanedMobile = cleanMobile(mobile || "");
    const conversationDueration = formatDuration(conversationDurationSeconds);
    const issueDesc = issuedesc || "";
    const fullAddress = fulladdress || "";
    const recordingURL = telephoneData?.recording_url || "";

    const { translatedText, sentiment } =
      await translateAndAnalyzeSentiment(transcriptedData);

    const classifyIssueType = (desc) => {
      if (!desc) return "Service Appointment";
      const serviceKeywords = ["not working", "repair", "issue", "problem"];
      const complaintKeywords = ["complaint", "rude", "delay"];
      const lower = desc.toLowerCase();
      if (complaintKeywords.some((w) => lower.includes(w))) return "Complaint";
      if (serviceKeywords.some((w) => lower.includes(w))) return "Service Appointment";
      return "Service Appointment";
    };

    const caseType = classifyIssueType(issueDesc);

    const tokenData = await getSalesforceToken();
    const accessToken = tokenData.access_token;
    const instanceUrl = tokenData.instance_url;

    const payload = {
      subject: caseType,
      operation: "insert",
      user_name: user_name || "Web User",
      email: email,
      mobile: cleanedMobile,
      pincode: pincode || "",
      preferred_date: technician_visit_date || "",
      preferred_time: technician_visit_date || "",
      issuedesc: issueDesc,
      fulladdress: fullAddress,
      recording_link: recordingURL,
      transcript: translatedText || transcriptedData,
      conversationDueration,
      sentiment,
      origin: "Phone",
      priority: "High",
      feedback: extracted_feedback || comment || "",
      rate: extracted_rate || rating || "",
    };

    const sfResponse = await axios.post(
      `${instanceUrl}/services/apexrest/caseService`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        httpsAgent: agent,
      }
    );

    // ─── WHATSAPP ───────────────────────────────────────────────────────────────
    try {
      if (callStatus !== "completed") {
        console.log("ℹ️ WhatsApp skipped: call not completed. Status →", callStatus);
      } else {
        let target =
          cleanedMobile ||
          req.body.user_number ||
          telephoneData?.to_number ||
          "";

        target = String(target).replace(/[^0-9]/g, "");
        if (target.length === 10) target = "91" + target;

        const ratingValue = extracted_rate || rating;

        if (!target || !ratingValue) {
          console.log("ℹ️ WhatsApp skipped: missing phone or rating");
        } else {
          const whatsappPayload = {
            messaging_product: "whatsapp",
            to: target,
            type: "template",
            template: {
              name: "sevicd_demo_12",
              language: { code: "en" },
              components: [
                {
                  type: "body",
                  parameters: [
                    {
                      type: "text",
                      text: String(ratingValue),
                    },
                  ],
                },
              ],
            },
          };

          const whatsappResponse = await axios.post(
            "https://graph.facebook.com/v21.0/475003915704924/messages",
            whatsappPayload,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
              },
              httpsAgent: agent,
            }
          );

          console.log("✅ WhatsApp accepted by Meta:", whatsappResponse.data);
        }
      }
    } catch (waErr) {
      console.warn("⚠️ WhatsApp error:", waErr?.response?.data || waErr.message);
    }

    // ─── EMAIL ──────────────────────────────────────────────────────────────────
    try {
      const GOOGLE_FORM_LINK =
        process.env.FEEDBACK_FORM_URL || "https://forms.gle/MDPrTCxTwgDNLqjGA";

      // Broad status matching — covers all common telephony provider values
      const callWasCompleted =
        callStatus === "completed" ||
        callStatus === "end-of-call-report" ||
        callStatus === "call_ended" ||
        callStatus === "ended" ||
        callStatus === "done";
 console.log("============ EMAIL DEBUG ============");
  console.log("rawEmail:", rawEmail);
  console.log("email (after spokenToEmail):", email);
  console.log("finalEmail:", finalEmail);
  console.log("callStatus:", callStatus);
  console.log("callWasCompleted:", callWasCompleted);
  console.log("callWasMissed:", callWasMissed);
  console.log("finalEmail has @:", finalEmail?.includes("@"));
  console.log("RESEND_API_KEY set:", !!process.env.RESEND_API_KEY);
  console.log("RESEND_API_KEY starts with re_:", process.env.RESEND_API_KEY?.startsWith("re_"));
  console.log("=====================================");
  // ─
      const callWasMissed =
        ["no-answer", "missed", "busy", "failed", "no_answer", "not-answered"].includes(callStatus);

      console.log("📧 Email decision →", {
        email,
        callStatus,
        callWasCompleted,
        callWasMissed,
      });

      if (!email || !email.includes("@")) {
        console.log("ℹ️ Email skipped: no valid email →", email);

      } else if (callWasMissed) {
        // ── Missed call → "We tried reaching you" ──────────────────────────────
        await sendMail({
          to: email,
          subject: "We tried reaching you – Quick Feedback Request",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
              <h2 style="color:#333;">We tried reaching you 📞</h2>
              <p>Dear <strong>${user_name || "Customer"}</strong>,</p>
              <p>We recently tried to contact you regarding your experience with Hindalco, but were unable to connect.</p>
              <p>If you have 2 minutes, we'd really appreciate your thoughts:</p>
              <p style="text-align:center;margin:32px 0;">
                <a href="${GOOGLE_FORM_LINK}"
                   style="background:#007bff;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
                  📝 Fill Feedback Form
                </a>
              </p>
              <p style="color:#888;font-size:13px;">
                If the button doesn't work, copy this link:<br/>
                <a href="${GOOGLE_FORM_LINK}">${GOOGLE_FORM_LINK}</a>
              </p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
              <p style="color:#aaa;font-size:12px;">– Hindalco Mission Happiness Team</p>
            </div>
          `,
        });
        console.log("✅ Missed-call email sent to:", email);

      } else if (callWasCompleted) {
        // ── Completed call → Thank you + summary + form link ───────────────────
        const ratingValue = extracted_rate || rating || "N/A";
        const feedbackText = extracted_feedback || comment || "None";

        await sendMail({
          to: email,
          subject: "Thank you for your feedback! 🙏",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;">
              <h2 style="color:#C8202D;">Thank you for your feedback! 🙏</h2>
              <p>Dear <strong>${user_name || "Customer"}</strong>,</p>
              <p>We appreciate you taking the time to share your experience with Hindalco. Here's a summary:</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr style="background:#f8f9fa;">
                  <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;width:40%;">Rating</td>
                  <td style="padding:10px;border:1px solid #dee2e6;">${ratingValue} / 10</td>
                </tr>
                <tr>
                  <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;">Sentiment</td>
                  <td style="padding:10px;border:1px solid #dee2e6;">${sentiment}</td>
                </tr>
                <tr style="background:#f8f9fa;">
                  <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;">Your Comments</td>
                  <td style="padding:10px;border:1px solid #dee2e6;">${feedbackText}</td>
                </tr>
              </table>
              <p>Would you like to share more? Please fill our feedback form:</p>
              <p style="text-align:center;margin:32px 0;">
                <a href="${GOOGLE_FORM_LINK}"
                   style="background:#28a745;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
                  📝 Share More Feedback
                </a>
              </p>
              <p style="color:#888;font-size:13px;">
                If the button doesn't work, copy this link:<br/>
                <a href="${GOOGLE_FORM_LINK}">${GOOGLE_FORM_LINK}</a>
              </p>
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
              <p style="color:#aaa;font-size:12px;">– Hindalco Mission Happiness Team</p>
            </div>
          `,
        });
        console.log("✅ Completed-call email sent to:", email);

      } else {
        console.log("ℹ️ Email skipped: status did not match any known value →", callStatus);
      }

    } catch (mailErr) {
      console.error("❌ Email block error:", mailErr?.message || mailErr);
    }
    // ───────────────────────────────────────────────────────────────────────────

    res.status(200).json({
      success: true,
      message: "Salesforce Case created, WhatsApp & Email processed",
      salesforceResponse: sfResponse.data,
    });

  } catch (error) {
    console.error("❌ Webhook error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;