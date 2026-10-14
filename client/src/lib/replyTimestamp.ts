const replyDateTimeFormatter = new Intl.DateTimeFormat('ar-SY', {
  timeZone: 'Europe/Istanbul',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatReplyTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : replyDateTimeFormatter.format(date);
}
