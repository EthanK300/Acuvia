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
const CATEGORY_LABEL_TO_NUMBER = {
  critical: 1,
  urgent: 2,
  "non urgent": 3
};

function normalizeCategory(category) {
  if (typeof category === "number" && Number.isInteger(category)) {
    return category;
  }
  if (typeof category === "string") {
    const normalized = category.trim().toLowerCase();
    if (normalized in CATEGORY_LABEL_TO_NUMBER) {
      return CATEGORY_LABEL_TO_NUMBER[normalized];
    }
    const numeric = Number(normalized);
    if (Number.isInteger(numeric)) {
      return numeric;
    }
  }
  return null;
}

function isValidCategory(category) {
  return category === 1 || category === 2 || category === 3;
}

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isIsoDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeMediaItems(input) {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input.filter((item) => item && typeof item === "object");
  }
  if (typeof input === "object") {
    return [input];
  }
  return [];
}

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
    const rawBody = req.body;

    const firstName = normalizeNonEmptyString(rawBody?.firstName);
    const lastName = normalizeNonEmptyString(rawBody?.lastName);
    const birthday = normalizeNonEmptyString(rawBody?.birthday);
    const description = normalizeNonEmptyString(rawBody?.description);
    const category = normalizeCategory(rawBody?.category);

    if (!firstName || !lastName || !birthday || !isValidCategory(category)) {
      return res.status(400).json({
        ok: false,
        message:
          "firstName, lastName, birthday, and category are required (category: 1=critical, 2=urgent, 3=non urgent)"
      });
    }

    if (!isIsoDateOnly(birthday)) {
      return res.status(400).json({
        ok: false,
        message: "birthday must use YYYY-MM-DD format"
      });
    }

    const { startedAt, expiresAt } = buildSessionWindow();
    const patient = await createPatientWithSession({
      category,
      firstName,
      lastName,
      birthday,
      description,
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
      patient: {
        category: patient.category,
        firstName: patient.first_name,
        lastName: patient.last_name,
        birthday: patient.birthday,
        description: patient.description
      },
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
    if (Number.isNaN(new Date(timestamp).getTime())) {
      return res.status(400).json({
        ok: false,
        message: "timestamp must be a valid date/time value"
      });
    }

    const textValue =
      typeof data === "string"
        ? data
        : normalizeNonEmptyString(data?.text) ?? normalizeNonEmptyString(req.body?.text);

    const mediaItems = [
      ...normalizeMediaItems(data?.media),
      ...normalizeMediaItems(req.body?.media),
      ...(data?.type === "media" ? [data] : [])
    ].filter((item) => typeof item.contentBase64 === "string");

    const uploads = [];
    for (const mediaItem of mediaItems) {
      const upload = await uploadPatientMedia({
        patientUuid,
        contentBase64: mediaItem.contentBase64,
        mimeType: mediaItem.mimeType,
        timestamp
      });
      uploads.push(upload);
    }

    const payload = {
      timestamp,
      text: textValue ?? null,
      media: uploads
    };

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

