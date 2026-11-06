import type { ScoreWeight } from "./score-rules";
export const WEIGHT_CSV_HEADERS = ["board_id", "exercise", "progression", "discipline", "metric", "weight"] as const;
export const MAX_WEIGHT_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_WEIGHT_ROWS = 500;
export type WeightEdit = { board_id: string; weight: number };

// Quoting alone does not stop spreadsheet formula execution. The apostrophe
// is part of the CSV value, and imports accept it only for its exact known label.
export const csvLabel = (value: string) => /^[\t\r\n]|^\s*[=+\-@]/.test(value) ? "'" + value : value;
const cell = (value: string) => /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
export function exportWeightCsv(rows: readonly ScoreWeight[]): string {
  const current = rows.filter(row => row.enabled && (row.availability ?? "active") === "active");
  if (current.length > MAX_WEIGHT_ROWS || current.some(row => !Number.isFinite(row.weight) || row.weight < 0)) throw Error("Invalid current weights.");
  return "\uFEFF" + WEIGHT_CSV_HEADERS.join(",") + "\r\n" + current.map(row => [
    row.id, row.exercise, row.progression ?? "", row.discipline, row.metric,
  ].map(value => cell(csvLabel(value))).concat(String(row.weight)).join(",")).join("\r\n") + (current.length ? "\r\n" : "");
}

function csvRows(input: string): string[][] {
  if (new TextEncoder().encode(input).byteLength > MAX_WEIGHT_CSV_BYTES) throw Error("CSV must be no larger than 2 MiB.");
  const source = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false, closed = false;
  const field = () => { if (row.length >= WEIGHT_CSV_HEADERS.length) throw Error("CSV row has too many cells."); row.push(value); value = ""; closed = false; };
  const line = () => { field(); rows.push(row); row = []; if (rows.length > MAX_WEIGHT_ROWS + 1) throw Error("CSV has too many rows."); };
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (character === "\0") throw Error("CSV contains invalid text.");
    if (quoted) {
      if (character === '"') {
        if (source[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; }
      } else value += character;
    } else if (character === ",") field();
    else if (character === "\r" || character === "\n") { line(); if (character === "\r" && source[i + 1] === "\n") i++; }
    else if (closed) throw Error("CSV has text after a closing quote.");
    else if (character === '"') { if (value) throw Error("CSV contains an invalid quote."); quoted = true; }
    else value += character;
  }
  if (quoted) throw Error("CSV has an unclosed quoted cell.");
  if (value || row.length || closed) line();
  return rows;
}

export function parseWeightCsv(input: string, current: readonly ScoreWeight[]): WeightEdit[] {
  const rows = csvRows(input), header = rows.shift();
  if (!header || header.length !== WEIGHT_CSV_HEADERS.length || new Set(header).size !== header.length ||
      WEIGHT_CSV_HEADERS.some(name => !header.includes(name))) throw Error("CSV must have exactly these headers: " + WEIGHT_CSV_HEADERS.join(", ") + ".");
  const known = current.filter(row => row.enabled && (row.availability ?? "active") === "active");
  if (rows.length !== known.length) throw Error(`CSV must include all ${known.length} current ranked boards exactly once.`);
  const index = (name: typeof WEIGHT_CSV_HEADERS[number]) => header.indexOf(name), seen = new Set<string>();
  const equal = (actual: string, expected: string) => actual === expected || actual === csvLabel(expected);
  return rows.map((row, position) => {
    const line = position + 2;
    if (row.length !== header.length) throw Error(`CSV row ${line} has the wrong number of cells.`);
    const matches = known.filter(board => equal(row[index("board_id")], board.id));
    if (matches.length !== 1) throw Error(`Unknown or ambiguous board ID on CSV row ${line}.`);
    const board = matches[0]; if (seen.has(board.id)) throw Error(`Duplicate board ID on CSV row ${line}.`); seen.add(board.id);
    for (const [key, expected] of [["exercise", board.exercise], ["progression", board.progression ?? ""],
      ["discipline", board.discipline], ["metric", board.metric]] as const) {
      if (!equal(row[index(key)], expected)) throw Error(`Only the weight column may change (CSV row ${line}).`);
    }
    const numeric = row[index("weight")].trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(numeric) || !Number.isFinite(Number(numeric)) || Number(numeric) < 0) {
      throw Error(`Enter a finite nonnegative numeric weight on CSV row ${line}.`);
    }
    return { board_id: board.id, weight: Number(numeric) === 0 ? 0 : Number(numeric) };
  }).sort((a, b) => a.board_id.localeCompare(b.board_id));
}
