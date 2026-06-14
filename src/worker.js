require('dotenv').config();
const { Worker, Queue } = require('bullmq');
const judgeCode = require('../services/judgeCode');

// ── BullMQ connection options ─────────────────────────────────────────────────
// Supports both plain redis:// (local) and Upstash rediss:// (TLS, cloud).
// BullMQ manages its own internal Redis connections; we pass options rather
// than a shared ioredis instance so it can control blocking reads itself.
const redisUrl = process.env.REDIS_URL || '';
let connection;
if (redisUrl.startsWith('rediss://') || redisUrl.startsWith('redis://')) {
  const parsed = new URL(redisUrl);
  connection = {
    host:     parsed.hostname,
    port:     Number(parsed.port) || (redisUrl.startsWith('rediss://') ? 6380 : 6379),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    tls:      redisUrl.startsWith('rediss://') ? {} : undefined,
  };
} else {
  // Legacy fallback: plain host + port env vars
  connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  };
}

// ── Results queue (producer side) ─────────────────────────────────────────────
const resultsQueue = new Queue('results', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 200 },
  },
});

resultsQueue.on('error', (err) => {
  console.error('[worker] results queue error:', err.message);
});

// ── Submissions worker ────────────────────────────────────────────────────────
/**
 * Processes jobs from the "submissions" BullMQ queue.
 *
 * Expected job.data shape:
 * {
 *   jobId:     string,
 *   userId:    string,
 *   roomId:    string,
 *   language:  string,
 *   code:      string,
 *   problemId: string,
 * }
 *
 * Result pushed to "results" queue:
 * {
 *   jobId, userId, roomId,
 *   status, testsPassed, totalTests, executionTime
 * }
 */
const submissionsWorker = new Worker(
  'submissions',
  async (job) => {
    const { jobId, userId, roomId, language, code, problemId } = job.data;

    console.log(
      `\n[worker] 📥 Job received — jobId=${jobId} userId=${userId} ` +
      `roomId=${roomId} language=${language} problemId=${problemId}`
    );

    const startTime = Date.now();
    let judgeResult;

    try {
      // Delegate entirely to the existing judgeCode service — no logic changed
      judgeResult = await judgeCode(problemId, code, language);
    } catch (err) {
      console.error(`[worker] ❌ judgeCode threw for jobId=${jobId}:`, err.message);

      // Push an error result so the player always gets a response
      await resultsQueue.add('result', {
        jobId,
        userId,
        roomId,
        status:        'internal_error',
        testsPassed:   0,
        totalTests:    0,
        executionTime: Date.now() - startTime,
      });
      throw err; // re-throw so BullMQ marks the job as failed / retries
    }

    const executionTime = Date.now() - startTime;

    // Map judgeCode's verdict string to a normalised status token
    const statusMap = {
      'Accepted':       'accepted',
      'Wrong Answer':   'wrong_answer',
      'Time Limit Exceeded': 'tle',
      'Runtime Error':  'runtime_error',
      'Compile Error':  'compile_error',
    };
    const status = statusMap[judgeResult.verdict] ?? 'unknown';

    const resultPayload = {
      jobId,
      userId,
      roomId,
      status,
      testsPassed:   judgeResult.passed  ?? 0,
      totalTests:    judgeResult.total   ?? 0,
      executionTime,
    };

    await resultsQueue.add('result', resultPayload, { jobId });

    console.log(
      `[worker] ✅ Done — jobId=${jobId} status=${status} ` +
      `passed=${resultPayload.testsPassed}/${resultPayload.totalTests} ` +
      `time=${executionTime}ms`
    );
  },
  {
    connection,
    concurrency: 2, // limit parallel compilations to avoid CPU contention
  }
);

submissionsWorker.on('failed', (job, err) => {
  console.error(`[worker] ❌ Job ${job?.id} permanently failed: ${err.message}`);
});

submissionsWorker.on('error', (err) => {
  console.error('[worker] Worker error:', err.message);
});

console.log('[worker] 🚀 Listening on "submissions" queue (concurrency=2)');

module.exports = { submissionsWorker, resultsQueue };
