import { Router } from "express";
import { env } from "../config/env.js";
import { buildPatientQrPdf } from "../services/patientPdf.js";

export const patientsRouter = Router();

// Create a patient record and associated session scaffold.
patientsRouter.post("/", (_req, res) => {
  res.status(501).json({
    ok: false,
    message: "Not implemented: create patient"
  });
});

// Update an existing patient record.
patientsRouter.patch("/:patientUuid", (_req, res) => {
  res.status(501).json({
    ok: false,
    message: "Not implemented: update patient"
  });
});

// Generate printable PDF with a general QR code to patient UI.
patientsRouter.get("/qr-pdf", async (_req, res) => {
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
