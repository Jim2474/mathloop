const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return isValidDate(date) ? date : null;
}

export function isSameLocalDay(value: string, now: Date): boolean {
  const date = parseDate(value);
  if (!date) {
    return false;
  }
  const start = startOfLocalDay(now);
  const end = addDays(start, 1);
  return date >= start && date < end;
}

export function diffCalendarDays(left: Date, right: Date): number {
  const leftStart = startOfLocalDay(left).getTime();
  const rightStart = startOfLocalDay(right).getTime();
  return Math.max(0, Math.round((rightStart - leftStart) / DAY_MS));
}

export function formatDateTime(value?: string | null): string {
  const date = parseDate(value);
  if (!date) {
    return "暂无";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function parseDateTimeLocal(value: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return isValidDate(date) ? date : null;
}
