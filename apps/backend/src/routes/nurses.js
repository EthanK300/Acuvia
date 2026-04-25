import { Router } from "express";
import { env } from "../config/env.js";
import { buildPatientQrPdf } from "../services/patientPdf.js";

export const nursesRouter = Router();

// Move action from nurse control surface.
nursesRouter.post("/move", (_req, res) => {
  res.status(501).json({
    ok: false,
    message: "Not implemented: nurse move"
  });
});

// Clear action from nurse control surface.
nursesRouter.post("/clear", (_req, res) => {
  res.status(501).json({
    ok: false,
    message: "Not implemented: nurse clear"
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
