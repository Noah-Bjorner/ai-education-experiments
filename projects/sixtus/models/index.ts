import { z } from "@zod";

export type SixtusReasoningEffort = "minimal" | "low" | "medium" | "high";

export type SixtusModel = {
  id: string;
  name: string;
  releaseDate: string;
  intelligence: number;
  tps: number;
  reasoningEffort: SixtusReasoningEffort;
  provider?: string;
};

export const SIXTUS_MODELS = {
  "openai/gpt-5.6-luna": {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    releaseDate: "2026-07-09",
    intelligence: 52,
    tps: 131,
    reasoningEffort: "high",
  },
  "openai/gpt-5.6-terra": {
    id: "openai/gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    releaseDate: "2026-07-09",
    intelligence: 57,
    tps: 120,
    reasoningEffort: "high",
  },
  "openai/gpt-5.6-sol": {
    id: "openai/gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    releaseDate: "2026-07-09",
    intelligence: 61,
    tps: 74,
    reasoningEffort: "high",
  },
  "anthropic/claude-sonnet-5": {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    releaseDate: "2026-06-29",
    intelligence: 55,
    tps: 88,
    reasoningEffort: "high",
  },
  "xai/grok-4.5": {
    id: "xai/grok-4.5",
    name: "Grok 4.5",
    releaseDate: "2026-07-08",
    intelligence: 56,
    tps: 60,
    reasoningEffort: "high",
  },
  "xai/grok-4.6": {
    id: "xai/grok-4.6",
    name: "Grok 4.6",
    releaseDate: "2026-08-12",
    intelligence: 61,
    tps: 57,
    reasoningEffort: "high",
  },
  "google/gemini-3.6-flash": {
    id: "google/gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    releaseDate: "2026-07-21",
    intelligence: 52,
    tps: 210,
    reasoningEffort: "high",
  },
  "google/gemini-3.7-flash": {
    id: "google/gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    releaseDate: "2026-08-13",
    intelligence: 56,
    tps: 380,
    reasoningEffort: "high",
  },
  "meta/muse-spark-1.1": {
    id: "meta/muse-spark-1.1",
    name: "Muse Spark 1.1",
    releaseDate: "2026-07-09",
    intelligence: 53,
    tps: 237,
    reasoningEffort: "high",
  },
  "zai/glm-5.2": {
    id: "zai/glm-5.2",
    name: "GLM-5.2",
    releaseDate: "2026-06-16",
    intelligence: 53,
    tps: 70,
    reasoningEffort: "high",
  },
  "zai/glm-5.2-fast": {
    id: "zai/glm-5.2-fast",
    name: "GLM-5.2 Fast",
    releaseDate: "2026-06-23",
    intelligence: 53,
    tps: 180,
    reasoningEffort: "high",
  },
  "minimax/minimax-m3": {
    id: "minimax/minimax-m3",
    name: "MiniMax M3",
    releaseDate: "2026-05-31",
    intelligence: 45,
    tps: 136,
    reasoningEffort: "high",
  },
  "alibaba/qwen3.7-max": {
    id: "alibaba/qwen3.7-max",
    name: "Qwen3.7 Max",
    releaseDate: "2026-05-21",
    intelligence: 47,
    tps: 205,
    reasoningEffort: "high",
  },
  "zai/glm-5.3-flash": {
    id: "zai/glm-5.3-flash",
    name: "GLM-5.3 Flash",
    releaseDate: "2026-08-27",
    intelligence: 57,
    tps: 150,
    reasoningEffort: "high",
  },
  "google/gemini-3.8-flash": {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    releaseDate: "2026-09-03",
    intelligence: 59,
    tps: 350,
    reasoningEffort: "high",
  },
  "zai/glm-5.3-fast": {
    id: "zai/glm-5.3-fast",
    name: "GLM-5.3 Fast",
    releaseDate: "2026-09-03",
    intelligence: 60,
    tps: 180,
    reasoningEffort: "high",
  },
} as const satisfies Record<string, SixtusModel>;

export type SixtusGatewayModel = keyof typeof SIXTUS_MODELS;

export const all = Object.freeze(Object.values(SIXTUS_MODELS));

export function searchModelsByName(query: string): readonly SixtusModel[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return all.filter((model) =>
    model.name.toLocaleLowerCase().includes(normalizedQuery)
  );
}

export const featuredModelIds = [
  "xai/grok-4.6",
  "google/gemini-3.8-flash",
  "zai/glm-5.3-fast",
] as const satisfies readonly SixtusGatewayModel[];

export const featuredInApp = Object.freeze(
  featuredModelIds.map((id) => SIXTUS_MODELS[id]),
);

export const SIXTUS_GATEWAY_MODEL_CONFIG = all;

const gatewayModelIds = all.map((model) => model.id) as [
  SixtusGatewayModel,
  ...SixtusGatewayModel[],
];

const AUTO_ID = "auto";
export const SIXTUS_AUTO_MODEL = "google/gemini-3.8-flash" as const satisfies SixtusGatewayModel;

export const SIXTUS_MODEL_OPTIONS = [
  AUTO_ID,
  ...gatewayModelIds,
] as const;

export type SixtusModelPickerOption = typeof SIXTUS_MODEL_OPTIONS[number];

export const sixtusModelSchema = z
  .enum(SIXTUS_MODEL_OPTIONS)
  .default(AUTO_ID)
  .transform((value): SixtusGatewayModel =>
    value === AUTO_ID ? SIXTUS_AUTO_MODEL : value
  );
