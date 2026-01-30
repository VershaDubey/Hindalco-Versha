// routes/webhook.js
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

/**
 * Helper: translate transcript & analyze sentiment (kept similar to your version)
 * Returns { translatedText, sentiment }
 */
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
          For the given transcript:
          1. Translate it to English if it's in another language (if already in English, return as is)
          2. Analyze the overall sentiment and classify it as one of: Positive, Negative, or Neutral
          
          Respond in JSON format with two fields:
          {
            "translatedText": "the English translation",
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
    console.error("❌ Error in translation/sentiment analysis:", error?.message || error);
    return { translatedText: transcript, sentiment: "Neutral" };
  }
}

/** helper to format duration (seconds -> human string) */
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

/** sanitize mobile to numeric and last 10 digits */
function cleanMobile(mobile) {
  if (!mobile) return "";
  const numeric = String(mobile).replace(/[^0-9]/g, "");
  if (numeric.length <= 10) return numeric;
  return numeric.slice(-10);
}

/** Get Salesforce access token (password grant). Make sure env vars are set */
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
  return resp.data; // contains access_token and instance_url
}

router.post("/", async (req, res) => {
  try {
    console.log("📦 Webhook received payload:", JSON.stringify(req.body, null, 2));

    const extracted = req.body.extracted_data || {};
    const telephoneData = req.body.telephony_data || {};
    const transcriptedData = req.body.transcript || "";
    let conversationDurationSeconds = req.body.conversation_duration || req.body.conversationDueration || null;

    // Validate
    if (!extracted || Object.keys(extracted).length === 0) {
      return res.status(400).json({ error: "No extracted_data found in payload" });
    }

    // Extract fields (use possible alternate keys)
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

    // Normalize email
    const email = spokenToEmail(rawEmail || "");

    // Normalize mobile
    const cleanedMobile = cleanMobile(mobile || extracted.mobile || "");

    // format conversation duration human readable (if provided as seconds)
    const conversationDueration = formatDuration(conversationDurationSeconds);

    // Prefer fields fallback
    const issueDesc = issuedesc || extracted.issueDesc || extracted.issue || "";
    const fullAddress = fulladdress || extracted.fullAddress || "";

    // recording URL from telephony data
    const recordingURL = telephoneData?.recording_url || telephoneData?.recordingUrl || "";

    // Translate + sentiment analysis (if you want this)
    console.log("🔄 Translating transcript and analyzing sentiment...");
    const { translatedText, sentiment } = await translateAndAnalyzeSentiment(transcriptedData);
    console.log("✅ Translation complete. Sentiment:", sentiment);

    // Classify Case Type (simple heuristic — keep as you had)
    const classifyIssueType = (desc) => {
      if (!desc) return "Service Appointment";
      const serviceKeywords = ["not working", "leak", "repair", "ac not working", "washing machine not working", "issue", "problem", "kharab"];
      const complaintKeywords = ["complaint", "rude", "delay", "wrong", "poor", "service complaint", "technician complaint"];
      const lowerDesc = desc.toLowerCase();
      if (complaintKeywords.some((w) => lowerDesc.includes(w))) return "Complaint";
      if (serviceKeywords.some((w) => lowerDesc.includes(w))) return "Service Appointment";
      return "Service Appointment";
    };
    const caseType = classifyIssueType(issueDesc);

    // Get Salesforce token
    const tokenData = await getSalesforceToken();
    const accessToken = tokenData.access_token;
    const instanceUrl = tokenData.instance_url;
    if (!accessToken || !instanceUrl) throw new Error("Failed to obtain Salesforce token");

    // Build payload matching Apex CaseRequest field names exactly
    const payload = {
      subject: caseType,
      operation: "insert",
      user_name: user_name || extracted.user || "Web User",
      email: email || "",
      mobile: cleanedMobile,
      pincode: pincode || "",
      preferred_date: technician_visit_date ? new Date(technician_visit_date).toISOString() : "",
      preferred_time: technician_visit_date ? new Date(technician_visit_date).toISOString() : "",
      issuedesc: issueDesc,
      fulladdress: fullAddress,
      recording_link: recordingURL,
      transcript: translatedText || transcriptedData,
      conversationDueration: conversationDueration, // NOTE: matches Apex field name misspelling
      sentiment: sentiment || "Neutral",
      origin: "Phone",
      priority: "High",
      // feedback and rate must map to Apex fields 'feedback' and 'rate'
      feedback: extracted_feedback || comment || extracted.comment || "",
      rate: extracted_rate || rating || extracted.rating || "",
    };

    console.log("➡️ Sending to Salesforce Apex REST:", payload);

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

    // Build case id / number for emails, messages
    const caseNumber = sfResponse.data?.caseNumber || sfResponse.data?.caseNum || sfResponse.data?.CaseNumber || "";
    const caseId = sfResponse.data?.caseId || sfResponse.data?.id || "";
    const mailTo = sfResponse.data?.email || email || "";

    const caseRef = caseNumber ? `SR-${caseNumber}` : caseId || "SR-UNKNOWN";

    // Prepare user email body (you can reuse your previous template)
    const serviceTime = technician_visit_date ? new Date(technician_visit_date).toLocaleString("en-IN") : "";
    const emailHTML = `
      <h2 style="color: #004d40;">G&B Service Update</h2>
      <p>Dear ${user_name || "Customer"},</p>
      <p>We’ve received your request for <b>${issueDesc}</b>.</p>
      <p><b>Case ID:</b> ${caseRef}</p>
      <p><b>Registered Address:</b><br/>${fullAddress}</p>
      <p><b>Service Time:</b> ${serviceTime}</p>
      <p><b>Registered Phone:</b> ${cleanedMobile}<br/><b>Registered Email:</b> ${mailTo}</p>
      <p style="margin-top: 30px;">Regards,<br/><b>G&B Service Team</b></p>
    `;

    // Send email (if email exists)
    if (mailTo) {
      await sendMail({
        to: mailTo,
        subject: `G&B Service Update — Case ${caseRef}`,
        html: emailHTML,
      });
    }

    // WhatsApp template notification (use WHATSAPP_TOKEN env var)
    try {
      const whatsappMobile = cleanedMobile.replace(/^(\+91|91)/, "");
      // Prepare template parameters based on the template you provided:
      // Template text:
      // Thank you for connecting with us on the feedback call.
      //
      // We truly value your rating of [X/5] and the suggestions you shared. It helps us serve you better.
      //
      // In case you need any assistance going forward, please feel free to contact us at [contact number].
      //
      // We'll send this as a WhatsApp template (template placeholders: rating, suggestions, contact number)

      const ratingValue = extracted_rate || rating || extracted.rating || payload.rate || "Not provided";
      const feedbackText = (extracted_feedback || comment || extracted.comment || payload.feedback || "").toString() || "No suggestions";
      const contactNumber = process.env.CONTACT_NUMBER || "1800-123-456";

      // const whatsappPayload = {
      //   messaging_product: "whatsapp",
      //   to: "91" + whatsappMobile,
      //   type: "template",
      //   template: {
      //     name: process.env.WHATSAPP_TEMPLATE_NAME || "gb_feedback_thankyou",
      //     language: { code: "en" },
      //     components: [
      //       {
      //         type: "body",
      //         parameters: [
      //           { type: "text", text: `${ratingValue}/5` },       // placeholder 1 -> rating
      //           { type: "text", text: feedbackText },            // placeholder 2 -> suggestions/feedback
      //           { type: "text", text: contactNumber },          // placeholder 3 -> contact number
      //         ],
      //       },
      //     ],
      //   },
      // };

      // const whatsappResponse = await axios.post(
      //   "https://graph.facebook.com/v22.0/475003915704924/messages",
      //   whatsappPayload,
      //   {
      //     headers: {
      //       Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      //       "Content-Type": "application/json",
      //       "Accept-Encoding": "identity",
      //     },
      //     httpsAgent: agent,
      //   }
      // );
      console.log("✅ WhatsApp response:", whatsappResponse.data);
    } catch (waErr) {
      console.warn("⚠️ WhatsApp send failed:", waErr?.response?.data || waErr.message || waErr);
    }

    // Final response to caller
    res.status(200).json({
      success: true,
      message: "Salesforce Case created and notifications attempted",
      salesforceResponse: sfResponse.data,
    });
  } catch (error) {
    console.error("❌ Webhook error:", error.response?.data || error.message || error);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message || String(error),
    });
  }
});

module.exports = router;


// // routes/webhook.js
// const express = require("express");
// const router = express.Router();
// const axios = require("axios");
// const sendMail = require("../utils/sendMail");
// const spokenToEmail = require("../utils/spokenToEmail");
// const https = require("https");
// const agent = new https.Agent({ rejectUnauthorized: false });
// const OpenAI = require("openai");
// require("dotenv").config();

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// /**
//  * Helper: translate transcript & analyze sentiment (kept similar to your version)
//  * Returns { translatedText, sentiment }
//  */
// async function translateAndAnalyzeSentiment(transcript) {
//   try {
//     if (!transcript || transcript.trim() === "") {
//       return { translatedText: "", sentiment: "Neutral" };
//     }

//     const completion = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: [
//         {
//           role: "system",
//           content: `You are a helpful assistant that translates text to English and analyzes sentiment. 
//           For the given transcript:
//           1. Translate it to English if it's in another language (if already in English, return as is)
//           2. Analyze the overall sentiment and classify it as one of: Positive, Negative, or Neutral
          
//           Respond in JSON format with two fields:
//           {
//             "translatedText": "the English translation",
//             "sentiment": "Positive/Negative/Neutral"
//           }`,
//         },
//         { role: "user", content: transcript },
//       ],
//       temperature: 0.3,
//       response_format: { type: "json_object" },
//     });

//     const result = JSON.parse(completion.choices[0].message.content);
//     return {
//       translatedText: result.translatedText || transcript,
//       sentiment: result.sentiment || "Neutral",
//     };
//   } catch (error) {
//     console.error("❌ Error in translation/sentiment analysis:", error?.message || error);
//     return { translatedText: transcript, sentiment: "Neutral" };
//   }
// }

// /** helper to format duration (seconds -> human string) */
// function formatDuration(seconds) {
//   if (seconds == null) return "0 sec";
//   const totalMilliseconds = Math.floor(Number(seconds) * 1000);
//   const minutes = Math.floor(totalMilliseconds / 60000);
//   const remainingAfterMinutes = totalMilliseconds % 60000;
//   const secs = Math.floor(remainingAfterMinutes / 1000);
//   const milliseconds = remainingAfterMinutes % 1000;
//   let result = "";
//   if (minutes > 0) result += `${minutes} min `;
//   if (secs > 0) result += `${secs} sec `;
//   if (milliseconds > 0) result += `${milliseconds} ms`;
//   return result.trim() || "0 sec";
// }

// /** sanitize mobile to numeric and last 10 digits */
// function cleanMobile(mobile) {
//   if (!mobile) return "";
//   const numeric = String(mobile).replace(/[^0-9]/g, "");
//   if (numeric.length <= 10) return numeric;
//   return numeric.slice(-10);
// }

// /** Get Salesforce access token (password grant). Make sure env vars are set */
// async function getSalesforceToken() {
//   const params = new URLSearchParams({
//     grant_type: "password",
//     client_id: process.env.SALESFORCE_CLIENT_ID,
//     client_secret: process.env.SALESFORCE_CLIENT_SECRET,
//     username: process.env.SALESFORCE_USERNAME,
//     password: process.env.SALESFORCE_PASSWORD,
//   });
//   const resp = await axios.post(
//     "https://login.salesforce.com/services/oauth2/token",
//     params.toString(),
//     {
//       headers: { "Content-Type": "application/x-www-form-urlencoded" },
//       httpsAgent: agent,
//     }
//   );
//   return resp.data; // contains access_token and instance_url
// }

// router.post("/", async (req, res) => {
//   try {
//     console.log("📦 Webhook received payload:", JSON.stringify(req.body, null, 2));

//     const extracted = req.body.extracted_data || {};
//     const telephoneData = req.body.telephony_data || {};
//     const transcriptedData = req.body.transcript || "";
//     let conversationDurationSeconds = req.body.conversation_duration || req.body.conversationDueration || null;

//     // Validate
//     if (!extracted || Object.keys(extracted).length === 0) {
//       return res.status(400).json({ error: "No extracted_data found in payload" });
//     }

//     // Extract fields (use possible alternate keys)
//     let {
//       user_name,
//       mobile,
//       pincode,
//       technician_visit_date,
//       issuedesc,
//       fulladdress,
//       rate: extracted_rate,
//       rating,
//       feedback: extracted_feedback,
//       comment,
//       email: rawEmail,
//     } = extracted;

//     // Normalize email
//     const email = spokenToEmail(rawEmail || "");

//     // Normalize mobile
//     const cleanedMobile = cleanMobile(mobile || extracted.mobile || "");

//     // format conversation duration human readable (if provided as seconds)
//     const conversationDueration = formatDuration(conversationDurationSeconds);

//     // Prefer fields fallback
//     const issueDesc = issuedesc || extracted.issueDesc || extracted.issue || "";
//     const fullAddress = fulladdress || extracted.fullAddress || "";

//     // recording URL from telephony data
//     const recordingURL = telephoneData?.recording_url || telephoneData?.recordingUrl || "";

//     // Translate + sentiment analysis (if you want this)
//     console.log("🔄 Translating transcript and analyzing sentiment...");
//     const { translatedText, sentiment } = await translateAndAnalyzeSentiment(transcriptedData);
//     console.log("✅ Translation complete. Sentiment:", sentiment);

//     // Classify Case Type (simple heuristic — keep as you had)
//     const classifyIssueType = (desc) => {
//       if (!desc) return "Service Appointment";
//       const serviceKeywords = ["not working", "leak", "repair", "ac not working", "washing machine not working", "issue", "problem", "kharab"];
//       const complaintKeywords = ["complaint", "rude", "delay", "wrong", "poor", "service complaint", "technician complaint"];
//       const lowerDesc = desc.toLowerCase();
//       if (complaintKeywords.some((w) => lowerDesc.includes(w))) return "Complaint";
//       if (serviceKeywords.some((w) => lowerDesc.includes(w))) return "Service Appointment";
//       return "Service Appointment";
//     };
//     const caseType = classifyIssueType(issueDesc);

//     // Get Salesforce token
//     const tokenData = await getSalesforceToken();
//     const accessToken = tokenData.access_token;
//     const instanceUrl = tokenData.instance_url;
//     if (!accessToken || !instanceUrl) throw new Error("Failed to obtain Salesforce token");

//     // Build payload matching Apex CaseRequest field names exactly
//     const payload = {
//       subject: caseType,
//       operation: "insert",
//       user_name: user_name || extracted.user || "Web User",
//       email: email || "",
//       mobile: cleanedMobile,
//       pincode: pincode || "",
//       preferred_date: technician_visit_date ? new Date(technician_visit_date).toISOString() : "",
//       preferred_time: technician_visit_date ? new Date(technician_visit_date).toISOString() : "",
//       issuedesc: issueDesc,
//       fulladdress: fullAddress,
//       recording_link: recordingURL,
//       transcript: translatedText || transcriptedData,
//       conversationDueration: conversationDueration, // NOTE: matches Apex field name misspelling
//       sentiment: sentiment || "Neutral",
//       origin: "Phone",
//       priority: "High",
//       // feedback and rate must map to Apex fields 'feedback' and 'rate'
//       feedback: extracted_feedback || comment || extracted.comment || "",
//       rate: extracted_rate || rating || extracted.rating || "",
//     };

//     console.log("➡️ Sending to Salesforce Apex REST:", payload);

//     const sfResponse = await axios.post(
//       `${instanceUrl}/services/apexrest/caseService`,
//       payload,
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json",
//         },
//         httpsAgent: agent,
//       }
//     );

//     // Build case id / number for emails, messages
//     const caseNumber = sfResponse.data?.caseNumber || sfResponse.data?.caseNum || sfResponse.data?.CaseNumber || "";
//     const caseId = sfResponse.data?.caseId || sfResponse.data?.id || "";
//     const mailTo = sfResponse.data?.email || email || "";

//     const caseRef = caseNumber ? `SR-${caseNumber}` : caseId || "SR-UNKNOWN";

//     // Prepare user email body (you can reuse your previous template)
//     const serviceTime = technician_visit_date ? new Date(technician_visit_date).toLocaleString("en-IN") : "";
//     const emailHTML = `
//       <h2 style="color: #004d40;">G&B Service Update</h2>
//       <p>Dear ${user_name || "Customer"},</p>
//       <p>We’ve received your request for <b>${issueDesc}</b>.</p>
//       <p><b>Case ID:</b> ${caseRef}</p>
//       <p><b>Registered Address:</b><br/>${fullAddress}</p>
//       <p><b>Service Time:</b> ${serviceTime}</p>
//       <p><b>Registered Phone:</b> ${cleanedMobile}<br/><b>Registered Email:</b> ${mailTo}</p>
//       <p style="margin-top: 30px;">Regards,<br/><b>G&B Service Team</b></p>
//     `;

//     // Send email (if email exists)
//     if (mailTo) {
//       await sendMail({
//         to: mailTo,
//         subject: `G&B Service Update — Case ${caseRef}`,
//         html: emailHTML,
//       });
//     }

//     // WhatsApp template notification (use WHATSAPP_TOKEN env var)
//     try {
//       const whatsappMobile = cleanedMobile.replace(/^(\+91|91)/, "");
//       const parameters = [
//         user_name || "Customer",
//         issueDesc || "Service Request",
//         caseRef,
//         fullAddress || "Address not provided",
//         serviceTime || "Service time not provided",
//         mailTo || "",
//       ];
//       const whatsappPayload = {
//         messaging_product: "whatsapp",
//         to: "91" + whatsappMobile,
//         type: "template",
//         template: {
//           name: "gb_service_update",
//           language: { code: "en" },
//           components: [{ type: "body", parameters: parameters.map((t) => ({ type: "text", text: t })) }],
//         },
//       };
//       const whatsappResponse = await axios.post(
//         "https://graph.facebook.com/v22.0/475003915704924/messages",
//         whatsappPayload,
//         {
//           headers: {
//             Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
//             "Content-Type": "application/json",
//             "Accept-Encoding": "identity",
//           },
//           httpsAgent: agent,
//         }
//       );
//       console.log("✅ WhatsApp response:", whatsappResponse.data);
//     } catch (waErr) {
//       console.warn("⚠️ WhatsApp send failed:", waErr?.response?.data || waErr.message || waErr);
//     }

//     // Final response to caller
//     res.status(200).json({
//       success: true,
//       message: "Salesforce Case created and notifications attempted",
//       salesforceResponse: sfResponse.data,
//     });
//   } catch (error) {
//     console.error("❌ Webhook error:", error.response?.data || error.message || error);
//     res.status(500).json({
//       success: false,
//       error: error.response?.data || error.message || String(error),
//     });
//   }
// });

// module.exports = router;


// const express = require("express");
// const router = express.Router();
// const axios = require("axios");
// const sendMail = require("../utils/sendMail");
// const spokenToEmail = require("../utils/spokenToEmail");
// const https = require("https");
// const agent = new https.Agent({ rejectUnauthorized: false });
// const OpenAI = require("openai");
// require("dotenv").config();

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// // Function to translate transcript to English and analyze sentiment
// async function translateAndAnalyzeSentiment(transcript) {
//   try {
//     if (!transcript || transcript.trim() === "") {
//       return {
//         translatedText: "",
//         sentiment: "Neutral",
//       };
//     }

//     const completion = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: [
//         {
//           role: "system",
//           content: `You are a helpful assistant that translates text to English and analyzes sentiment. 
//           For the given transcript:
//           1. Translate it to English if it's in another language (if already in English, return as is)
//           2. Analyze the overall sentiment and classify it as one of: Positive, Negative, or Neutral
          
//           Respond in JSON format with two fields:
//           {
//             "translatedText": "the English translation",
//             "sentiment": "Positive/Negative/Neutral"
//           }`,
//         },
//         {
//           role: "user",
//           content: transcript,
//         },
//       ],
//       temperature: 0.3,
//       response_format: { type: "json_object" },
//     });

//     const result = JSON.parse(completion.choices[0].message.content);
//     return {
//       translatedText: result.translatedText || transcript,
//       sentiment: result.sentiment || "Neutral",
//     };
//   } catch (error) {
//     console.error("❌ Error in translation/sentiment analysis:", error.message);
//     return {
//       translatedText: transcript,
//       sentiment: "Neutral",
//     };
//   }
// }

// router.post("/", async (req, res) => {
//   try {
//     const extracted = req.body.extracted_data;
//     const telephoneData = req.body.telephony_data;
//     const transcriptedData = req.body.transcript;
//     let conversationDueration = req.body.conversation_duration;

//     function formatDuration(seconds) {
//       const totalMilliseconds = Math.floor(seconds * 1000);

//       const minutes = Math.floor(totalMilliseconds / 60000);
//       const remainingAfterMinutes = totalMilliseconds % 60000;

//       const secs = Math.floor(remainingAfterMinutes / 1000);
//       const milliseconds = remainingAfterMinutes % 1000;

//       let result = "";
//       if (minutes > 0) result += `${minutes} min `;
//       if (secs > 0) result += `${secs} sec `;
//       if (milliseconds > 0) result += `${milliseconds} ms`;

//       return result.trim() || "0 sec";
//     }

//     conversationDueration = formatDuration(conversationDueration);

//     if (!extracted) {
//       return res
//         .status(400)
//         .json({ error: "No extracted_data found in payload" });
//     }

//     let {
//       user_name,
//       mobile,
//       pincode,
//       technician_visit_date,
//       issuedesc,
//       fulladdress,
//     } = extracted;

//     let recordingURL = telephoneData?.recording_url || " ";
//     let issueDesc = issuedesc;
//     let fullAddress = fulladdress;
//     let predDate = new Date(technician_visit_date).toLocaleString();

//     const classifyIssueType = (desc) => {
//       if (!desc) return "Service Appointment";

//       const serviceKeywords = [
//         "not working",
//         "leak",
//         "water leaking",
//         "kharab",
//         "repair",
//         "ac not working",
//         "washing machine not working",
//         "issue",
//         "problem",
//       ];

//       const complaintKeywords = [
//         "complaint",
//         "rude",
//         "delay",
//         "wrong",
//         "poor",
//         "service complaint",
//         "technician complaint",
//       ];

//       const lowerDesc = desc.toLowerCase();

//       if (complaintKeywords.some((word) => lowerDesc.includes(word))) {
//         return "Complaint";
//       }

//       if (serviceKeywords.some((word) => lowerDesc.includes(word))) {
//         return "Service Appointment";
//       }

//       return "Service Appointment";
//     };

//     const caseType = classifyIssueType(issueDesc);
//     console.log("🧠 Case Type:", caseType);

//     // Salesforce Token
//     const tokenResponse = await axios.post(
//       "https://login.salesforce.com/services/oauth2/token",
//       new URLSearchParams({
//         grant_type: "password",
//         client_id: process.env.SALESFORCE_CLIENT_ID,
//         client_secret: process.env.SALESFORCE_CLIENT_SECRET,
//         username: process.env.SALESFORCE_USERNAME,
//         password: process.env.SALESFORCE_PASSWORD,
//       }),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       },
//     );

//     const accessToken = tokenResponse.data.access_token;

//     console.log("🔄 Translating transcript and analyzing sentiment...");
//     const { translatedText, sentiment } =
//       await translateAndAnalyzeSentiment(transcriptedData);
//     console.log("✅ Translation complete. Sentiment:", sentiment);

//     const sfResponse = await axios.post(
//       "https://orgfarm-eb022cf662-dev-ed.develop.my.salesforce.com/services/apexrest/caseService",
//       {
//         Subject: caseType,
//         operation: "insert",
//         user_name,
//         Mobile: mobile,
//         Pincode: pincode,
//         issuedesc: issueDesc,
//         fulladdress: fullAddress,
//         email: " ",
//         preferred_date: predDate,
//         recording_link: recordingURL,
//         transcript: translatedText,
//         conversationDueration,
//         sentiment,
//         Origin: "Phone",
//         Priority: "High",
//     rate: extracted.rate || extracted.rating || "",         // e.g. '5' or '4.5'
//     feedback: extracted.feedback || extracted.comment || "",
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json",
//         },
//       },
//     );

//     const caseId = "SR-" + sfResponse.data.caseNumber;
//     const email = sfResponse.data.email || "";
//     const issueDescription = issueDesc || "";
//     const slaInfo = "City – Technician visit within 24 hours";
//     const registeredAddress = fullAddress || "";
//     const serviceTime = new Date(technician_visit_date).toLocaleString(
//       "en-IN",
//       {
//         day: "2-digit",
//         month: "short",
//         year: "numeric",
//         hour: "2-digit",
//         minute: "2-digit",
//         second: "2-digit",
//         hour12: true,
//       },
//     );

//     const emailHTML = `
//     <h2 style="color: #004d40;">G&B Service Update</h2>
//     <p>Dear ${user_name},</p>
//     <p>We’ve received your request for <b>${issueDescription}</b>.</p>
//     <p>
//       <b>Case ID:</b> ${caseId}<br/>
//       <b>SLA:</b> ${slaInfo}
//     </p>
//     <p>
//       <b>Registered Address:</b><br/>
//       ${registeredAddress}<br/>
//       <b>Service Time:</b> ${serviceTime}
//     </p>
//     <p>
//       <b>Registered Phone:</b> ${mobile}<br/>
//       <b>Registered Email:</b> ${email}
//     </p>
//     <p style="margin-top: 30px;">Regards,<br/><b>G&B Service Team</b></p>
// `;

//     await sendMail({
//       to: email,
//       subject: `G&B Service Update — Case ${caseId}`,
//       html: emailHTML,
//     });

//     const parameters = [
//       user_name || "Dummy Name",
//       issueDesc || "Dummy Issue",
//       caseId,
//       fullAddress || "Dummy Address",
//       predDate || "Dummy Date",
//       mobile,
//     ];

//     const whatsappMobile = mobile.replace(/^(\+91|91)/, "");
//     const whatsappPayload = {
//       messaging_product: "whatsapp",
//       to: "91" + whatsappMobile,
//       type: "template",
//       template: {
//         name: "gb_service_update",
//         language: { code: "en" },
//         components: [
//           {
//             type: "body",
//             parameters: parameters.map((text) => ({ type: "text", text })),
//           },
//         ],
//       },
//     };

//     const whatsappResponse = await axios.post(
//       "https://graph.facebook.com/v22.0/475003915704924/messages",
//       whatsappPayload,
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
//           "Content-Type": "application/json",
//           "Accept-Encoding": "identity",
//         },
//       },
//     );

//     res.status(200).json({
//       success: true,
//       message: "Salesforce Case created, and WhatsApp message delivered",
//       salesforceResponse: sfResponse.data,
//       whatsappResponse: whatsappResponse.data,
//     });
//   } catch (error) {
//     console.error("❌ Webhook error:", error.response?.data || error.message);
//     res.status(500).json({
//       success: false,
//       error: error.response?.data || error.message,
//     });
//   }
// });

// module.exports = router;
