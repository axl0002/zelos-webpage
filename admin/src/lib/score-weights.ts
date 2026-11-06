import type { ScoreWeight } from "./score-rules";

export type PublicScoreWeight = Omit<ScoreWeight, "enabled" | "availability"> & {
  enabled: true;
  availability: "active";
};
export type UnrankedExercise = {
  id: string;
  name: string;
  discipline: "push" | "pull";
  metric: "reps" | "seconds";
  availability: "coming_soon";
};
export type PublicScoreWeights = {
  schema_version: 1;
  revision: number;
  updated_at: string;
  weights: PublicScoreWeight[];
  unranked_exercises: UnrankedExercise[];
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 300;
const discipline = (value: unknown) => value === "push" || value === "pull";
const metric = (value: unknown) => value === "reps" || value === "seconds";

// This is a separate public allowlist, not a partial alternative formula.
// Reconstruct every object so upstream/private fields never enter HTML or JSON.
export function parsePublicScoreWeights(value: unknown): PublicScoreWeights {
  const fail = (): never => { throw new Error("Exercise weights unavailable"); };
  if (!object(value) || value.schema_version !== 1 ||
      typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at)) ||
      !Array.isArray(value.weights) || value.weights.length > 500 ||
      !Array.isArray(value.unranked_exercises) || value.unranked_exercises.length > 500) return fail();
  const weights: PublicScoreWeight[] = value.weights.map((row: unknown) => {
    if (!object(row) || !text(row.id) || !text(row.name) || !text(row.exercise) ||
        (row.progression !== null && !text(row.progression)) || !discipline(row.discipline) ||
        !metric(row.metric) || typeof row.weight !== "number" || !Number.isFinite(row.weight) || row.weight < 0 ||
        row.enabled !== true || row.availability !== "active") return fail();
    return { id: row.id, name: row.name, exercise: row.exercise, progression: row.progression as string | null,
      discipline: row.discipline as "push" | "pull", metric: row.metric as "reps" | "seconds",
      weight: row.weight, enabled: true, availability: "active" };
  });
  const unranked: UnrankedExercise[] = value.unranked_exercises.map((row: unknown) => {
    if (!object(row) || !text(row.id) || !text(row.name) || !discipline(row.discipline) ||
        !metric(row.metric) || row.availability !== "coming_soon") return fail();
    return { id: row.id, name: row.name, discipline: row.discipline as "push" | "pull",
      metric: row.metric as "reps" | "seconds", availability: "coming_soon" };
  });
  if (new Set(weights.map(row => row.id)).size !== weights.length ||
      new Set(unranked.map(row => row.id)).size !== unranked.length) return fail();
  return { schema_version: 1, revision: value.revision, updated_at: value.updated_at,
    weights, unranked_exercises: unranked };
}
