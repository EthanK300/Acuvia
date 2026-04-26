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
import { enqueueRankingEvent } from "../services/rankingQueue.js";
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
    console.log("[patients] create received", {
      hasFirstName: Boolean(rawBody?.firstName),
      hasLastName: Boolean(rawBody?.lastName),
      hasBirthday: Boolean(rawBody?.birthday),
      hasNotes: Boolean(rawBody?.notes),
      hasIncident: Boolean(rawBody?.incident),
      hasMedia:
        Boolean(rawBody?.media) ||
        Boolean(rawBody?.data?.media) ||
        rawBody?.data?.type === "media"
    });

    const firstName = normalizeNonEmptyString(rawBody?.firstName);
    const lastName = normalizeNonEmptyString(rawBody?.lastName);
    const birthday = normalizeNonEmptyString(rawBody?.birthday);
    const intakeText =
      normalizeNonEmptyString(rawBody?.incident) ||
      normalizeNonEmptyString(rawBody?.notes) ||
      normalizeNonEmptyString(rawBody?.data?.text);

    if (!firstName || !lastName || !birthday) {
      return res.status(400).json({
        ok: false,
        message: "firstName, lastName, and birthday are required"
      });
    }

    if (!isIsoDateOnly(birthday)) {
      return res.status(400).json({
        ok: false,
        message: "birthday must use YYYY-MM-DD format"
      });
    }

    console.log("[patients] create ai-classification:start");
    const { startedAt, expiresAt } = buildSessionWindow();
    const intakeClassification = await classifyPatientIntake({
      firstName,
      lastName,
      birthday,
      incident: intakeText || "No incident details provided at intake."
    });
    console.log("[patients] create ai-classification:result", {
      category: intakeClassification.category,
      hasDescription: Boolean(intakeClassification.description)
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
    console.log("[patients] create db:patient-inserted", {
      patientUuid: patient.uuid,
      category: patient.category
    });

    const createTimestamp = Date.now();
    const createTextValue =
      normalizeNonEmptyString(rawBody?.notes) ||
      normalizeNonEmptyString(rawBody?.data?.text) ||
      normalizeNonEmptyString(rawBody?.incident);
    const createFormValue =
      rawBody && typeof rawBody === "object"
        ? {
            firstName,
            lastName,
            birthday
          }
        : null;

    const createMediaItems = [
      ...normalizeMediaItems(rawBody?.media),
      ...normalizeMediaItems(rawBody?.data?.media),
      ...(rawBody?.data?.type === "media" ? [rawBody.data] : [])
    ].filter((item) => typeof item.contentBase64 === "string");

    const createUploads = [];
    for (const mediaItem of createMediaItems) {
      const upload = await uploadPatientMedia({
        patientUuid: patient.uuid,
        contentBase64: mediaItem.contentBase64,
        mimeType: mediaItem.mimeType,
        timestamp: createTimestamp
      });
      createUploads.push(upload);
    }
    console.log("[patients] create media:uploaded", {
      patientUuid: patient.uuid,
      mediaCount: createUploads.length
    });

    const createdData = await insertPatientData({
      patientUuid: patient.uuid,
      payload: {
        timestamp: createTimestamp,
        form: createFormValue,
        text: createTextValue ?? null,
        media: createUploads
      }
    });
    console.log("[patients] create db:patient-data-inserted", {
      patientUuid: patient.uuid,
      dataId: createdData.id
    });
    enqueueRankingEvent(patient.uuid, "create");
    console.log("[patients] create ranking:event-enqueued", {
      patientUuid: patient.uuid,
      reason: "create"
    });
    console.log("[patients] create success", {
      patientUuid: patient.uuid,
      category: patient.category
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
    console.log("[patients] update media:uploaded", {
      patientUuid,
      mediaCount: uploads.length
    });

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
    enqueueRankingEvent(patientUuid, "update");
    console.log("[patients] update ranking:event-enqueued", {
      patientUuid,
      reason: "update"
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
