const axios = require("axios");

// Test data with different scenarios
const testCases = [
  {
    name: "Test 1: Hindi Transcript (Positive Sentiment)",
    payload: {
      extracted_data: {
        user_name: "Test User",
        mobile: "9876543210",
        pincode: "110001",
        technician_visit_date: "2026-01-20T10:00:00Z",
        issuedesc: "AC not working",
        fulladdress: "123 Test Street, Delhi",
      },
      telephony_data: {
        recording_url: "https://example.com/recording.mp3",
      },
      transcript:
        "मेरा AC काम नहीं कर रहा है। कृपया जल्दी से technician भेजें। आपकी सेवा बहुत अच्छी है।",
      conversation_duration: 120.5,
    },
  },
  {
    name: "Test 2: English Transcript (Negative Sentiment)",
    payload: {
      extracted_data: {
        user_name: "John Doe",
        mobile: "9123456789",
        pincode: "560001",
        technician_visit_date: "2026-01-21T14:00:00Z",
        issuedesc: "Washing machine leaking",
        fulladdress: "456 Main Road, Bangalore",
      },
      telephony_data: {
        recording_url: "https://example.com/recording2.mp3",
      },
      transcript:
        "I am very disappointed with your service. The washing machine is still leaking after the last repair. This is unacceptable!",
      conversation_duration: 85.3,
    },
  },
  {
    name: "Test 3: Mixed Language (Neutral Sentiment)",
    payload: {
      extracted_data: {
        user_name: "Priya Sharma",
        mobile: "9988776655",
        pincode: "400001",
        technician_visit_date: "2026-01-22T11:00:00Z",
        issuedesc: "Refrigerator issue",
        fulladdress: "789 Park Avenue, Mumbai",
      },
      telephony_data: {
        recording_url: "https://example.com/recording3.mp3",
      },
      transcript:
        "Hello, मुझे refrigerator में problem है। Please send someone to check it.",
      conversation_duration: 65.0,
    },
  },
  {
    name: "Test 4: Empty Transcript",
    payload: {
      extracted_data: {
        user_name: "Test Empty",
        mobile: "9000000000",
        pincode: "600001",
        technician_visit_date: "2026-01-23T09:00:00Z",
        issuedesc: "General inquiry",
        fulladdress: "000 Test Street, Chennai",
      },
      telephony_data: {
        recording_url: "",
      },
      transcript: "",
      conversation_duration: 10.0,
    },
  },
];

// Configuration
const WEBHOOK_URL = "http://localhost:5001/webhook"; // Update this if your server runs on a different port
const DELAY_BETWEEN_TESTS = 3000; // 3 seconds delay between tests

// Function to run a single test
async function runTest(testCase, index) {
  console.log("\n" + "=".repeat(80));
  console.log(`🧪 Running ${testCase.name}`);
  console.log("=".repeat(80));
  console.log("\n📝 Original Transcript:");
  console.log(testCase.payload.transcript || "(empty)");
  console.log("\n📤 Sending request to webhook...\n");

  try {
    const response = await axios.post(WEBHOOK_URL, testCase.payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
    });

    console.log("✅ Response Status:", response.status);
    console.log("\n📥 Response Data:");
    console.log(JSON.stringify(response.data, null, 2));

    return { success: true, testName: testCase.name };
  } catch (error) {
    console.error("❌ Test Failed!");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error(
        "Error Data:",
        JSON.stringify(error.response.data, null, 2),
      );
    } else if (error.request) {
      console.error("No response received. Is the server running?");
      console.error("Error:", error.message);
    } else {
      console.error("Error:", error.message);
    }

    return { success: false, testName: testCase.name, error: error.message };
  }
}

// Function to run all tests
async function runAllTests() {
  console.log("\n🚀 Starting Webhook Translation & Sentiment Analysis Tests");
  console.log("📍 Target URL:", WEBHOOK_URL);
  console.log("📊 Total Tests:", testCases.length);

  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const result = await runTest(testCases[i], i);
    results.push(result);

    // Add delay between tests (except for the last one)
    if (i < testCases.length - 1) {
      console.log(
        `\n⏳ Waiting ${DELAY_BETWEEN_TESTS / 1000} seconds before next test...`,
      );
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_TESTS));
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(80));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\n✅ Passed: ${passed}/${testCases.length}`);
  console.log(`❌ Failed: ${failed}/${testCases.length}`);

  if (failed > 0) {
    console.log("\n❌ Failed Tests:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.testName}: ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(80));
}

// Run tests
runAllTests().catch((error) => {
  console.error("\n💥 Fatal Error:", error);
  process.exit(1);
});
