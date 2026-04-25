import { Router } from "express";

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
