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

// Function to translate transcript to English and analyze sentiment
async function translateAndAnalyzeSentiment(transcript) {
  try {
    if (!transcript || transcript.trim() === "") {
      return {
        translatedText: "",
        sentiment: "Neutral",
      };
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that translates text to English and analyzes sentiment. 
          For the given transcript:
          1. Translate it to English if it's in another language (if already in English, return as is)
          2. Analyze the overall sentiment and classify it as one of: Positive, Negative, or Neutral
          
          Respond in JSON format with two fields:
          {
            "translatedText": "the English translation",
            "sentiment": "Positive/Negative/Neutral"
          }`,
        },
        {
          role: "user",
          content: transcript,
        },
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
    console.error("❌ Error in translation/sentiment analysis:", error.message);
    return {
      translatedText: transcript,
      sentiment: "Neutral",
    };
  }
}

router.post("/", async (req, res) => {
  try {
    const extracted = req.body.extracted_data;
    const telephoneData = req.body.telephony_data;
    const transcriptedData = req.body.transcript;
    let conversationDueration = req.body.conversation_duration;

    function formatDuration(seconds) {
      const totalMilliseconds = Math.floor(seconds * 1000);

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

    conversationDueration = formatDuration(conversationDueration);

    if (!extracted) {
      return res
        .status(400)
        .json({ error: "No extracted_data found in payload" });
    }

    let {
      user_name,
      mobile,
      pincode,
      technician_visit_date,
      issuedesc,
      fulladdress,
    } = extracted;

    let recordingURL = telephoneData?.recording_url || " ";
    let issueDesc = issuedesc;
    let fullAddress = fulladdress;
    let predDate = new Date(technician_visit_date).toLocaleString();

    const classifyIssueType = (desc) => {
      if (!desc) return "Service Appointment";

      const serviceKeywords = [
        "not working",
        "leak",
        "water leaking",
        "kharab",
        "repair",
        "ac not working",
        "washing machine not working",
        "issue",
        "problem",
      ];

      const complaintKeywords = [
        "complaint",
        "rude",
        "delay",
        "wrong",
        "poor",
        "service complaint",
        "technician complaint",
      ];

      const lowerDesc = desc.toLowerCase();

      if (complaintKeywords.some((word) => lowerDesc.includes(word))) {
        return "Complaint";
      }

      if (serviceKeywords.some((word) => lowerDesc.includes(word))) {
        return "Service Appointment";
      }

      return "Service Appointment";
    };

    const caseType = classifyIssueType(issueDesc);
    console.log("🧠 Case Type:", caseType);

    // Salesforce Token
    const tokenResponse = await axios.post(
      "https://login.salesforce.com/services/oauth2/token",
      new URLSearchParams({
        grant_type: "password",
        client_id: process.env.SALESFORCE_CLIENT_ID,
        client_secret: process.env.SALESFORCE_CLIENT_SECRET,
        username: process.env.SALESFORCE_USERNAME,
        password: process.env.SALESFORCE_PASSWORD,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const accessToken = tokenResponse.data.access_token;

    console.log("🔄 Translating transcript and analyzing sentiment...");
    const { translatedText, sentiment } =
      await translateAndAnalyzeSentiment(transcriptedData);
    console.log("✅ Translation complete. Sentiment:", sentiment);

    const sfResponse = await axios.post(
      "https://orgfarm-eb022cf662-dev-ed.develop.my.salesforce.com/services/apexrest/caseService",
      {
        Subject: caseType,
        operation: "insert",
        user_name,
        Mobile: mobile,
        Pincode: pincode,
        issuedesc: issueDesc,
        fulladdress: fullAddress,
        email: " ",
        preferred_date: predDate,
        recording_link: recordingURL,
        transcript: translatedText,
        conversationDueration,
        sentiment,
        Origin: "Phone",
        Priority: "High",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const caseId = "SR-" + sfResponse.data.caseNumber;
    const email = sfResponse.data.email || "";
    const issueDescription = issueDesc || "";
    const slaInfo = "City – Technician visit within 24 hours";
    const registeredAddress = fullAddress || "";
    const serviceTime = new Date(technician_visit_date).toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      },
    );

    const emailHTML = `
    <h2 style="color: #004d40;">G&B Service Update</h2>
    <p>Dear ${user_name},</p>
    <p>We’ve received your request for <b>${issueDescription}</b>.</p>
    <p>
      <b>Case ID:</b> ${caseId}<br/>
      <b>SLA:</b> ${slaInfo}
    </p>
    <p>
      <b>Registered Address:</b><br/>
      ${registeredAddress}<br/>
      <b>Service Time:</b> ${serviceTime}
    </p>
    <p>
      <b>Registered Phone:</b> ${mobile}<br/>
      <b>Registered Email:</b> ${email}
    </p>
    <p style="margin-top: 30px;">Regards,<br/><b>G&B Service Team</b></p>
`;

    await sendMail({
      to: email,
      subject: `G&B Service Update — Case ${caseId}`,
      html: emailHTML,
    });

    const parameters = [
      user_name || "Dummy Name",
      issueDesc || "Dummy Issue",
      caseId,
      fullAddress || "Dummy Address",
      predDate || "Dummy Date",
      mobile,
    ];

    const whatsappMobile = mobile.replace(/^(\+91|91)/, "");
    const whatsappPayload = {
      messaging_product: "whatsapp",
      to: "91" + whatsappMobile,
      type: "template",
      template: {
        name: "gb_service_update",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: parameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    };

    const whatsappResponse = await axios.post(
      "https://graph.facebook.com/v22.0/475003915704924/messages",
      whatsappPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
          "Accept-Encoding": "identity",
        },
      },
    );

    res.status(200).json({
      success: true,
      message: "Salesforce Case created, and WhatsApp message delivered",
      salesforceResponse: sfResponse.data,
      whatsappResponse: whatsappResponse.data,
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
