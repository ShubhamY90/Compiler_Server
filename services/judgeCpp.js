const fs = require("fs");

const compileCpp = require("./compileCpp");
const runCpp = require("./runCpp");
const fetchProblem = require("./fetchProblem");

function cleanup(dir) {
    console.log(`🧹 [judgeCpp] Cleaning up temporary directory: "${dir}"`);
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
        console.log(`🧹 [judgeCpp] Cleanup successful.`);
    } catch (err) {
        console.error(`🧹 [judgeCpp] Cleanup failed:`, err);
    }
}

async function judgeCpp(problemId, code) {
    console.log(`🏁 [judgeCpp] Starting judging process for problemId: "${problemId}"`);

    // Fetch hidden test cases from Firestore
    let problem;
    try {
        console.log(`🏁 [judgeCpp] Fetching problem data from Firestore...`);
        problem = await fetchProblem(problemId);
        console.log(`🏁 [judgeCpp] Problem data fetched successfully.`);
        console.log(`   - Number of test cases: ${problem.testCases ? problem.testCases.length : 0}`);
        console.log(`   - Time Limit: ${problem.timeLimit || 2000}ms`);
    } catch (fetchErr) {
        console.error(`🏁 [judgeCpp] Failed to fetch problem:`, fetchErr);
        throw fetchErr;
    }

    const total = problem.testCases.length;
    let passed = 0;

    console.log(`🏁 [judgeCpp] Starting compile phase...`);
    const compileResult = await compileCpp(code);

    if (!compileResult.success) {
        console.warn(`🏁 [judgeCpp] Compilation failed! Verdict is "${compileResult.verdict}". Skipping test cases execution.`);
        return {
            success: false,
            verdict: compileResult.verdict,
            passed,
            total
        };
    }

    console.log(`🏁 [judgeCpp] Compilation succeeded! Starting test cases execution...`);

    for (let i = 0; i < total; i++) {
        console.log(`🏁 [judgeCpp] Running test case #${i + 1} / ${total}`);
        const testCase = problem.testCases[i];

        console.log(`   - Input length:  ${testCase.input ? testCase.input.length : 0} chars`);
        console.log(`   - Input sample:  "${testCase.input.substring(0, 100).replace(/\n/g, '\\n')}${testCase.input.length > 100 ? '...' : ''}"`);
        console.log(`   - Output sample: "${testCase.output.substring(0, 100).replace(/\n/g, '\\n')}${testCase.output.length > 100 ? '...' : ''}"`);

        const result = await runCpp(
            compileResult.exePath,
            testCase.input,
            problem.timeLimit || 2000
        );

        console.log(`   - Execution verdict: ${result.success ? 'Success' : 'Failed'} (${result.verdict || 'N/A'})`);

        if (!result.success) {
            console.warn(`🏁 [judgeCpp] Test case #${i + 1} execution failed with verdict: "${result.verdict}"`);
            cleanup(compileResult.submissionDir);
            return {
                success: false,
                verdict: result.verdict,
                passed,
                total
            };
        }

        const cleanOutput = result.output.trim();
        const cleanExpected = testCase.output.trim();

        if (cleanOutput !== cleanExpected) {
            console.warn(`🏁 [judgeCpp] Test case #${i + 1} output mismatch!`);
            console.warn(`   - Expected: "${cleanExpected.substring(0, 100).replace(/\n/g, '\\n')}${cleanExpected.length > 100 ? '...' : ''}"`);
            console.warn(`   - Got:      "${cleanOutput.substring(0, 100).replace(/\n/g, '\\n')}${cleanOutput.length > 100 ? '...' : ''}"`);
            cleanup(compileResult.submissionDir);
            return {
                success: false,
                verdict: "Wrong Answer",
                passed,
                total
            };
        }

        console.log(`🏁 [judgeCpp] Test case #${i + 1} passed!`);
        passed++;
    }

    console.log(`🏁 [judgeCpp] All test cases passed successfully (${passed}/${total})!`);
    cleanup(compileResult.submissionDir);

    return {
        success: true,
        verdict: "Accepted",
        passed,
        total
    };
}

module.exports = judgeCpp;