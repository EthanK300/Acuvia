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

export function sendPatientAlert(patientUuid, message) {
  const ws = patientSockets.get(patientUuid);
  if (!ws || ws.readyState !== 1) {
    return false;
  }

  ws.send(
    JSON.stringify({
      type: "nurse-alert",
      message
    })
  );
  return true;
}
