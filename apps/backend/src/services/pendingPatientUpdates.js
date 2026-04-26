const pendingUpdates = new Map();

function buildId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function enqueuePendingPatientUpdate({
  patientUuid,
  timestamp,
  text,
  form,
  media,
  patientSnapshot,
  proposal
}) {
  const id = buildId();
  const record = {
    id,
    patientUuid,
    timestamp,
    text: text ?? null,
    form: form ?? null,
    media: Array.isArray(media) ? media : [],
    patientSnapshot: patientSnapshot || null,
    proposal: proposal || null,
    submittedAt: new Date().toISOString()
  };
  // Keep only the latest pending update per patient.
  pendingUpdates.set(patientUuid, record);

  return record;
}

export function listPendingPatientUpdates() {
  const result = Array.from(pendingUpdates.values());
  return result.sort((a, b) => {
    const aTime = new Date(a.submittedAt).getTime();
    const bTime = new Date(b.submittedAt).getTime();
    return bTime - aTime;
  });
}

export function consumePendingPatientUpdate({ patientUuid, pendingUpdateId }) {
  const record = pendingUpdates.get(patientUuid);
  if (!record || record.id !== pendingUpdateId) {
    return null;
  }
  pendingUpdates.delete(patientUuid);
  return record;
}

export function rejectPendingPatientUpdate({ patientUuid, pendingUpdateId }) {
  return consumePendingPatientUpdate({ patientUuid, pendingUpdateId });
}
