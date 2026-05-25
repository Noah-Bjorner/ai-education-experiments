const ISO6392_TO_ISO6391: Record<string, string> = {
  eng: "en",
  swe: "sv",
  fra: "fr",
  fre: "fr",
  deu: "de",
  ger: "de",
  spa: "es",
  ita: "it",
  por: "pt",
  nld: "nl",
  dut: "nl",
  nor: "no",
  dan: "da",
  fin: "fi",
  pol: "pl",
  rus: "ru",
  jpn: "ja",
  kor: "ko",
  zho: "zh",
  chi: "zh",
};

const LANGUAGE_NAME_TO_ISO6391: Record<string, string> = {
  english: "en",
  swedish: "sv",
  french: "fr",
  german: "de",
  spanish: "es",
  italian: "it",
  portuguese: "pt",
  dutch: "nl",
  norwegian: "no",
  danish: "da",
  finnish: "fi",
  polish: "pl",
  russian: "ru",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
};

/** Normalize BCP-47 tags, ISO 639-2 codes, or language names to ISO 639-1. */
export function normalizeLanguageCode(language: string): string {
  const trimmed = language.trim();
  if (!trimmed) {
    throw new Error("Language is required");
  }

  const lower = trimmed.toLowerCase();
  if (lower === "auto") {
    return "auto";
  }

  if (/^[a-z]{2}$/.test(lower)) {
    return lower;
  }

  const alpha = lower.replace(/[^a-z]/g, "");
  const fromIso6392 = ISO6392_TO_ISO6391[alpha];
  if (fromIso6392) {
    return fromIso6392;
  }

  const fromName = LANGUAGE_NAME_TO_ISO6391[alpha];
  if (fromName) {
    return fromName;
  }

  try {
    const parsed = new Intl.Locale(lower.replaceAll("_", "-")).language;
    if (/^[a-z]{2}$/.test(parsed)) {
      return parsed;
    }
  } catch {
    // fall through
  }

  throw new Error(`Unsupported language: ${language}`);
}
