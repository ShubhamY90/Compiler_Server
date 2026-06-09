const fs = require("fs");

const compileCpp = require("./compileCpp");
const runCpp = require("./runCpp");
const fetchProblem = require("./fetchProblem");

function cleanup(dir) {
    try {
        fs.rmSync(dir, {
            recursive: true,
            force: true
        });
    } catch (err) {
        console.error(err);
    }
}

async function judgeCpp(problemId, code) {

    // Fetch hidden test cases from Firestore
    const problem = await fetchProblem(problemId);

    const total = problem.testCases.length;

    let passed = 0;

    const compileResult =
        await compileCpp(code);

    if (!compileResult.success) {

        return {
            success: false,
            verdict: compileResult.verdict,
            passed,
            total
        };
    }

    for (let i = 0; i < total; i++) {

        const testCase =
            problem.testCases[i];

        const result =
            await runCpp(
                compileResult.exePath,
                testCase.input,
                problem.timeLimit || 2000
            );

        if (!result.success) {

            cleanup(
                compileResult.submissionDir
            );

            return {
                success: false,
                verdict: result.verdict,
                passed,
                total
            };
        }

        if (
            result.output.trim() !==
            testCase.output.trim()
        ) {

            cleanup(
                compileResult.submissionDir
            );

            return {
                success: false,
                verdict: "Wrong Answer",
                passed,
                total
            };
        }

        passed++;
    }

    cleanup(
        compileResult.submissionDir
    );

    return {
        success: true,
        verdict: "Accepted",
        passed,
        total
    };
}

module.exports = judgeCpp;