import express from "express";
import bodyParser from "body-parser";
import { Queue } from "bullmq";
import Redis from "ioredis";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue("mcp-commands", { connection });
const redis = connection;

const JOB_RESULT_TTL = Number(process.env.JOB_RESULT_TTL || 86400);

async function validateApiKey(apiKey) {
  if (!apiKey) return false;
  if (process.env.SERVER_SECRET) {
    const hmac = crypto.createHmac("sha256", process.env.SERVER_SECRET).update(apiKey).digest("hex");
    const hashed = await redis.get(`mcp:apikeyhash:${hmac}`);
    if (hashed) return true;
  }
  const plain = await redis.get(`mcp:apikey:${apiKey}`);
  if (plain) return true;
  return false;
}

function resolveSafe(homeDir, requestedPath) {
  const HOME = homeDir || process.env.HOME || "/root";
  const abs = path.resolve(HOME, requestedPath || ".");
  if (!abs.startsWith(HOME)) throw new Error("Path outside allowed home directory");
  return abs;
}

const app = express();
app.use(bodyParser.json());

// Helper to read apiKey from header X-API-KEY or body/query
function getApiKey(req) {
  return req.header("X-API-KEY") || req.body?.apiKey || req.query?.apiKey;
}

// Enqueue command
app.post("/enqueue", async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!await validateApiKey(apiKey)) return res.status(401).json({ error: "unauthorized" });

    const { command, cwd } = req.body || {};
    if (!command || typeof command !== "string") return res.status(400).json({ error: "invalid command" });

    const job = await queue.add("run", { apiKey, command, cwd: cwd || null }, {
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 1,
    });

    return res.json({ jobId: job.id });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Get job result
app.get("/result/:jobId", async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!await validateApiKey(apiKey)) return res.status(401).json({ error: "unauthorized" });

    const jobId = req.params.jobId;
    if (!jobId) return res.status(400).json({ error: "missing jobId" });
    const data = await redis.get(`mcp:jobresult:${jobId}`);
    if (!data) return res.json({ status: "pending" });
    return res.json({ status: "done", payload: JSON.parse(data) });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Read file (restricted to $HOME)
app.post("/read", async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!await validateApiKey(apiKey)) return res.status(401).json({ error: "unauthorized" });

    const { file } = req.body || {};
    if (!file) return res.status(400).json({ error: "missing file" });
    const p = resolveSafe(process.env.HOME || "/root", file); // root! coz WHY THE HECK NOT!
    const content = await fs.readFile(p, "utf8");
    return res.json({ data: content });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Write file (restricted to $HOME)
app.post("/write", async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!await validateApiKey(apiKey)) return res.status(401).json({ error: "unauthorized" });

    const { file, content } = req.body || {};
    if (!file) return res.status(400).json({ error: "missing file" });
    const p = resolveSafe(process.env.HOME || "/root", file);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content ?? "");
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// List directory
app.get("/ls", async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    if (!await validateApiKey(apiKey)) return res.status(401).json({ error: "unauthorized" });

    const dir = req.query.dir || ".";
    const dirPath = resolveSafe(process.env.HOME || "/root", dir);
    const files = await fs.readdir(dirPath);
    return res.json({ files });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

const PORT = process.env.HTTP_PORT || 5379;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP test wrapper listening on http://127.0.0.1:${PORT}`);
});
