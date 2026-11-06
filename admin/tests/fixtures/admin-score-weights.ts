import weights from "./score-weights.json";
import {parsePublicScoreWeightRows} from "../../src/lib/score-weights";
import type {AdminWeightContext} from "../../src/lib/admin-score-weights";
export const requestId = "11111111-2222-4333-8444-555555555555";
export const weightContext: AdminWeightContext = {schema_version: 1, fingerprint: "a".repeat(32), config_version: 2, rankings_version: 3,
  publication_revision: 70, weights: parsePublicScoreWeightRows(weights.weights).map(row => ({...row, board_id: row.id})), previous_weights: null, latest_change: null};
export const weightReceipt = {ok: true, changed: true, request_id: requestId, config_version: 3, rankings_version: 4, publication_revision: 71, changed_boards: 1};
export const updatedWeightContext = {...weightContext, fingerprint: "b".repeat(32), config_version: 3, rankings_version: 4, publication_revision: 71,
  weights: weightContext.weights.map((row, i) => i ? row : {...row, weight: 0})};
