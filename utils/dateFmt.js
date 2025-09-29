
export const toLocalYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Parse a YYYY-MM-DD string as a local date (midnight local time)
export const parseYMDLocal = (ymd) => {
  if (!ymd || typeof ymd !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) {
    const d = new Date(ymd);
    return isNaN(d) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  return new Date(y, mo, da);
};

// Resolve the user's timezone (device or app setting in future)
export function getUserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// Format a Date (or timestamp ms) in a human-friendly way, honoring the user's timezone
export function formatHumanDate(value, opts = {}) {
  const tz = opts.timeZone || getUserTimeZone();
  let d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: opts.weekday || 'short',
      month: opts.month || 'short',
      day: opts.day || 'numeric',
      year: opts.year || 'numeric',
      timeZone: tz,
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatHumanDateLong(value, opts = {}) {
  return formatHumanDate(value, { weekday: 'long', month: 'long', ...opts });
}
