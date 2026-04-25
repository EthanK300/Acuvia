const SESSION_DURATION_HOURS = 8;

export function buildSessionWindow(startTimestamp = new Date()) {
  const startedAt = new Date(startTimestamp);
  const expiresAt = new Date(startedAt.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  return {
    startedAt,
    expiresAt
  };
}
