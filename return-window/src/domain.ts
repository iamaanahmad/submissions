export const stages = ["decide", "pack", "sent", "refunded", "kept"] as const;
export type Stage = (typeof stages)[number];
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function daysLeft(due: string, today: string) {
  return Math.round(
    (Date.parse(due + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) /
      86400000,
  );
}
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function safeUrl(input: string) {
  if (!input.trim()) return "";
  const u = new URL(input);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw Error("Use a public http or https policy link.");
  return u.href;
}
export function ical(name: string, due: string) {
  if (!validDate(due)) throw Error("Invalid date");
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Return Window//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@return-window`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${due.replaceAll("-", "")}`,
    `SUMMARY:${esc("Return deadline: " + name)}`,
    "DESCRIPTION:Check the shop policy and send your return before its cutoff.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
