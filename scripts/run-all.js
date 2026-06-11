const http = require("http");
const { spawn } = require("child_process");

const args = process.argv.slice(2);

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) return args[index + 1];
  return fallback;
}

const COMMAND = readOption("command", "dev");
const SERVICE = readOption("service", "all");
const APP_ENV = readOption("env", process.env.APP_ENV || process.env.NODE_ENV || "development");
const API_PORT = Number(readOption("api-port", process.env.API_PORT || process.env.PORT || "3103"));
const REACT_PORT = Number(readOption("react-port", process.env.REACT_PORT || process.env.VITE_PORT || "5173"));
const REQUIRE_REMOTE_MONGO = process.env.REQUIRE_REMOTE_MONGO !== "false";
const API_HEALTH_URL = (port) => `http://127.0.0.1:${port}/health`;
const isDev = COMMAND === "dev";
const isRun = COMMAND === "run";
const viteMode = APP_ENV === "local" ? "development" : APP_ENV;

if (!["dev", "run"].includes(COMMAND)) {
  throw new Error(`Unsupported command "${COMMAND}". Use --command=dev or --command=run.`);
}

if (!["all", "api", "react"].includes(SERVICE)) {
  throw new Error(`Unsupported service "${SERVICE}". Use --service=all, --service=api, or --service=react.`);
}

const baseEnv = {
  ...process.env,
  APP_ENV,
  NODE_ENV: APP_ENV,
  MONGODB_USE_REMOTE: process.env.MONGODB_USE_REMOTE || "true",
  MONGODB_USE_ATLAS: process.env.MONGODB_USE_ATLAS || "true"
};

const processes = [];
let shuttingDown = false;

function startProcess(name, command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    shell: false,
    ...options
  });

  processes.push({ name, child });

  child.on("exit", (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[${name}] exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}`);
      shutdown(code || 1);
    }
  });

  return child;
}

function runProcess(name, command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: false,
      ...options
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`[${name}] exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}`));
    });
  });
}

function requestJson(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            statusCode: response.statusCode,
            data: body ? JSON.parse(body) : null
          });
        } catch {
          resolve({ ok: false, statusCode: response.statusCode, data: null });
        }
      });
    });

    request.on("error", () => resolve({ ok: false, statusCode: 0, data: null }));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve({ ok: false, statusCode: 0, data: null });
    });
  });
}

function usesRequiredMongo(health) {
  if (!health.ok) return false;
  if (!REQUIRE_REMOTE_MONGO) return true;
  return health.data?.services?.mongo?.authMode !== "local";
}

async function waitForHealth(url, timeoutMs = 60000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const health = await requestJson(url);
    if (usesRequiredMongo(health)) return health;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`API did not become healthy at ${url}`);
}

async function findApiPort() {
  for (let port = API_PORT; port < API_PORT + 20; port += 1) {
    const health = await requestJson(API_HEALTH_URL(port));
    if (!health.ok || usesRequiredMongo(health)) {
      return { port, health };
    }
    console.log(`[${COMMAND}] Port ${port} has a healthy API but it is using local MongoDB. Trying next port...`);
  }

  throw new Error(`Could not find a free API port starting at ${API_PORT}`);
}

async function ensureApi(apiPort, existingHealth) {
  const apiHealthUrl = API_HEALTH_URL(apiPort);

  console.log(`[${COMMAND}] Running MongoDB migration for ${APP_ENV}...`);
  await runProcess("migration", "npm", ["--prefix", "PaymentApi", "run", "db:migrate"], {
    env: baseEnv
  });

  if (usesRequiredMongo(existingHealth)) {
    console.log(`[${COMMAND}] PaymentApi is already healthy at ${apiHealthUrl}. Reusing it.`);
    return;
  }

  console.log(`[${COMMAND}] Starting PaymentApi on port ${apiPort} with NODE_ENV=${APP_ENV}...`);
  startProcess("api", "npm", ["--prefix", "PaymentApi", "run", "start"], {
    env: {
      ...baseEnv,
      PORT: String(apiPort)
    }
  });

  console.log(`[${COMMAND}] Waiting for API health: ${apiHealthUrl}`);
  await waitForHealth(apiHealthUrl);
}

function startReact(apiPort) {
  const reactArgs = isDev
    ? ["--prefix", "cardmarketing", "run", "dev", "--", "--host", "0.0.0.0", "--port", String(REACT_PORT), "--mode", viteMode]
    : ["--prefix", "cardmarketing", "run", "preview", "--", "--host", "0.0.0.0", "--port", String(REACT_PORT)];

  console.log(`[${COMMAND}] Starting React ${isDev ? "dev server" : "preview server"} on port ${REACT_PORT} with APP_ENV=${APP_ENV}...`);
  startProcess("react", "npm", reactArgs, {
    env: {
      ...process.env,
      APP_ENV,
      NODE_ENV: APP_ENV,
      VITE_API_PROXY_TARGET: `http://localhost:${apiPort}`
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  for (const { child } of processes.slice().reverse()) {
    if (!child.killed) child.kill("SIGTERM");
  }

  if (processes.length === 0) {
    process.exit(exitCode);
    return;
  }

  setTimeout(() => process.exit(exitCode), 500).unref();
}

async function main() {
  const { port: apiPort, health } = await findApiPort();

  if (SERVICE === "api" || SERVICE === "all") {
    await ensureApi(apiPort, health);
  }

  if (SERVICE === "react" || SERVICE === "all") {
    startReact(apiPort);
  }

  if (SERVICE === "api") {
    console.log(`[${COMMAND}] API is running at ${API_HEALTH_URL(apiPort)}`);
  }

  if (SERVICE === "all") {
    console.log(`[${COMMAND}] Solution is running. API: ${API_HEALTH_URL(apiPort)} React: http://127.0.0.1:${REACT_PORT}/react/`);
  }
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((error) => {
  console.error(`[${COMMAND}] ${error.message}`);
  shutdown(1);
});
