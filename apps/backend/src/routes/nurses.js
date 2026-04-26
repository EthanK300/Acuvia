import { Router } from "express";
import { env } from "../config/env.js";
import {
  clearPatientRecords,
  getPatientStringSummary,
  listPatientDataHistory,
  insertPatientData,
  listTopPriorityPatients,
  updatePatientTriage
} from "../db/patients.js";
import { buildPatientQrPdf } from "../services/patientPdf.js";
import { enqueueRankingEvent } from "../services/rankingQueue.js";
import { sendPatientAlert } from "../services/patientSockets.js";
import { clearPatientMedia, createPatientMediaSignedUrl, uploadPatientMedia } from "../services/patientStorage.js";
import {
  consumePendingPatientUpdate,
  listPendingPatientUpdates,
  rejectPendingPatientUpdate
} from "../services/pendingPatientUpdates.js";

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

nursesRouter.post("/update-webhook", async (req, res) => {
  try {
    const { patientUuid, pendingUpdateId, decision } = req.body || {};
    if (!patientUuid) {
      return res.status(400).json({
        ok: false,
        message: "patientUuid is required"
      });
    }
    if (!pendingUpdateId) {
      return res.status(400).json({
        ok: false,
        message: "pendingUpdateId is required"
      });
    }

    const normalizedDecision = String(decision || "").toLowerCase();
    if (!["approve", "reject"].includes(normalizedDecision)) {
      return res.status(400).json({
        ok: false,
        message: "decision must be approve or reject"
      });
    }

    if (normalizedDecision === "reject") {
      const rejected = rejectPendingPatientUpdate({ patientUuid, pendingUpdateId });
      if (!rejected) {
        return res.status(404).json({
          ok: false,
          message: "Pending patient update not found"
        });
      }

      const uploads = [];
      for (const mediaItem of rejected.media || []) {
        const upload = await uploadPatientMedia({
          patientUuid,
          contentBase64: mediaItem.contentBase64,
          mimeType: mediaItem.mimeType,
          timestamp: rejected.timestamp
        });
        uploads.push(upload);
      }

      const saved = await insertPatientData({
        patientUuid,
        payload: {
          type: "patient_update",
          timestamp: rejected.timestamp,
          form: rejected.form,
          text: rejected.text,
          media: uploads,
          nurseReview: {
            status: "rejected",
            reviewedAt: new Date().toISOString()
          }
        }
      });

      return res.json({
        ok: true,
        rejected: true,
        pendingUpdateId,
        dataId: saved.id
      });
    }

    const pendingUpdate = consumePendingPatientUpdate({ patientUuid, pendingUpdateId });
    if (!pendingUpdate) {
      return res.status(404).json({
        ok: false,
        message: "Pending patient update not found"
      });
    }

    const uploads = [];
    for (const mediaItem of pendingUpdate.media || []) {
      const upload = await uploadPatientMedia({
        patientUuid,
        contentBase64: mediaItem.contentBase64,
        mimeType: mediaItem.mimeType,
        timestamp: pendingUpdate.timestamp
      });
      uploads.push(upload);
    }

    const saved = await insertPatientData({
      patientUuid,
      payload: {
        type: "patient_update",
        timestamp: pendingUpdate.timestamp,
        form: pendingUpdate.form,
        text: pendingUpdate.text,
        media: uploads,
        nurseReview: {
          status: "approved",
          reviewedAt: new Date().toISOString()
        }
      }
    });
    const proposal = pendingUpdate.proposal || {};
    if (!Number.isInteger(proposal.proposedCategory) || proposal.proposedCategory < 1 || proposal.proposedCategory > 5) {
      return res.status(500).json({
        ok: false,
        message: "Pending update is missing a valid AI proposal"
      });
    }
    await updatePatientTriage({
      patientUuid,
      category: proposal.proposedCategory,
      description: proposal.proposedDescription,
      numberRank: proposal.proposedRank
    });
    enqueueRankingEvent(patientUuid, "update-approved");

    return res.json({
      ok: true,
      approved: true,
      pendingUpdateId,
      dataId: saved.id
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to process nurse update webhook",
      detail: error.message
    });
  }
});

nursesRouter.get("/pending-updates", async (_req, res) => {
  try {
    const pendingUpdates = listPendingPatientUpdates();
    return res.json({
      ok: true,
      updates: pendingUpdates
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load pending patient updates",
      detail: error.message
    });
  }
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
