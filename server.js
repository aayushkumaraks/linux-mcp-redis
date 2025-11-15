import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Queue } from "bullmq";
import Redis from "ioredis";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379"; // default to local Redis
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null }); // persistent connection

const queue = new Queue("mcp-commands", { connection }); // BullMQ queue for command jobs

const SERVER_NAME = process.env.MCP_NAME || "linux-mcp"; 
const SERVER_VERSION = process.env.MCP_VERSION || "1.0.0";
const JOB_RESULT_TTL = Number(process.env.JOB_RESULT_TTL || 86400); // time to live for job results in seconds. Probably won't need it

// Validate API key: check HMAC(hash) key entry first, then plaintext fallback for compatibility.
async function validateApiKey(apiKey) {
  if (!apiKey) return false;

  // Check hashed storage (if you created keys with HMAC approach)
  if (process.env.SERVER_SECRET) {
    const hmac = crypto.createHmac("sha256", process.env.SERVER_SECRET).update(apiKey).digest("hex");
    const hashed = await connection.get(`mcp:apikeyhash:${hmac}`);
    if (hashed) return true;
  }

  // Backwards-compatibility: check plaintext key storage
  const plain = await connection.get(`mcp:apikey:${apiKey}`);
  if (plain) return true;

  return false;
}

// Restrict file ops to $HOME
function resolveSafe(homeDir, requestedPath) {
  const HOME = homeDir || process.env.HOME || "/root";
  const abs = path.resolve(HOME, requestedPath || ".");
  if (!abs.startsWith(HOME)) throw new Error("Path outside allowed home directory");
  return abs;
}

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  {
    enqueueCommand: {
      handler: async (ctx, { apiKey, command, cwd }) => {
        if (!await validateApiKey(apiKey)) return { error: "unauthorized" };
        if (!command || typeof command !== "string") return { error: "invalid command" };

        const job = await queue.add("run", { apiKey, command, cwd: cwd || null }, {
          removeOnComplete: false,
          removeOnFail: false,
          attempts: 1
        });

        return { jobId: job.id };
      }
    },

    getJobResult: {
      handler: async (ctx, { apiKey, jobId }) => {
        if (!await validateApiKey(apiKey)) return { error: "unauthorized" };
        if (!jobId) return { error: "missing jobId" };
        const data = await connection.get(`mcp:jobresult:${jobId}`);
        if (!data) return { status: "pending" };
        return { status: "done", payload: JSON.parse(data) };
      }
    },

    readFile: {
      handler: async (ctx, { apiKey, file }) => {
        if (!await validateApiKey(apiKey)) return { error: "unauthorized" };
        try {
          const p = resolveSafe(process.env.HOME || "/root", file);
          const content = await fs.readFile(p, "utf8");
          return { data: content };
        } catch (e) {
          return { error: String(e) };
        }
      }
    },

    writeFile: {
      handler: async (ctx, { apiKey, file, content }) => {
        if (!await validateApiKey(apiKey)) return { error: "unauthorized" };
        try {
          const p = resolveSafe(process.env.HOME || "/root", file);
          await fs.mkdir(path.dirname(p), { recursive: true });
          await fs.writeFile(p, content ?? "");
          return { ok: true };
        } catch (e) {
          return { error: String(e) };
        }
      }
    },

    listDirectory: {
      handler: async (ctx, { apiKey, dir }) => {
        if (!await validateApiKey(apiKey)) return { error: "unauthorized" };
        try {
          const dirPath = resolveSafe(process.env.HOME || "/root", dir || ".");
          const files = await fs.readdir(dirPath);
          return { files };
        } catch (e) {
          return { error: String(e) };
        }
      }
    }
  }
);

const transport = new StdioServerTransport();
server.connect(transport);

console.log(`${SERVER_NAME} MCP server running (stdio transport)`);
