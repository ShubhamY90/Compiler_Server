const fs = require("fs");
const { getLanguageConfig } = require("./languageConfig");
const runCode = require("./runCode");
const fetchProblem = require("./fetchProblem");

function cleanup(dir) {
    console.log(`🧹 [judgeCode] Cleaning up temporary directory: "${dir}"`);
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
        console.log(`🧹 [judgeCode] Cleanup successful.`);
    } catch (err) {
        console.error(`🧹 [judgeCode] Cleanup failed:`, err);
    }
}

async function judgeCode(problemId, code, language = "cpp") {
    console.log(`🏁 [judgeCode] Starting judging process for problemId: "${problemId}", language: "${language}"`);

    // Fetch hidden test cases from Firestore
    let problem;
    try {
        console.log(`🏁 [judgeCode] Fetching problem data from Firestore...`);
        problem = await fetchProblem(problemId);
        console.log(`🏁 [judgeCode] Problem data fetched successfully.`);
        console.log(`   - Number of test cases: ${problem.testCases ? problem.testCases.length : 0}`);
        console.log(`   - Time Limit: ${problem.timeLimit || 2000}ms`);
    } catch (fetchErr) {
        console.error(`🏁 [judgeCode] Failed to fetch problem:`, fetchErr);
        throw fetchErr;
    }

    const total = problem.testCases ? problem.testCases.length : 0;
    let passed = 0;

    const { compile, command, args } = getLanguageConfig(language);

    console.log(`🏁 [judgeCode] Starting compile phase...`);
    let compileResult;
    try {
        compileResult = await compile(code);

        if (!compileResult.success) {
            console.warn(`🏁 [judgeCode] Compilation failed! Verdict is "${compileResult.verdict}". Skipping test cases execution.`);
            return {
                success: false,
                verdict: compileResult.verdict,
                compileError: compileResult.output,
                passed,
                total
            };
        }

        console.log(`🏁 [judgeCode] Compilation succeeded! Starting test cases execution...`);

        const spawnCmd = command(compileResult);
        const spawnArgs = args(compileResult);

        for (let i = 0; i < total; i++) {
            console.log(`🏁 [judgeCode] Running test case #${i + 1} / ${total}`);
            const testCase = problem.testCases[i];

            console.log(`   - Input length:  ${testCase.input ? testCase.input.length : 0} chars`);
            console.log(`   - Input sample:  "${testCase.input.substring(0, 100).replace(/\n/g, '\\n')}${testCase.input.length > 100 ? '...' : ''}"`);
            console.log(`   - Output sample: "${testCase.output.substring(0, 100).replace(/\n/g, '\\n')}${testCase.output.length > 100 ? '...' : ''}"`);

            const result = await runCode(
                spawnCmd,
                spawnArgs,
                language,
                testCase.input,
                problem.timeLimit || 2000
            );

            console.log(`   - Execution verdict: ${result.success ? 'Success' : 'Failed'} (${result.verdict || 'N/A'})`);

            if (!result.success) {
                console.warn(`🏁 [judgeCode] Test case #${i + 1} execution failed with verdict: "${result.verdict}"`);
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
                console.warn(`🏁 [judgeCode] Test case #${i + 1} output mismatch!`);
                console.warn(`   - Expected: "${cleanExpected.substring(0, 100).replace(/\n/g, '\\n')}${cleanExpected.length > 100 ? '...' : ''}"`);
                console.warn(`   - Got:      "${cleanOutput.substring(0, 100).replace(/\n/g, '\\n')}${cleanOutput.length > 100 ? '...' : ''}"`);
                return {
                    success: false,
                    verdict: "Wrong Answer",
                    passed,
                    total
                };
            }

            console.log(`🏁 [judgeCode] Test case #${i + 1} passed!`);
            passed++;
        }

        console.log(`🏁 [judgeCode] All test cases passed successfully (${passed}/${total})!`);
        return {
            success: true,
            verdict: "Accepted",
            passed,
            total
        };

    } finally {
        if (compileResult && compileResult.submissionDir) {
            cleanup(compileResult.submissionDir);
        }
    }
}

module.exports = judgeCode;
