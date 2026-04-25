const SESSION_DURATION_HOURS = 8;
export const PATIENT_SESSION_COOKIE = "patient_session_uuid";

export function buildSessionWindow(startTimestamp = new Date()) {
  const startedAt = new Date(startTimestamp);
  const expiresAt = new Date(startedAt.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  return {
    startedAt,
    expiresAt
  };
}

export function hasActiveSession(sessionExpiresAt) {
  if (!sessionExpiresAt) {
    return false;
  }
  return new Date(sessionExpiresAt).getTime() > Date.now();
}

export function readCookieValue(cookieHeader, key) {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(";").map((part) => part.trim());
  for (const pair of pairs) {
    const [rawKey, ...rest] = pair.split("=");
    if (rawKey === key) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}
