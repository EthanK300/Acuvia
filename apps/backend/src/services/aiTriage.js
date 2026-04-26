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
  console.log("[ai-triage] intake classification request", {
    hasFirstName: Boolean(intake?.firstName),
    hasLastName: Boolean(intake?.lastName),
    hasBirthday: Boolean(intake?.birthday),
    hasIncident: Boolean(intake?.incident)
  });
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
  const normalized = normalizeIntakeOutput(parsed);
  console.log("[ai-triage] intake classification response", {
    category: normalized.category,
    hasDescription: Boolean(normalized.description)
  });
  return normalized;
}

function waitMinutesFromTimestamp(timestamp) {
  const createdAt = new Date(timestamp).getTime();
  if (Number.isNaN(createdAt)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
}

function normalizeCaseComparisonOutput(output) {
  if (!output || typeof output !== "object") {
    throw new Error("AI comparison output must be an object");
  }

  const verdict = String(output.verdict || "").toLowerCase().trim();
  if (!["more_severe", "less_severe", "equal"].includes(verdict)) {
    throw new Error("AI comparison verdict must be one of: more_severe, less_severe, equal");
  }

  return {
    verdict,
    rationale: String(output.rationale || "").trim()
  };
}

export async function compareCasesForRanking(targetCase, referenceCase) {
  console.log("[ai-triage] ranking comparison request", {
    targetHasDescription: Boolean(targetCase?.description),
    referenceHasDescription: Boolean(referenceCase?.description)
  });
  const model = getGeminiModel();
  const prompt = [
    "You are an emergency triage ranking assistant.",
    "Compare the TARGET case against the REFERENCE case for ordering within the same ESI category.",
    "Return JSON only with keys: verdict, rationale.",
    'verdict must be one of: "more_severe", "less_severe", "equal".',
    "Use this context for ESI:",
    "ESI 1 — Immediate (Resuscitation): life-saving intervention now.",
    "ESI 2 — Emergent (High risk): stable but can deteriorate quickly.",
    "ESI 3 — Urgent: needs multiple resources.",
    "ESI 4 — Less urgent.",
    "ESI 5 — Non-urgent.",
    "When comparing within the same category, consider incident description details and elapsed waiting time from created_at.",
    "TARGET:",
    JSON.stringify({
      description: targetCase.description || "",
      latestText: targetCase.latest_payload?.text || "",
      createdAt: targetCase.created_at,
      waitMinutes: waitMinutesFromTimestamp(targetCase.created_at)
    }),
    "REFERENCE:",
    JSON.stringify({
      description: referenceCase.description || "",
      latestText: referenceCase.latest_payload?.text || "",
      createdAt: referenceCase.created_at,
      waitMinutes: waitMinutesFromTimestamp(referenceCase.created_at)
    })
  ].join("\n");

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = parseJsonFromModelText(raw);
  const normalized = normalizeCaseComparisonOutput(parsed);
  console.log("[ai-triage] ranking comparison response", {
    verdict: normalized.verdict
  });
  return normalized;
}

function compactCaseForRanking(caseItem) {
  return {
    id: caseItem.uuid,
    description: String(caseItem.description || "").slice(0, 280),
    latestText: String(caseItem.latest_payload?.text || "").slice(0, 280),
    waitMinutes: waitMinutesFromTimestamp(caseItem.created_at)
  };
}

function normalizeInsertionOutput(output, candidateCount) {
  if (!output || typeof output !== "object") {
    throw new Error("AI insertion output must be an object");
  }

  const insertIndex = Number(output.insertIndex);
  if (!Number.isInteger(insertIndex)) {
    throw new Error("AI insertion insertIndex must be an integer");
  }

  const clampedIndex = Math.max(0, Math.min(candidateCount, insertIndex));
  return {
    insertIndex: clampedIndex,
    rationale: String(output.rationale || "").trim()
  };
}

export async function chooseInsertionIndexForCategory(targetCase, categoryCases) {
  const candidates = Array.isArray(categoryCases) ? categoryCases : [];
  console.log("[ai-triage] category insertion request", {
    category: targetCase?.category,
    candidateCount: candidates.length
  });

  const model = getGeminiModel();
  const prompt = [
    "You are an emergency triage ranking assistant.",
    "All cases are in the same ESI category.",
    "Return JSON only with keys: insertIndex, rationale.",
    "insertIndex must be an integer from 0 to N, where N is the number of existing cases.",
    "insertIndex means where TARGET should be inserted into EXISTING_ORDER (0 is front/highest priority).",
    "Prioritize higher severity details first; use wait time as tie-breaker.",
    "EXISTING_ORDER is currently sorted highest-priority first.",
    `N=${candidates.length}`,
    "TARGET:",
    JSON.stringify(compactCaseForRanking(targetCase)),
    "EXISTING_ORDER:",
    JSON.stringify(candidates.map(compactCaseForRanking))
  ].join("\n");

  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const parsed = parseJsonFromModelText(raw);
  const normalized = normalizeInsertionOutput(parsed, candidates.length);
  console.log("[ai-triage] category insertion response", {
    insertIndex: normalized.insertIndex
  });
  return normalized;
}
