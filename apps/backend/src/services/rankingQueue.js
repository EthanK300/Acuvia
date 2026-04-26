import {
  getPatientForRanking,
  listCategoryPatientsForRanking,
  updateCategoryRanks
} from "../db/patients.js";
import { chooseInsertionIndexForCategory } from "./aiTriage.js";

const queue = [];
const queuedByPatient = new Set();
let processing = false;

function safeText(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function payloadText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  if (typeof payload.text === "string") {
    return payload.text;
  }
  return "";
}

function scoreCase(caseItem) {
  const text = `${safeText(caseItem.description)} ${safeText(payloadText(caseItem.latest_payload))}`;
  let keywordScore = 0;

  if (text.includes("cardiac") || text.includes("respiratory") || text.includes("shock")) keywordScore += 60;
  if (text.includes("stroke") || text.includes("chest pain") || text.includes("bleeding")) keywordScore += 40;
  if (text.includes("trauma") || text.includes("infection") || text.includes("abdominal")) keywordScore += 20;

  const createdAt = new Date(caseItem.created_at).getTime();
  const waitMinutes = Number.isNaN(createdAt) ? 0 : Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  const waitScore = Math.min(waitMinutes, 120);

  return keywordScore + waitScore;
}

function compareCases(a, b) {
  const scoreA = scoreCase(a);
  const scoreB = scoreCase(b);
  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  const aCreated = new Date(a.created_at).getTime();
  const bCreated = new Date(b.created_at).getTime();
  return aCreated - bCreated;
}

async function determineInsertionIndex(candidates, targetCase, { requireAiComparison = true } = {}) {
  const sortedCandidates = [...candidates].sort(compareCases);

  try {
    const aiChoice = await chooseInsertionIndexForCategory(targetCase, sortedCandidates);
    return {
      insertionIndex: aiChoice.insertIndex,
      sortedCandidates
    };
  } catch (error) {
    if (requireAiComparison) {
      throw error;
    }
    console.warn("[ranking-queue] AI insertion failed, using heuristic fallback:", error.message);
    const fallbackIndex = sortedCandidates.findIndex((item) => compareCases(targetCase, item) < 0);
    return {
      insertionIndex: fallbackIndex === -1 ? sortedCandidates.length : fallbackIndex,
      sortedCandidates
    };
  }
}

export async function calculateInitialRankForCase(targetCase, { requireAiComparison = true } = {}) {
  const category = Number(targetCase?.category);
  if (!Number.isInteger(category) || category < 1 || category > 5) {
    return 1;
  }

  const categoryPatients = await listCategoryPatientsForRanking(category);
  console.log("[ranking-queue] initial rank candidates", {
    category,
    sameCategoryCount: categoryPatients.length,
    requireAiComparison
  });

  const { insertionIndex } = await determineInsertionIndex(categoryPatients, {
    ...targetCase,
    created_at: targetCase.created_at || new Date().toISOString(),
    latest_payload: targetCase.latest_payload || null
  }, {
    requireAiComparison
  });

  return insertionIndex + 1;
}

async function assignRankForPatient(patientUuid) {
  const patient = await getPatientForRanking(patientUuid);
  if (!patient) {
    return;
  }

  const category = Number(patient.category);
  if (!Number.isInteger(category) || category < 1 || category > 5) {
    return;
  }

  const categoryPatients = await listCategoryPatientsForRanking(category);
  const withoutTarget = categoryPatients.filter((item) => item.uuid !== patientUuid);

  const { insertionIndex, sortedCandidates } = await determineInsertionIndex(withoutTarget, patient, {
    requireAiComparison: false
  });

  const ordered = [...sortedCandidates];
  ordered.splice(insertionIndex, 0, patient);

  const assignments = ordered.map((item, index) => ({
    patientUuid: item.uuid,
    numberRank: index + 1
  }));

  await updateCategoryRanks(assignments);
}

async function processQueue() {
  if (processing) {
    return;
  }
  processing = true;

  try {
    while (queue.length > 0) {
      const event = queue.shift();
      queuedByPatient.delete(event.patientUuid);
      await assignRankForPatient(event.patientUuid);
    }
  } finally {
    processing = false;
  }
}

export function enqueueRankingEvent(patientUuid, reason = "update") {
  if (!patientUuid || queuedByPatient.has(patientUuid)) {
    return;
  }

  queue.push({
    patientUuid,
    reason,
    queuedAt: Date.now()
  });
  queuedByPatient.add(patientUuid);

  setImmediate(() => {
    processQueue().catch((error) => {
      console.error("[ranking-queue] failed", error);
    });
  });
}
