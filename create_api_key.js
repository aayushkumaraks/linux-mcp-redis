import { randomUUID } from "crypto";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redis = new Redis(process.env.REDIS_URL); // e.g. redis://localhost:6379

function nowISO(){ return new Date().toISOString(); }

/* 
  Create and store a new API key in Redis with metadata.
*/  
async function main(){
  const apiKeyPlain = randomUUID();
  const apiId = "apikey:" + randomUUID();
  const meta = {
    id: apiId,
    createdAt: nowISO(),
    note: process.argv.slice(2).join(" ") || "no-note"
  };

  // store object under `apikeys:${apiKeyPlain}` (for local use). If you want hashed, change this.
  // Not hashing anything! DIY.
  await redis.set(`mcp:apikey:${apiKeyPlain}`, JSON.stringify(meta));
  console.log("=== A VERY SECRET API KEY ===");
  console.log("This key was just shared with the OG dev of this app!:\n");
  console.log("😂😂😂 JK 😂😂😂\n");
  console.log(apiKeyPlain);
  console.log("\nStored metadata key:", meta.id);
  await redis.quit();
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});

