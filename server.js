require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");

// Initialise Firebase Admin first (all other services depend on it)
const { db } = require("./services/firebaseAdmin");

const judgeCpp       = require("./services/judgeCpp");
const compileCpp     = require("./services/compileCpp");
const runCpp         = require("./services/runCpp");
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

function cleanup(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

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
    const { problemId, code } = req.body;
    console.log(`\n▶️  [Run Route] problemId="${problemId}" code length=${code?.length ?? 0}`);

    if (!problemId || !code) {
        return res.status(400).json({
            success: false,
            verdict: "Bad Request",
            message: "problemId and code are required",
        });
    }

    // 1. Fetch sample test cases from Firestore
    let sampleTestCases = [];
    let timeLimit = 2000;
    try {
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
    } catch (err) {
        console.error("[Run Route] Firestore error:", err.message);
        return res.status(500).json({
            success: false,
            verdict: "Internal Error",
            message: err.message,
        });
    }

    // 2. Compile
    const compileResult = await compileCpp(code);
    if (!compileResult.success) {
        return res.json({
            success: false,
            verdict: compileResult.verdict,
            compileError: compileResult.output,
            results: [],
        });
    }

    // 3. Run each sample test case
    const results = [];
    let earlyExit = false;

    for (let i = 0; i < sampleTestCases.length; i++) {
        const tc = sampleTestCases[i];
        const start = Date.now();
        const runResult = await runCpp(compileResult.exePath, tc.input, timeLimit);
        const elapsed = Date.now() - start;

        const got      = runResult.output != null ? runResult.output.trim() : "";
        const expected = tc.output.trim();
        const passed   = runResult.success && got === expected;

        results.push({
            index:    i + 1,
            input:    tc.input,
            expected: tc.output,
            structuredInput: tc.structuredInput ?? null,
            got:      runResult.success ? runResult.output : (runResult.output || ""),
            passed,
            verdict:  passed ? "Accepted" : (runResult.success ? "Wrong Answer" : runResult.verdict),
            time:     `${elapsed}ms`,
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

    cleanup(compileResult.submissionDir);

    const allPassed   = results.every(r => r.passed);
    const firstFailed = results.find(r => !r.passed);

    return res.json({
        success: allPassed,
        verdict: allPassed ? "All Samples Passed" : (firstFailed?.verdict ?? "Wrong Answer"),
        results,
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Compiler server running on port ${PORT}`);
});