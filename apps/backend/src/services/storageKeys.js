export const PATIENT_DATA_BUCKET = "patient-data";

export function buildPatientDataObjectKey(patientUuid, timestamp = Date.now(), extension = "json") {
  const safeTimestamp = typeof timestamp === "number" ? Math.floor(timestamp) : Date.now();
  const safeExtension = String(extension || "json").replace(/^\./, "");

  return `${patientUuid}/${safeTimestamp}.${safeExtension}`;
}
