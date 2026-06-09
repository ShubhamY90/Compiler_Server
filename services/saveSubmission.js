const { db } = require("./firebaseAdmin");

/**
 * Saves a submission record to Firestore.
 *
 * Collection: submissions
 * Document shape:
 *   {
 *     userId,      // Firebase Auth UID
 *     problemId,   // e.g. "maximum-pair-sum"
 *     verdict,     // "Accepted" | "Wrong Answer" | "Time Limit Exceeded" | …
 *     passed,      // number of test cases passed
 *     total,       // total test cases
 *     submittedAt  // Firestore server timestamp
 *   }
 *
 * Returns the new document ID.
 */
async function saveSubmission({ userId, problemId, verdict, passed, total }) {
    const { FieldValue } = require("firebase-admin/firestore");

    const docRef = await db.collection("submissions").add({
        userId,
        problemId,
        verdict,
        passed,
        total,
        submittedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[saveSubmission] saved ${docRef.id} — ${userId} / ${problemId} → ${verdict}`);
    return docRef.id;
}

module.exports = saveSubmission;
