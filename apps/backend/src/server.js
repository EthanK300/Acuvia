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

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", env.patientUiBaseUrl);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");

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
