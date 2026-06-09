require("dotenv").config();

const express = require("express");
const cors = require("cors");

// Initialise Firebase Admin first (all other services depend on it)
require("./services/firebaseAdmin");

const judgeCpp = require("./services/judgeCpp");
const saveSubmission = require("./services/saveSubmission");
const { authenticateToken } = require("./services/auth");

const app = express();

app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3001",
    ],
    methods: ["POST", "GET", "OPTIONS"],
}));

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Compiler Server Running");
});

/* ─────────────────────────────────────────
   POST /submit
   Body: { problemId, code }
   Response: { success, verdict, passed, total }
───────────────────────────────────────── */
app.post("/submit", authenticateToken, async (req, res) => {
    const { problemId, code } = req.body;
    const userId = req.user.uid;
    console.log(`\n📬 [Submit Route] Received submission request:`);
    console.log(`   - problemId: "${problemId}"`);
    console.log(`   - userId:    "${userId}"`);
    console.log(`   - code length: ${code ? code.length : 0} characters`);

    if (!problemId || !code) {
        console.warn(`⚠️ [Submit Route] Missing problemId or code in request body!`);
        return res.status(400).json({
            success: false,
            verdict: "Bad Request",
            message: "problemId and code are required",
        });
    }

    let result;
    try {
        console.log(`⚡ [Submit Route] Forwarding to judgeCpp...`);
        result = await judgeCpp(problemId, code);
        console.log(`✅ [Submit Route] judgeCpp finished successfully.`);
        console.log(`   - Verdict: ${result.verdict}`);
        console.log(`   - Passed:  ${result.passed} / ${result.total}`);
    } catch (err) {
        console.error(`❌ [Submit Route] Error occurred during judgeCpp:`, err);
        return res.status(500).json({
            success: false,
            verdict: "Internal Error",
            message: err.message,
        });
    }

    // Persist submission if we have a userId (fire-and-forget — don't block response)
    if (userId) {
        console.log(`💾 [Submit Route] Saving submission to database for userId: "${userId}"...`);
        saveSubmission({
            userId,
            problemId,
            verdict: result.verdict,
            passed: result.passed,
            total: result.total,
        }).then(() => {
            console.log(`💾 [Submit Route] Submission saved successfully.`);
        }).catch((err) =>
            console.error(`❌ [Submit Route] saveSubmission failed:`, err.message)
        );
    }

    res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Compiler server running on port ${PORT}`);
});