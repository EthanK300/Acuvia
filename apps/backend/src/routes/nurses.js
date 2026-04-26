import { Router } from "express";
import { env } from "../config/env.js";
import {
  clearPatientRecords,
  getPatientStringSummary,
  listPatientDataHistory,
  listTopPriorityPatients
} from "../db/patients.js";
import { buildPatientQrPdf } from "../services/patientPdf.js";
import { sendPatientAlert } from "../services/patientSockets.js";
import { clearPatientMedia, createPatientMediaSignedUrl } from "../services/patientStorage.js";

export const nursesRouter = Router();

nursesRouter.get("/queue", async (_req, res) => {
  try {
    const patients = await listTopPriorityPatients(50);
    return res.json({
      ok: true,
      patients
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load nurse queue",
      detail: error.message
    });
  }
});

nursesRouter.get("/patient/:patientUuid/summary", async (req, res) => {
  try {
    const { patientUuid } = req.params;
    const summary = await getPatientStringSummary(patientUuid);
    if (!summary) {
      return res.status(404).json({
        ok: false,
        message: "Patient not found"
      });
    }

    return res.json({
      ok: true,
      summary
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load patient summary",
      detail: error.message
    });
  }
});

nursesRouter.get("/patient/:patientUuid/history", async (req, res) => {
  try {
    const { patientUuid } = req.params;
    const history = await listPatientDataHistory(patientUuid);
    const entries = [];

    for (const row of history) {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      const media = Array.isArray(payload.media) ? payload.media : [];
      const signedMedia = [];

      for (const item of media) {
        const url = await createPatientMediaSignedUrl(item.objectKey);
        signedMedia.push({
          bucket: item.bucket,
          objectKey: item.objectKey,
          mimeType: item.mimeType || "application/octet-stream",
          url
        });
      }

      entries.push({
        updatedAt: row.updated_at,
        timestamp: payload.timestamp || row.updated_at,
        text: typeof payload.text === "string" ? payload.text : null,
        form: payload.form && typeof payload.form === "object" ? payload.form : null,
        media: signedMedia
      });
    }

    return res.json({
      ok: true,
      patientUuid,
      entries
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load patient history",
      detail: error.message
    });
  }
});

// Move action from nurse control surface.
nursesRouter.post("/move", (_req, res) => {
  res.status(501).json({
    ok: false,
    message: "Not implemented: nurse move"
  });
});

// Clear action from nurse control surface.
nursesRouter.post("/clear", async (req, res) => {
  try {
    const { patientUuid } = req.body || {};
    if (!patientUuid) {
      return res.status(400).json({
        ok: false,
        message: "patientUuid is required"
      });
    }

    const [cleared, media] = await Promise.all([
      clearPatientRecords(patientUuid),
      clearPatientMedia(patientUuid)
    ]);

    return res.json({
      ok: true,
      cleared,
      media
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to clear patient records",
      detail: error.message
    });
  }
});

// Send a real-time alert to a specific patient by UUID.
nursesRouter.post("/call", (req, res) => {
  const { patientUuid, message } = req.body || {};
  if (!patientUuid) {
    return res.status(400).json({
      ok: false,
      message: "patientUuid is required"
    });
  }

  const delivered = sendPatientAlert(patientUuid, message || "Nurse is ready for you");
  if (!delivered) {
    return res.status(404).json({
      ok: false,
      message: "Patient is not currently connected via websocket"
    });
  }

  return res.json({
    ok: true,
    delivered: true
  });
});

// Generate printable PDF with a general QR code to patient UI.
nursesRouter.get("/qr-pdf", async (_req, res) => {
  try {
    const patientUrl = new URL(env.patientUiBaseUrl);

    const pdfBuffer = await buildPatientQrPdf({
      targetUrl: patientUrl.toString()
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"patient-checkin-qr.pdf\"");
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Failed to generate patient QR PDF",
      detail: error.message
    });
  }
});
