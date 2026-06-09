/**
 * Shared Firebase Admin singleton for the Compiler Server.
 * Import this module anywhere you need `db` — it guarantees Admin
 * is initialised exactly once regardless of require() order.
 */
require("dotenv").config();

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore }                  = require("firebase-admin/firestore");
const path = require("path");
const fs   = require("fs");

if (!getApps().length) {
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        || "./firebase-service-account.json";
    const resolved = path.resolve(process.cwd(), saPath);

    if (!fs.existsSync(resolved)) {
        console.error(`[Firebase] service account not found at ${resolved}`);
        process.exit(1);
    }

    try {
        const sa = JSON.parse(fs.readFileSync(resolved, "utf8"));
        initializeApp({ credential: cert(sa), projectId: sa.project_id });
        console.log(`🔥 Firebase Admin initialized for: ${sa.project_id}`);
    } catch (err) {
        console.error("❌ Firebase Admin init failed:", err.message);
        process.exit(1);
    }
}

const db = getFirestore();
db.settings({ databaseId: "default" });

module.exports = { db };
