import { Router } from "express";

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
