export type SixtusPromptRuntime = {
  now?: Date;
};

export function formatUtcDate(date: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

  return `${formatted} (UTC)`;
}

export function formatSixtusRuntime(
  runtime: SixtusPromptRuntime = {},
): string {
  return [
    "## Runtime",
    `Date: ${formatUtcDate(runtime.now)}`,
    'Treat Date as authoritative for "today", "now", and the current year.',
  ].join("\n");
}
