import { getGeminiModel } from "./gemini.js";

export const URGENCY_LEVELS = {
  CRITICAL: "critical",
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
    throw new Error("AI output urgency must be one of: critical, urgent, not urgent");
  }

  if (!Number.isFinite(rating) || rating < 1 || rating > 100) {
    throw new Error("AI output rating must be a number from 1 to 100");
  }

  const categoryByUrgency = {
    [URGENCY_LEVELS.CRITICAL]: 1,
    [URGENCY_LEVELS.URGENT]: 2,
    [URGENCY_LEVELS.NOT_URGENT]: 3
  };

  return {
    urgency,
    category: categoryByUrgency[urgency],
    rating: Math.round(rating)
  };
}

export async function classifyPatientMessage(message) {
  validateTriageInput(message);

  const model = getGeminiModel();
  const prompt = [
    "You are a clinical triage assistant.",
    "Return JSON only with keys: urgency, rating.",
    'urgency must be one of: "critical", "urgent", "not urgent".',
    "rating must be an integer from 1 to 100.",
    "Input message JSON:",
    JSON.stringify(message)
  ].join("\n");

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = JSON.parse(raw);

  return normalizeTriageOutput(parsed);
}

function parseJsonFromModelText(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const cleaned = trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "");
    return JSON.parse(cleaned);
  }
  return JSON.parse(trimmed);
}

export function normalizeIntakeOutput(output) {
  if (!output || typeof output !== "object") {
    throw new Error("AI intake output must be an object");
  }

  const category = Number(output.category);
  const description = String(output.description || "").trim();

  if (!Number.isInteger(category) || category < 1 || category > 5) {
    throw new Error("AI intake category must be an integer from 1 to 5");
  }

  if (!description) {
    throw new Error("AI intake description must be a non-empty string");
  }

  return { category, description };
}

export async function classifyPatientIntake(intake) {
  const model = getGeminiModel();
  const prompt = [
    "You are an emergency triage assistant.",
    "Return JSON only with keys: category, description.",
    "category must be one integer from 1..5 using ESI levels:",
    "1=Immediate (Resuscitation), 2=Emergent, 3=Urgent, 4=Less urgent, 5=Non-urgent.",
    "description must be a concise summary of the patient's incident.",
    "Input JSON:",
    JSON.stringify(intake)
  ].join("\n");

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = parseJsonFromModelText(raw);
  return normalizeIntakeOutput(parsed);
}
