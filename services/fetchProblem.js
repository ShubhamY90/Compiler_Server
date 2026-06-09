const { db } = require("./firebaseAdmin");

/**
 * Fetches hidden test cases for a given problemId from Firestore.
 *
 * Firestore document: problem_testcases/{problemId}
 *   hiddenTestCases: [{ input: string, output: string }, ...]
 *
 * Also reads timeLimit from problems/{problemId} if available.
 *
 * Returns:
 *   { testCases: [{ input, output }], timeLimit: number (ms) }
 */
async function fetchProblem(problemId) {
    const [testcasesSnap, problemSnap] = await Promise.all([
        db.collection("problem_testcases").doc(problemId).get(),
        db.collection("problems").doc(problemId).get(),
    ]);

    if (!testcasesSnap.exists) {
        throw new Error(
            `No test cases found in Firestore for problemId: "${problemId}"`
        );
    }

    const data = testcasesSnap.data();
    const hiddenTestCases = data.hiddenTestCases;

    if (!Array.isArray(hiddenTestCases) || hiddenTestCases.length === 0) {
        throw new Error(
            `hiddenTestCases is empty or missing for problemId: "${problemId}"`
        );
    }

    const testCases = hiddenTestCases.map((tc, i) => {
        if (tc.input === undefined || tc.output === undefined) {
            throw new Error(
                `hiddenTestCases[${i}] for "${problemId}" is missing input or output`
            );
        }
        return {
            input: String(tc.input).replace(/\\n/g, '\n'),
            output: String(tc.output).replace(/\\n/g, '\n')
        };
    });

    let timeLimit = 2000;
    if (problemSnap.exists) {
        const pd = problemSnap.data();
        if (pd.timeLimit != null) {
            timeLimit = pd.timeLimit <= 60
                ? pd.timeLimit * 1000
                : pd.timeLimit;
        }
    }

    return { testCases, timeLimit };
}

module.exports = fetchProblem;
