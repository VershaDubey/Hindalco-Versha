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

// Test cases
const testTranscripts = [
  {
    name: "Hindi - Positive",
    text: "मेरा AC काम नहीं कर रहा है। कृपया जल्दी से technician भेजें। आपकी सेवा बहुत अच्छी है।",
  },
  {
    name: "English - Negative",
    text: "I am very disappointed with your service. The washing machine is still leaking after the last repair. This is unacceptable!",
  },
  {
    name: "Hindi - Complaint",
    text: "मुझे बहुत गुस्सा आ रहा है। तीन बार technician आया लेकिन problem अभी भी ठीक नहीं हुई।",
  },
  {
    name: "English - Positive",
    text: "Thank you so much! The technician was very professional and fixed the issue quickly. Great service!",
  },
  {
    name: "Mixed Language - Neutral",
    text: "Hello, मुझे refrigerator में problem है। Please send someone to check it.",
  },
  {
    name: "Empty Transcript",
    text: "",
  },
];

// Run tests
async function runTests() {
  console.log("🧪 Testing Translation & Sentiment Analysis Function\n");
  console.log("=".repeat(80));

  // Check if API key is set
  if (
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY === "your_openai_api_key_here"
  ) {
    console.error("\n❌ ERROR: OpenAI API key not configured!");
    console.error("Please set your OPENAI_API_KEY in the .env file\n");
    process.exit(1);
  }

  console.log("✅ OpenAI API Key found\n");
  console.log("=".repeat(80));

  for (let i = 0; i < testTranscripts.length; i++) {
    const test = testTranscripts[i];

    console.log(`\n📝 Test ${i + 1}: ${test.name}`);
    console.log("-".repeat(80));
    console.log("Original Text:");
    console.log(test.text || "(empty)");
    console.log("\n🔄 Processing...\n");

    try {
      const result = await translateAndAnalyzeSentiment(test.text);

      console.log("✅ Result:");
      console.log("  📄 Translated Text:", result.translatedText || "(empty)");
      console.log("  😊 Sentiment:", result.sentiment);
    } catch (error) {
      console.error("❌ Error:", error.message);
    }

    console.log("-".repeat(80));

    // Small delay between tests to avoid rate limiting
    if (i < testTranscripts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ All tests completed!");
  console.log("=".repeat(80) + "\n");
}

// Run the tests
runTests().catch((error) => {
  console.error("\n💥 Fatal Error:", error);
  process.exit(1);
});
