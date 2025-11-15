import { Worker } from "bullmq";
import Redis from "ioredis";
import { exec } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const redis = connection;
const QUEUE_NAME = "mcp-commands";
const JOB_RESULT_TTL = Number(process.env.JOB_RESULT_TTL || 86400);

// Shell runner with timeout
function runShell(command, timeoutMs = 60000) {
  return new Promise((resolve) => {
    exec(
      command,
      { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout ? stdout.toString() : "",
          stderr: stderr ? stderr.toString() : "",
          error: err ? (err.message || String(err)) : null,
        });
      }
    );
  });
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { command } = job.data;
    const result = await runShell(command, 120000); // 2-min max timeout

    const stored = {
      jobId: job.id,
      command,
      createdAt: new Date().toISOString(),
      result,
    };

    // Save the result for later polling
    await redis.set(
      `mcp:jobresult:${job.id}`,
      JSON.stringify(stored),
      "EX",
      JOB_RESULT_TTL
    );

    return stored;
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log("Job completed:", job.id);
});
worker.on("failed", (job, err) => {
  console.error("Job failed:", job?.id, err?.message || err);
});
worker.on("error", (err) => console.error("Worker error:", err));

console.log("Worker running and waiting for jobs...");
