const LAST_FAMILY_KEY = "giapha.lastFamilyId";

export function getLastFamilyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_FAMILY_KEY);
  } catch {
    return null;
  }
}

export function setLastFamilyId(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_FAMILY_KEY, id);
  } catch {
    /* ignore */
  }
}
