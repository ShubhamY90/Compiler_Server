require("dotenv").config();

const express = require("express");
const cors    = require("cors");

// Initialise Firebase Admin first (all other services depend on it)
require("./services/firebaseAdmin");

const judgeCpp       = require("./services/judgeCpp");
const saveSubmission = require("./services/saveSubmission");

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

/* ─────────────────────────────────────────
   POST /submit
   Body: { problemId, code, userId? }
   Response: { success, verdict, passed, total }
───────────────────────────────────────── */
app.post("/submit", async (req, res) => {
    const { problemId, code, userId } = req.body;

    if (!problemId || !code) {
        return res.status(400).json({
            success: false,
            verdict: "Bad Request",
            message: "problemId and code are required",
        });
    }

    let result;
    try {
        result = await judgeCpp(problemId, code);
    } catch (err) {
        console.error("[/submit] Judge error:", err.message);
        return res.status(500).json({
            success: false,
            verdict: "Internal Error",
            message: err.message,
        });
    }

    // Persist submission if we have a userId (fire-and-forget — don't block response)
    if (userId) {
        saveSubmission({
            userId,
            problemId,
            verdict:  result.verdict,
            passed:   result.passed,
            total:    result.total,
        }).catch((err) =>
            console.error("[/submit] saveSubmission failed:", err.message)
        );
    }

    res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Compiler server running on port ${PORT}`);
});