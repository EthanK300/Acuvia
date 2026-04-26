import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { env } from "./config/env.js";
import { verifyDatabaseConnection } from "./db/pool.js";
import { aiRouter } from "./routes/ai.js";
import { nursesRouter } from "./routes/nurses.js";
import { patientsRouter } from "./routes/patients.js";
import { getGeminiModel } from "./services/gemini.js";
import { getPatientSocketCount, registerPatientSocket, unregisterPatientSocket } from "./services/patientSockets.js";

const app = express();
const port = env.port;
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/patients" });
const patientUiOrigin = new URL(env.patientUiBaseUrl).origin;
const allowedOrigins = new Set([
  patientUiOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function isAllowedDevOrigin(origin) {
  if (!origin) {
    return false;
  }

  try {
    const url = new URL(origin);
    return url.protocol === "http:" && url.port === "5173";
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const allowedOrigin =
    allowedOrigins.has(requestOrigin) || isAllowedDevOrigin(requestOrigin)
      ? requestOrigin
      : patientUiOrigin;
  const startedAt = Date.now();

  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.header("Vary", "Origin");

  res.on("finish", () => {
    console.log(
      `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms origin=${requestOrigin || "none"} cors=${allowedOrigin}`
    );
  });

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});
app.use(express.json({ limit: "50mb" }));
app.use("/api/ai", aiRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/nurses", nursesRouter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "backend",
    sockets: {
      patientsConnected: getPatientSocketCount()
    }
  });
});

async function start() {
  await verifyDatabaseConnection();
  getGeminiModel();

  wss.on("connection", (ws, req) => {
    const requestUrl = new URL(req.url, "http://localhost");
    const patientUuid = requestUrl.searchParams.get("patientUuid");

    registerPatientSocket(patientUuid, ws);
    ws.on("close", () => {
      unregisterPatientSocket(patientUuid, ws);
    });
  });

  server.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
