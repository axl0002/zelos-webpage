import { parsePublicScoreWeightRows, type PublicScoreWeight } from "./score-weights";
import { MAX_WEIGHT_ROWS, type WeightEdit } from "./score-weights-csv";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const weightRequestId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const weightFingerprint = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export type AdminWeightContext = { schema_version: 1; fingerprint: string; config_version: number; rankings_version: number; publication_revision: number;
  weights: (PublicScoreWeight & {board_id: string})[]; previous_weights: WeightEdit[] | null; latest_change: {id: string; created_at: string; reason: string} | null };
export type WeightReceipt = {ok: true; changed: boolean; request_id: string; config_version: number; rankings_version: number; publication_revision: number; changed_boards: number};
export type WeightApply = { request_id: string; expected_fingerprint: string; weights: WeightEdit[]; change_reason: string; confirmation: "APPLY" };
export function parseWeightEdits(value: unknown): WeightEdit[] {
  if (!Array.isArray(value) || value.length > MAX_WEIGHT_ROWS) throw Error("Invalid weight rows.");
  const rows = value.map(row => {
    if (!object(row) || Object.keys(row).length !== 2 || typeof row.board_id !== "string" || !row.board_id.length || row.board_id.length > 300 ||
        typeof row.weight !== "number" || !Number.isFinite(row.weight) || row.weight < 0) throw Error("Invalid weight rows.");
    return {board_id: row.board_id, weight: row.weight === 0 ? 0 : row.weight};
  });
  if (new Set(rows.map(row => row.board_id)).size !== rows.length) throw Error("Duplicate weight rows.");
  return rows.sort((a, b) => a.board_id.localeCompare(b.board_id));
}
export function parseAdminWeightContext(value: unknown): AdminWeightContext {
  if (!object(value) || value.schema_version !== 1 || !weightFingerprint(value.fingerprint) ||
      !integer(value.config_version) || !integer(value.rankings_version) || !integer(value.publication_revision) || value.publication_revision < 1) throw Error("Invalid weight context.");
  const weights = parsePublicScoreWeightRows(value.weights).map((row, i) => {
    if (!Array.isArray(value.weights) || !object(value.weights[i]) || value.weights[i].board_id !== row.id) throw Error("Invalid weight identity.");
    return {...row, board_id: row.id};
  });
  let latest: AdminWeightContext["latest_change"] = null;
  if (value.latest_change !== null) {
    const entry = value.latest_change;
    if (!object(entry) || !weightRequestId(entry.id) || typeof entry.created_at !== "string" || !Number.isFinite(Date.parse(entry.created_at)) ||
        typeof entry.reason !== "string" || entry.reason.length > 2000) throw Error("Invalid weight history.");
    latest = {id: entry.id, created_at: entry.created_at, reason: entry.reason};
  }
  return {schema_version: 1, fingerprint: value.fingerprint, config_version: value.config_version,
    rankings_version: value.rankings_version, publication_revision: value.publication_revision, weights,
    previous_weights: value.previous_weights === null ? null : parseWeightEdits(value.previous_weights), latest_change: latest};
}
export function parseWeightReceipt(value: unknown): WeightReceipt {
  if (!object(value) || value.ok !== true || typeof value.changed !== "boolean" || !weightRequestId(value.request_id) ||
      !integer(value.config_version) || !integer(value.rankings_version) || !integer(value.publication_revision) || value.publication_revision < 1 ||
      !integer(value.changed_boards) || value.changed_boards > MAX_WEIGHT_ROWS || value.changed !== (value.changed_boards > 0)) throw Error("Invalid weight receipt.");
  return {ok: true, changed: value.changed, request_id: value.request_id, config_version: value.config_version,
    rankings_version: value.rankings_version, publication_revision: value.publication_revision, changed_boards: value.changed_boards};
}
