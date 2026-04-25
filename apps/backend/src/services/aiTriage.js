import { getGeminiModel } from "./gemini.js";

export const URGENCY_LEVELS = {
  IMMINENT: "imminent",
  URGENT: "urgent",
  NOT_URGENT: "not urgent"
};

const ALLOWED_URGENCY = new Set(Object.values(URGENCY_LEVELS));

export function validateTriageInput(message) {
  if (!message || typeof message !== "object") {
    throw new Error("message is required");
  }

  if (!("data" in message)) {
    throw new Error("message.data is required");
  }

  if (!message.timestamp) {
    throw new Error("message.timestamp is required");
  }
}

export function normalizeTriageOutput(output) {
  if (!output || typeof output !== "object") {
    throw new Error("AI output must be an object");
  }

  const urgency = String(output.urgency || "").toLowerCase().trim();
  const rating = Number(output.rating);

  if (!ALLOWED_URGENCY.has(urgency)) {
    throw new Error("AI output urgency must be one of: imminent, urgent, not urgent");
  }

  if (!Number.isFinite(rating) || rating < 1 || rating > 100) {
    throw new Error("AI output rating must be a number from 1 to 100");
  }

  return {
    urgency,
    rating: Math.round(rating)
  };
}

export async function classifyPatientMessage(message) {
  validateTriageInput(message);

  const model = getGeminiModel();
  const prompt = [
    "You are a clinical triage assistant.",
    "Return JSON only with keys: urgency, rating.",
    'urgency must be one of: "imminent", "urgent", "not urgent".',
    "rating must be an integer from 1 to 100.",
    "Input message JSON:",
    JSON.stringify(message)
  ].join("\n");

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = JSON.parse(raw);

  return normalizeTriageOutput(parsed);
}
