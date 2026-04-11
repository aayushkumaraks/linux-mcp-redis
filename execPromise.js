import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Dangerous command patterns to block
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//, // rm -rf /
  /dd\s+if=\/dev/, // dd commands on devices
  /mkfs/, // filesystem formatting
  /forefront|:(){ :|:|fork\(\)/, // fork bomb
];

function validateCommand(command) {
  if (!command || typeof command !== "string") {
    throw new Error("Invalid command");
  }
  
  if (command.length > 5000) {
    throw new Error("Command too long");
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error("Command contains dangerous operations");
    }
  }

  return true;
}

export async function execPromise(command, cwd = null, timeout = 30000) {
  validateCommand(command);

  const options = {
    timeout,
    maxBuffer: 1024 * 1024, // 1MB buffer
    shell: "/bin/bash",
    cwd: cwd || process.env.HOME || "/root"
  };

  try {
    const { stdout, stderr } = await execFileAsync("/bin/bash", ["-c", command], options);
    return { stdout, stderr };
  } catch (error) {
    // Detect if command requires input (TTY)
    if (error.message.includes("EINVAL") || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      error.requiresInput = true;
    }
    throw error;
  }
}