import { Router } from "express";
import {
  createPatientWithSession,
  getPatientBySessionUuid,
  insertPatientData
} from "../db/patients.js";
import {
  buildSessionWindow,
  hasActiveSession,
  PATIENT_SESSION_COOKIE,
  readCookieValue
} from "../services/session.js";
import { uploadPatientMedia } from "../services/patientStorage.js";

export const patientsRouter = Router();

function buildPatientWebsocketUrl(req, patientUuid) {
  const wsProtocol = req.protocol === "https" ? "wss" : "ws";
  const host = req.get("host");
  const wsUrl = new URL(`${wsProtocol}://${host}/ws/patients`);
  wsUrl.searchParams.set("patientUuid", patientUuid);
  return wsUrl.toString();
}

// Check whether incoming patient has an active session.
patientsRouter.get("/session", async (req, res) => {
  try {
    const sessionUuid = readCookieValue(req.headers.cookie, PATIENT_SESSION_COOKIE);
    if (!sessionUuid) {
      return res.json({
        ok: true,
        hasSession: false,
        next: "patient-info-form"
      });
    }

    const patient = await getPatientBySessionUuid(sessionUuid);
    if (!patient || !hasActiveSession(patient.session_expires_at)) {
      res.clearCookie(PATIENT_SESSION_COOKIE);
      return res.json({
        ok: true,
        hasSession: false,
        next: "patient-info-form"
      });
    }

    return res.json({
      ok: true,
      hasSession: true,
      patientUuid: patient.uuid,
      sessionExpiresAt: patient.session_expires_at,
      websocketUrl: buildPatientWebsocketUrl(req, patient.uuid),
      next: "patient-updates"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to check patient session",
      detail: error.message
    });
  }
});

// Create patient record from form submission and issue session.
patientsRouter.post("/", async (req, res) => {
  try {
    const { firstName, lastName, birthday } = req.body || {};
    if (!firstName || !lastName || !birthday) {
      return res.status(400).json({
        ok: false,
        message: "firstName, lastName, and birthday are required"
      });
    }

    const { startedAt, expiresAt } = buildSessionWindow();
    const patient = await createPatientWithSession({
      firstName,
      lastName,
      birthday,
      sessionStart: startedAt,
      sessionExpiresAt: expiresAt
    });

    res.cookie(PATIENT_SESSION_COOKIE, patient.uuid, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.protocol === "https",
      expires: expiresAt
    });

    return res.status(201).json({
      ok: true,
      patientUuid: patient.uuid,
      sessionStart: patient.session_start,
      sessionExpiresAt: patient.session_expires_at,
      websocketUrl: buildPatientWebsocketUrl(req, patient.uuid),
      next: "patient-updates"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to create patient session",
      detail: error.message
    });
  }
});

// Submit periodic patient data update during active session.
patientsRouter.patch("/:patientUuid", async (req, res) => {
  try {
    const { patientUuid } = req.params;
    const sessionUuid = readCookieValue(req.headers.cookie, PATIENT_SESSION_COOKIE);
    if (!sessionUuid || sessionUuid !== patientUuid) {
      return res.status(401).json({
        ok: false,
        message: "Active patient session is required"
      });
    }

    const patient = await getPatientBySessionUuid(sessionUuid);
    if (!patient || !hasActiveSession(patient.session_expires_at)) {
      res.clearCookie(PATIENT_SESSION_COOKIE);
      return res.status(401).json({
        ok: false,
        message: "Patient session expired"
      });
    }

    const data = req.body?.data ?? req.body ?? {};
    const timestamp = req.body?.timestamp ?? Date.now();

    let payload;
    if (typeof data === "string") {
      payload = {
        type: "text",
        text: data,
        timestamp
      };
    } else if (
      data &&
      typeof data === "object" &&
      data.type === "media" &&
      typeof data.contentBase64 === "string"
    ) {
      const upload = await uploadPatientMedia({
        patientUuid,
        contentBase64: data.contentBase64,
        mimeType: data.mimeType,
        timestamp
      });

      payload = {
        type: "media",
        timestamp,
        storage: upload,
        text: typeof data.text === "string" ? data.text : undefined
      };
    } else {
      payload = {
        type: "text",
        text: typeof data?.text === "string" ? data.text : JSON.stringify(data),
        timestamp
      };
    }

    const saved = await insertPatientData({
      patientUuid,
      payload
    });

    return res.json({
      ok: true,
      dataId: saved.id,
      updatedAt: saved.updated_at
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update patient data",
      detail: error.message
    });
  }
});

