const patientSockets = new Map();

export function registerPatientSocket(patientUuid, ws) {
  if (!patientUuid) {
    return;
  }
  patientSockets.set(patientUuid, ws);
}

export function unregisterPatientSocket(patientUuid, ws) {
  if (!patientUuid) {
    return;
  }
  const existing = patientSockets.get(patientUuid);
  if (existing === ws) {
    patientSockets.delete(patientUuid);
  }
}

export function getPatientSocketCount() {
  return patientSockets.size;
}
