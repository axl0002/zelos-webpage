import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import AdminScoreWeights from "../src/components/admin-score-weights";
import {exportWeightCsv} from "../src/lib/score-weights-csv";
import {weightContext,weightReceipt,updatedWeightContext,requestId} from "./fixtures/admin-score-weights";
const fetcher=vi.fn();let calls:Record<string,unknown>[],saved:boolean;
const changedCsv=exportWeightCsv(weightContext.weights.map((row,i)=>i?row:{...row,weight:0}));
beforeEach(()=>{calls=[];saved=false;vi.stubGlobal("fetch",fetcher);vi.stubGlobal("crypto",{randomUUID:()=>requestId});
  fetcher.mockImplementation(async(_url,init)=>{if(init?.body){calls.push(JSON.parse(init.body));saved=true;return{ok:true,json:async()=>weightReceipt};}return{ok:true,json:async()=>saved?updatedWeightContext:weightContext};});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
const setup=async()=>{render(<AdminScoreWeights/>);await screen.findByText(/26 currently ranked boards/);};
const upload=async(csv=changedCsv)=>{fireEvent.change(screen.getByLabelText("Edited weights CSV"),{target:{files:[new File([csv],"weights.csv",{type:"text/csv"})]}});await screen.findByRole("heading",{name:"Preview weight changes"});};
const confirm=()=>{fireEvent.change(screen.getByLabelText("Reason for weight change"),{target:{value:"Reviewed complete difficulty weights"}});fireEvent.change(screen.getByLabelText("Type APPLY to confirm"),{target:{value:"APPLY"}});};
it("only reads on open/upload and requires preview, reason and exact confirmation to apply once",async()=>{
  await setup();expect(calls).toEqual([]);await upload();expect(calls).toEqual([]);expect(screen.getByText("1 of 26 boards changed.")).toBeTruthy();
  const table=screen.getByRole("table",{name:"Current and edited exercise weights"});expect(within(table).getAllByRole("row")).toHaveLength(2);
  const apply=screen.getByRole("button",{name:"Apply weight changes"})as HTMLButtonElement;expect(apply.disabled).toBe(true);confirm();expect(apply.disabled).toBe(false);
  fireEvent.click(apply);fireEvent.click(apply);await screen.findByRole("heading",{name:"Weights applied"});expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({request_id:requestId,expected_fingerprint:weightContext.fingerprint,confirmation:"APPLY"});expect(calls[0].weights).toHaveLength(26);
  expect((calls[0].weights as {board_id:string;weight:number}[]).find(row=>row.board_id===weightContext.weights[0].id)?.weight).toBe(0);
  expect(screen.getByRole("link",{name:"Download current weights CSV"}).getAttribute("href")).toBe("/scoring/weights.csv");await screen.findByText(/Config version 3 · Ranking version 4/);
});
it("disables no-change apply and rejects edited labels without sending writes",async()=>{
  await setup();await upload(exportWeightCsv(weightContext.weights));confirm();expect((screen.getByRole("button",{name:"Apply weight changes"})as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Edited weights CSV"),{target:{files:[new File([changedCsv.replace(weightContext.weights[0].exercise,"Changed name")],"wrong.csv")]}});
  expect((await screen.findByRole("alert")).textContent).toContain("Only the weight column may change");expect(calls).toEqual([]);
});
it("retains the same request UUID and exact payload after an unknown completion response",async()=>{
  let attempts=0;fetcher.mockImplementation(async(_url,init)=>{if(init?.body){calls.push(JSON.parse(init.body));if(!attempts++)throw Error("lost response");saved=true;return{ok:true,json:async()=>weightReceipt};}return{ok:true,json:async()=>saved?updatedWeightContext:weightContext};});
  await setup();await upload();confirm();fireEvent.click(screen.getByRole("button",{name:"Apply weight changes"}));await screen.findByRole("alert");
  expect((screen.getByLabelText("Edited weights CSV")as HTMLInputElement).disabled).toBe(true);expect((screen.getByLabelText("Reason for weight change")as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Retry this apply"}));await screen.findByRole("heading",{name:"Weights applied"});expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
});
it("discards stale previews and requires a fresh file review with a new fingerprint",async()=>{
  fetcher.mockImplementation(async(_url,init)=>{if(init?.body){calls.push(JSON.parse(init.body));saved=true;return{ok:false,status:409,json:async()=>({error:"Scoring settings changed. Refresh current weights and review the CSV again before applying."})};}return{ok:true,json:async()=>saved?updatedWeightContext:weightContext};});
  await setup();await upload();confirm();fireEvent.click(screen.getByRole("button",{name:"Apply weight changes"}));await screen.findByRole("alert");
  await waitFor(()=>expect(screen.queryByRole("heading",{name:"Preview weight changes"})).toBeNull());expect(screen.queryByRole("button",{name:"Retry this apply"})).toBeNull();expect(calls).toHaveLength(1);await screen.findByText(/Config version 3 · Ranking version 4/);
});
it("offers previous weights only when their board set matches current context",async()=>{
  fetcher.mockResolvedValue({ok:true,json:async()=>({...updatedWeightContext,previous_weights:weightContext.weights.map(row=>({board_id:row.id,weight:row.weight})),latest_change:{id:requestId,created_at:"2026-11-06T00:00:00Z",reason:"Reviewed weights"}})});
  await setup();const link=await screen.findByRole("link",{name:"Download previous weights CSV"});expect(link.getAttribute("download")).toContain("previous.csv");expect(decodeURIComponent(link.getAttribute("href")!)).toContain("board_id,exercise,progression,discipline,metric,weight");expect(calls).toEqual([]);
});
