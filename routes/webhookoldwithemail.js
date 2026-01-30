const express = require("express");
const router = express.Router();
const axios = require("axios");
const sendMail = require("../utils/sendMail");
const spokenToEmail = require("../utils/spokenToEmail");
const https = require("https");
const agent = new https.Agent({ rejectUnauthorized: false });

router.post("/", async (req, res) => {
  try {
    console.log("📦 Webhook received payload:", JSON.stringify(req.body, null, 2));

    const extracted = req.body.extracted_data;
    if (!extracted) {
      return res.status(400).json({ error: "No extracted_data found in payload" });
    }

    let { email, user_name, mobile, pincode, technician_visit_date, issueDesc, fullAddress } = extracted;

    email = spokenToEmail(email);
    let date = technician_visit_date;
    //Step 1 to Create Case in Salesforce

    
    const sfResponse = await axios.post(
      "https://orgfarm-eb022cf662-dev-ed.develop.my.salesforce.com/services/data/v55.0/sobjects/Case",
      {
        Subject: "G&B Service Update — Case SR-456789",
        Description: `Service appointment details:
        Name: ${user_name}
        Email: ${email}
        Mobile: ${mobile}
        Pincode: ${pincode}
        Preferred Date: ${new Date(date).toLocaleString()}`,
        Origin: "Web",
        Priority: "High",
        AccountId: "001dL00001a4200QAA",
        ContactId: "003dL00001O3sXRQAZ",
      },
      {
        headers: {
          Authorization: `Bearer !AQEAQJYLrj82qtFshsrdL7nkUSSP3oqApLd7SA6ahyLVLeiZosDpRawFjwLY.dzb3dQhroXY5BDVKvMpCDkwd5ogu.Npw4MZ`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Salesforce Case created:", sfResponse.data);

    const caseId = 'SR-'+ sfResponse.data.id; // You can replace this dynamically
    const issueDescription = issueDesc || "";
    const slaInfo = "City – Technician visit within 24 hours";
    const registeredAddress = fullAddress || "";
    const serviceTime = new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

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

    <p>Please confirm or update your address before our technician visit.</p>

    <p style="margin-top: 30px;">Regards,<br/><b>G&B Service Team</b></p>
  
`;

    const emailResponse = await sendMail({
      to: email,
      subject: `G&B Service Update — Case ${caseId}`,
      html: emailHTML,
    });

const parameters = [
  `Dear ${user_name},`,
  `Issue Description: ${issueDesc}`,
  `Case ID: ${caseId}`,
  `Registered Address: ${fullAddress}`,
  `Service Time: ${new Date(date).toLocaleString()}`,
  `Registered Email: ${email}`,
];
    const whatsappMobile = mobile.replace(/^(\+91|91)/, '');
    const whatsappPayload = {
      "messaging_product": "whatsapp",
      "to": "91" + whatsappMobile,
      "type": "template",
      "template": {
        "name": "gb_service_update",
        "language": { "code": "en" },
        "components": [
          {
            "type": "body",
            "parameters": parameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    };


    const whatsappResponse = await axios.post(
      "https://graph.facebook.com/v22.0/475003915704924/messages",
      whatsappPayload,
      {
        headers: {
          Authorization: 'Bearer EAAOFhGXyhz4BOy7VDorJg3nW8tZBkeJXaGvW63EHPEjJOcYk9HGflZCEHVZCIoXdwzsBPNqcR5MeNytDMw0p95NA8NphHtp9vuk7lynXO3HoHmPaJF7R7gPpL3DsUuEOZANUmTdibSEFSGr0LxGxT18x9R6hUtBhwEJRpBwMk5cpZBAPkZCQxHq7E8bnzcEVft8AZDZD',
          "Content-Type": "application/json",
          "Accept-Encoding": "identity",

        },
      }
    );

    res.status(200).json({
      success: true,
      message: "Email sent, Salesforce Case created, and WhatsApp message delivered",
      emailto: email,
      emailResponse,
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
