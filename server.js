require("dotenv").config();

const redisClient = require("./redis/client");

const express = require("express");
const cors = require("cors");
const fs = require("fs");

// Initialise Firebase Admin first (all other services depend on it)
const { db } = require("./services/firebaseAdmin");

const judgeCode      = require("./services/judgeCode");
const runCode        = require("./services/runCode");
const { getLanguageConfig } = require("./services/languageConfig");
const saveSubmission = require("./services/saveSubmission");
const { authenticateToken } = require("./services/auth");

const app = express();

const configuredOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
    : [];
const corsOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3001",
    "https://code-duel-f.vercel.app",
    "https://cod3duel.netlify.app",
    ...configuredOrigins,
];

app.use(cors({
    origin: corsOrigins,
    methods: ["POST", "GET", "OPTIONS"],
    credentials: true,
}));

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Compiler Server Running");
});

/* ─────────────────────────────────────────
   GET /health
   Checks Redis + Firebase connectivity.
   Returns 200 UP, or 503 DEGRADED/DOWN.
───────────────────────────────────────── */
app.get("/health", async (_req, res) => {
    const health = {
        status: "UP",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        services: {},
    };

    // 1. Redis ping
    try {
        const pong = await redisClient.ping();
        health.services.redis = pong === "PONG" ? "CONNECTED" : "DEGRADED";
        if (pong !== "PONG") health.status = "DEGRADED";
    } catch (err) {
        health.services.redis = "ERROR";
        health.status = "DEGRADED";
    }

    // 2. Firebase / Firestore ping (lightweight read)
    try {
        await db.collection("problems").limit(1).get();
        health.services.firebase = "CONNECTED";
    } catch (err) {
        health.services.firebase = "ERROR";
        health.status = health.status === "UP" ? "DEGRADED" : "DOWN";
    }

    const statusCode = health.status === "UP" ? 200 : 503;
    res.status(statusCode).json(health);
});

function cleanup(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/* ─────────────────────────────────────────
   POST /submit
   Body: { problemId, code }
   Response: { success, verdict, passed, total }
───────────────────────────────────────── */
app.post("/submit", authenticateToken, async (req, res) => {
    const { problemId, code, language } = req.body;
    const userId = req.user.uid;
    const lang = language || "cpp";
    console.log(`\n📬 [Submit Route] Received submission request:`);
    console.log(`   - problemId: "${problemId}"`);
    console.log(`   - userId:    "${userId}"`);
    console.log(`   - language:  "${lang}"`);
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
        console.log(`⚡ [Submit Route] Forwarding to judgeCode...`);
        result = await judgeCode(problemId, code, lang);
        console.log(`✅ [Submit Route] judgeCode finished successfully.`);
        console.log(`   - Verdict: ${result.verdict}`);
        console.log(`   - Passed:  ${result.passed} / ${result.total}`);
    } catch (err) {
        console.error(`❌ [Submit Route] Error occurred during judgeCode:`, err);
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

/* ─────────────────────────────────────────
   POST /run
   Body: { problemId, code }

   Runs the code against SAMPLE (visible) test cases fetched from
   Firestore (problem_testcases/{problemId}.sampleTestCases).
   Does NOT use hidden test cases. Does NOT save to DB.

   Response:
   {
     success: bool,
     verdict: string,
     compileError?: string,        // only on Compile Error
     results: [
       {
         index:    number,
         input:    string,
         expected: string,
         got:      string,
         passed:   bool,
         verdict:  string,        // "Accepted" | "Wrong Answer" | "TLE" | "Runtime Error" | "Skipped"
         time:     string,        // e.g. "47ms"
       }
     ]
   }
───────────────────────────────────────── */
app.post("/run", authenticateToken, async (req, res) => {
    const { problemId, code, customInput, language } = req.body;
    const isCustom = customInput !== undefined && customInput !== null;
    const lang = language || "cpp";
    console.log(`\n▶️  [Run Route] problemId="${problemId}" code length=${code?.length ?? 0} isCustom=${isCustom} language=${lang}`);

    if (!problemId || !code) {
        return res.status(400).json({
            success: false,
            verdict: "Bad Request",
            message: "problemId and code are required",
        });
    }

    // 1. Fetch sample test cases from Firestore or build from customInput
    let sampleTestCases = [];
    let timeLimit = 2000;
    try {
        if (isCustom) {
            sampleTestCases = [{
                input: String(customInput).replace(/\\n/g, "\n"),
                output: "",
                structuredInput: null,
            }];

            const probSnap = await db.collection("problems").doc(problemId).get();
            if (probSnap.exists) {
                const pd = probSnap.data();
                if (pd.timeLimit != null) {
                    timeLimit = pd.timeLimit <= 60 ? pd.timeLimit * 1000 : pd.timeLimit;
                }
            }
        } else {
            const [tcSnap, probSnap] = await Promise.all([
                db.collection("problem_testcases").doc(problemId).get(),
                db.collection("problems").doc(problemId).get(),
            ]);

            if (!tcSnap.exists) {
                return res.status(404).json({
                    success: false,
                    verdict: "Not Found",
                    message: `No test cases found for problem "${problemId}"`,
                });
            }

            const raw = tcSnap.data().sampleTestCases ?? [];
            sampleTestCases = raw.map(tc => ({
                input:  String(tc.input  ?? "").replace(/\\n/g, "\n"),
                output: String(tc.output ?? "").replace(/\\n/g, "\n"),
                structuredInput: tc.structuredInput ?? tc.structured_input ?? null,
            }));

            if (probSnap.exists) {
                const pd = probSnap.data();
                if (pd.timeLimit != null) {
                    timeLimit = pd.timeLimit <= 60 ? pd.timeLimit * 1000 : pd.timeLimit;
                }
            }

            if (sampleTestCases.length === 0) {
                return res.status(404).json({
                    success: false,
                    verdict: "Not Found",
                    message: "No sample test cases configured for this problem.",
                });
            }
        }
    } catch (err) {
        console.error("[Run Route] Firestore error:", err.message);
        return res.status(500).json({
            success: false,
            verdict: "Internal Error",
            message: err.message,
        });
    }

    // 2. Compile
    let compileResult;
    let spawnCmd;
    let spawnArgs;
    try {
        const { compile, command, args } = getLanguageConfig(lang);
        compileResult = await compile(code);
        if (!compileResult.success) {
            return res.json({
                success: false,
                verdict: compileResult.verdict,
                compileError: compileResult.output,
                results: [],
            });
        }
        spawnCmd = command(compileResult);
        spawnArgs = args(compileResult);
    } catch (err) {
        return res.status(400).json({
            success: false,
            verdict: "Bad Request",
            message: err.message
        });
    }

    // 3. Run each test case
    const results = [];
    let earlyExit = false;

    try {
        for (let i = 0; i < sampleTestCases.length; i++) {
            const tc = sampleTestCases[i];
            const start = Date.now();
            const runResult = await runCode(spawnCmd, spawnArgs, lang, tc.input, timeLimit);
            const elapsed = Date.now() - start;

            const got      = runResult.output != null ? runResult.output.trim() : "";
            const expected = tc.output.trim();
            const passed   = isCustom ? runResult.success : (runResult.success && got === expected);

            results.push({
                index:    i + 1,
                input:    tc.input,
                expected: isCustom ? null : tc.output,
                structuredInput: tc.structuredInput ?? null,
                got:      runResult.success ? runResult.output : (runResult.output || ""),
                passed,
                verdict:  isCustom
                    ? (runResult.success ? "Finished" : runResult.verdict)
                    : (passed ? "Accepted" : (runResult.success ? "Wrong Answer" : runResult.verdict)),
                time:     `${elapsed}ms`,
                executionTime: elapsed,
                isCustom
            });

            // On TLE / Runtime Error, skip remaining cases
            if (!runResult.success) {
                for (let j = i + 1; j < sampleTestCases.length; j++) {
                    results.push({
                        index:    j + 1,
                        input:    sampleTestCases[j].input,
                        expected: sampleTestCases[j].output,
                        structuredInput: sampleTestCases[j].structuredInput ?? null,
                        got:      "",
                        passed:   false,
                        verdict:  "Skipped",
                        time:     "—",
                    });
                }
                earlyExit = true;
                break;
            }
        }
    } finally {
        if (compileResult && compileResult.submissionDir) {
            cleanup(compileResult.submissionDir);
        }
    }

    const allPassed   = results.every(r => r.passed);
    const firstFailed = results.find(r => !r.passed);

    return res.json({
        success: allPassed,
        verdict: isCustom
            ? (allPassed ? "Finished" : (firstFailed?.verdict ?? "Runtime Error"))
            : (allPassed ? "All Samples Passed" : (firstFailed?.verdict ?? "Wrong Answer")),
        results,
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Compiler server running on port ${PORT}`);
});

// ── BullMQ worker ─────────────────────────────────────────────────────────────
// Starts alongside the HTTP server. All execution logic stays in services/.
require('./src/worker');