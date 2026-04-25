import { Router } from "express";
import { classifyPatientMessage } from "../services/aiTriage.js";

export const aiRouter = Router();

// Structured AI triage scaffold.
aiRouter.post("/triage", async (req, res) => {
  try {
    const { message } = req.body || {};
    const output = await classifyPatientMessage(message);

    res.json({
      ok: true,
      output
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message
    });
  }
});
