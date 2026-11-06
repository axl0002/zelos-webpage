import {expect, it} from "vitest";
import {csvLabel, exportWeightCsv, MAX_WEIGHT_CSV_BYTES, parseWeightCsv} from "../src/lib/score-weights-csv";
import {parsePublicScoreWeights} from "../src/lib/score-weights";
import fixture from "./fixtures/score-weights.json";
const current = parsePublicScoreWeights(fixture).weights;
const csv = exportWeightCsv(current);
const rows = csv.slice(1).trimEnd().split("\r\n");
const modify = (change: (cells: string[][]) => void) => { const cells = rows.map(row => row.split(",")); change(cells); return cells.map(row => row.join(",")).join("\r\n"); };
it("exports exact stable headers and current26 ranked rows, with unchanged real Press weights and no unranked placeholders", () => {
  expect(csv.startsWith("\uFEFFboard_id,exercise,progression,discipline,metric,weight\r\n")).toBe(true);
  expect(rows).toHaveLength(27); expect(csv).not.toContain("pelican");
  expect(parseWeightCsv(csv, current)).toEqual(current.map(row => ({board_id: row.id, weight: row.weight})).sort((a,b)=>a.board_id.localeCompare(b.board_id)));
  for (const weight of [45,65,95]) expect(csv).toMatch(new RegExp("front-lever-press-[^\\r\\n]+,"+weight+"\\r\\n"));
});
it("roundtrips quoted comma/quote/newline labels and accepts BOM, CRLF, LF and reordered rows/headers", () => {
  const one = [{...current[0], exercise:'Exercise, "quoted"\r\nsecond line', progression:"Full"}];
  expect(parseWeightCsv(exportWeightCsv(one),one)).toEqual([{board_id:one[0].id,weight:one[0].weight}]);
  const reordered=rows.map(row=>row.split(",").reverse().join(","));
  expect(parseWeightCsv(reordered.join("\n"),current)).toEqual(parseWeightCsv(csv,current));
  expect(parseWeightCsv([rows[0],...rows.slice(1).reverse()].join("\n"),current)).toEqual(parseWeightCsv(csv,current));
});
it("accepts zero, decimals, quoted numbers and finite scientific notation without changing labels", () => {
  for(const [literal,expected]of [["0",0],["12.125",12.125],['".5"',.5],["1e2",100],["-0",0]]){
    const result=parseWeightCsv(modify(cells=>{cells[1][5]=String(literal);}),current);
    expect(result.find(row=>row.board_id===current[0].id)?.weight).toBe(expected);
  }
});
it("rejects partial/duplicate/unknown boards, changed labels, malformed headers, invalid numbers and quotes", () => {
  for(const value of [
    modify(cells=>{cells.pop();}),modify(cells=>{cells[2]=cells[1];}),modify(cells=>{cells[1][0]="unknown-board";}),
    modify(cells=>{cells[1][1]="Changed exercise";}),modify(cells=>{cells[1][2]="Changed progression";}),
    modify(cells=>{cells[1][3]="freestyle";}),modify(cells=>{cells[1][4]="points";}),
    modify(cells=>{cells[0][1]="board_id";}),modify(cells=>{cells[0][1]="unknown_header";}),
    ...["", "-1", "NaN", "Infinity", "1e999", "0x10", "1/2", "=1+2", '"1,000"'].map(weight=>modify(cells=>{cells[1][5]=weight;})),
    csv+'"unclosed',csv.replace("board_id",'"board_id"x'),
  ]) expect(()=>parseWeightCsv(value,current)).toThrow();
  expect(()=>parseWeightCsv("x".repeat(MAX_WEIGHT_CSV_BYTES+1),current)).toThrow(/2 MiB/);
});
it("neutralizes spreadsheet formulas in exported labels and accepts only those exact protected labels on import", () => {
  for(const exercise of ["=HYPERLINK(\"unsafe\")","+SUM(1,2)","-SUM(1)","@SUM(1)","  =1+2","\t=1"]){
    const one=[{...current[0],exercise}]; const protectedCsv=exportWeightCsv(one);
    expect(csvLabel(exercise)).toBe("'"+exercise);expect(protectedCsv).toContain("'"+exercise.replaceAll('"','""'));
    expect(parseWeightCsv(protectedCsv,one)).toEqual([{board_id:one[0].id,weight:one[0].weight}]);
  }
});
