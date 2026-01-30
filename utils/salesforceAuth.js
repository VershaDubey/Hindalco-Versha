const axios = require("axios");

let cachedToken = null;
let tokenExpiryTime = null; // epoch ms

async function fetchNewToken() {
  console.log("🔐 Fetching new Salesforce token...");

  const response = await axios.post(
    "https://login.salesforce.com/services/oauth2/token",
    new URLSearchParams({
      grant_type: "password",
      client_id: process.env.SF_CLIENT_ID,
      client_secret: process.env.SF_CLIENT_SECRET,
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  cachedToken = response.data.access_token;

  // Salesforce usually gives expires_in (seconds)
  const expiresIn = response.data.expires_in || 3600;

  // Refresh 1 min before expiry
  tokenExpiryTime = Date.now() + (expiresIn - 60) * 1000;

  return cachedToken;
}

async function getSalesforceToken() {
  // If token exists & not expired
  if (cachedToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
    return cachedToken;
  }

  // Else fetch new token
  return await fetchNewToken();
}

function clearToken() {
  cachedToken = null;
  tokenExpiryTime = null;
}

module.exports = {
  getSalesforceToken,
  clearToken,
};
