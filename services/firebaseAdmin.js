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
    let sa;

    // Prefer inline JSON env var (required on Railway/Render/cloud platforms)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
            sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            console.log("[Firebase] Loaded credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var");
        } catch (err) {
            console.error("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", err.message);
            process.exit(1);
        }
    } else {
        // Fall back to file path (used locally)
        const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
            || "./firebase-service-account.json";
        const resolved = path.resolve(process.cwd(), saPath);

        if (!fs.existsSync(resolved)) {
            console.error(`[Firebase] service account not found at ${resolved}`);
            process.exit(1);
        }

        try {
            sa = JSON.parse(fs.readFileSync(resolved, "utf8"));
            console.log(`[Firebase] Loaded credentials from file: ${resolved}`);
        } catch (err) {
            console.error("[Firebase] Failed to read service account file:", err.message);
            process.exit(1);
        }
    }

    try {
        initializeApp({ credential: cert(sa), projectId: sa.project_id });
        console.log(`🔥 Firebase Admin initialized for: ${sa.project_id}`);
    } catch (err) {
        console.error("❌ Firebase Admin init failed:", err.message);
        process.exit(1);
    }
}

const { getAuth } = require("firebase-admin/auth");

const db = getFirestore();
db.settings({ databaseId: "default" });
const auth = getAuth();

module.exports = { db, auth };
