import { Worker } from "bullmq";
import Redis from "ioredis";
import { execPromise } from "./execPromise.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker("mcp-commands", async (job) => {
  const { command, cwd } = job.data;

  try {
    const result = await execPromise(command, cwd, 30000); // 30s timeout
    await connection.setex(
      `mcp:jobresult:${job.id}`,
      86400,
      JSON.stringify({ status: "completed", stdout: result.stdout, stderr: result.stderr, code: 0 })
    );
    return { success: true };
  } catch (error) {
    const errorData = {
      status: "failed",
      error: error.message,
      code: error.code || 1,
      requiresInput: error.requiresInput || false,
    };

    await connection.setex(
      `mcp:jobresult:${job.id}`,
      86400,
      JSON.stringify(errorData)
    );

    if (error.requiresInput) {
      throw new Error(`INTERACTIVE_REQUIRED: ${error.message}`);
    }
    throw error;
  }
}, { connection });

worker.on("completed", (job) => console.log(`Job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`Job ${job.id} failed:`, err.message));

console.log("Worker started, processing mcp-commands queue...");
