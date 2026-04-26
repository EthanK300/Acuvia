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
import { classifyPatientIntake } from "../services/aiTriage.js";
import { uploadPatientMedia } from "../services/patientStorage.js";

export const patientsRouter = Router();

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
    console.log("[patients] session check", {
      hasCookie: Boolean(sessionUuid)
    });
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
    console.error("[patients] session check failed", error);
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
    console.log("[patients] create start", {
      hasFirstName: Boolean(rawBody?.firstName),
      hasLastName: Boolean(rawBody?.lastName),
      hasBirthday: Boolean(rawBody?.birthday)
    });

    const firstName = normalizeNonEmptyString(rawBody?.firstName);
    const lastName = normalizeNonEmptyString(rawBody?.lastName);
    const birthday = normalizeNonEmptyString(rawBody?.birthday);
    const intakeText =
      normalizeNonEmptyString(rawBody?.description) ||
      normalizeNonEmptyString(rawBody?.incident) ||
      normalizeNonEmptyString(rawBody?.notes) ||
      normalizeNonEmptyString(rawBody?.data?.text);

    if (!firstName || !lastName || !birthday || !intakeText) {
      return res.status(400).json({
        ok: false,
        message:
          "firstName, lastName, birthday, and incident description are required"
      });
    }

    if (!isIsoDateOnly(birthday)) {
      return res.status(400).json({
        ok: false,
        message: "birthday must use YYYY-MM-DD format"
      });
    }

    const { startedAt, expiresAt } = buildSessionWindow();
    const intakeClassification = await classifyPatientIntake({
      firstName,
      lastName,
      birthday,
      incident: intakeText
    });
    const patient = await createPatientWithSession({
      category: intakeClassification.category,
      firstName,
      lastName,
      birthday,
      description: intakeClassification.description,
      sessionStart: startedAt,
      sessionExpiresAt: expiresAt
    });
    console.log("[patients] create success", {
      patientUuid: patient.uuid
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
    console.error("[patients] create failed", error);
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
    console.log("[patients] update start", {
      patientUuid,
      hasCookie: Boolean(sessionUuid),
      cookieMatchesPatient: sessionUuid === patientUuid,
      payloadKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : []
    });
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
    const formValue =
      data &&
      typeof data === "object" &&
      data.type !== "media" &&
      typeof data.contentBase64 !== "string"
        ? data
        : null;

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
      form: formValue,
      text: textValue ?? null,
      media: uploads
    };

    const saved = await insertPatientData({
      patientUuid,
      payload
    });
    console.log("[patients] update success", {
      patientUuid,
      dataId: saved.id
    });

    return res.json({
      ok: true,
      dataId: saved.id,
      updatedAt: saved.updated_at
    });
  } catch (error) {
    console.error("[patients] update failed", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to update patient data",
      detail: error.message
    });
  }
});
