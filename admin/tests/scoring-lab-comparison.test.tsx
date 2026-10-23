import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import ScoringLabComparison from "../src/components/scoring-lab-comparison";
import {algorithms,algoId,athleteId,baselineId,dataset,detail,results,row,run,runId} from "./fixtures/scoring-lab";

const ok=(value:unknown)=>({ok:true,json:async()=>value});
const uuid=(v:number)=>`00000000-0000-4000-8000-${String(v).padStart(12,"0")}`;
function query(url:string){return new URL(url,"https://test.local").searchParams;}
function response(url:string,overrides:Record<string,unknown>={}){const q=query(url);return {...results,algorithm_id:q.get("algorithm"),run_id:q.get("run"),rows:[{...row,discipline:q.get("discipline"),gender:q.get("gender")??"male"}],...overrides};}
function detailResponse(url:string,overrides:Record<string,unknown>={}){const q=query(url);return {...detail,athlete_id:q.get("athlete"),discipline:q.get("discipline"),...overrides};}
function setup(fetch=vi.fn(async(url:string)=>ok(query(url).get("view")==="detail"?detailResponse(url):response(url)))){vi.stubGlobal("fetch",fetch);return fetch;}
function page(){return render(<ScoringLabComparison run={run} algorithms={algorithms as never} dataset={dataset}/>);}
const board=(algorithm="Hybrid 50/50",discipline="Push")=>screen.getByRole("table",{name:`${algorithm} ${discipline} Elo leaderboard`});
async function loaded(){await screen.findByRole("table",{name:"Hybrid 50/50 Pull Elo leaderboard"});}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});

it("shows both discipline leaderboards for every run algorithm without an algorithm or discipline switch",async()=>{
 const fetch=setup();page();await loaded();
 expect(screen.getAllByRole("table",{name:/Elo leaderboard/})).toHaveLength(4);
 expect(screen.getByRole("region",{name:"Push Elo leaderboards"})).toBeTruthy();
 expect(screen.getByRole("region",{name:"Pull Elo leaderboards"})).toBeTruthy();
 expect(screen.queryByLabelText("Discipline")).toBeNull();expect(screen.queryByLabelText("Leaderboard algorithm")).toBeNull();
 const calls=fetch.mock.calls.map(([url])=>query(url));
 expect(new Set(calls.map(q=>q.get("algorithm")))).toEqual(new Set(run.algorithm_ids));
 expect(new Set(calls.map(q=>q.get("discipline")))).toEqual(new Set(["push","pull"]));
 for(const q of calls){expect(q.get("run")).toBe(runId);expect(q.get("offset")).toBe("0");expect(q.get("gender")).toBe("male");}
 expect(screen.getAllByText("male · GB")).toHaveLength(4);expect(screen.getByRole("button",{name:"Male"}).getAttribute("aria-pressed")).toBe("true");expect(screen.getByRole("button",{name:"Female"}).getAttribute("aria-pressed")).toBe("false");expect(screen.queryByText("All recorded genders")).toBeNull();
});

it("bounds all Push/Pull reads at four concurrent requests even with nine versions",async()=>{
 let active=0,maximum=0;
 const fetch=setup(vi.fn(async(url:string)=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return ok(response(url));}));
 const versions=Array.from({length:9},(_,i)=>({...algorithms[1],id:uuid(30+i),name:`Algorithm ${i+1}`}));
 render(<ScoringLabComparison run={{...run,algorithm_ids:versions.map(v=>v.id)}} algorithms={versions as never} dataset={dataset}/>);
 await screen.findByRole("table",{name:"Algorithm 9 Pull Elo leaderboard"});
 expect(fetch).toHaveBeenCalledTimes(18);expect(maximum).toBe(4);expect(active).toBe(0);
 expect(screen.getAllByRole("table",{name:/Elo leaderboard/})).toHaveLength(18);
});

it("keeps pagination independent per discipline and compares ranks outside the displayed page",async()=>{
 const fetch=setup(vi.fn(async(url:string)=>{
  const q=query(url);if(q.get("view")==="detail")return ok(detailResponse(url,{rank:q.get("algorithm")===baselineId?2:77,score:q.get("algorithm")===baselineId?50:19}));
  return ok(response(url,{total:101,rows:[{...row,discipline:q.get("discipline"),rank:Number(q.get("offset"))+1}]}));
 }));page();await loaded();
 fireEvent.click(screen.getByRole("button",{name:"Next Push page"}));
 await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>query(url).get("offset")==="50")).toHaveLength(2));
 expect(fetch.mock.calls.filter(([url])=>query(url).get("discipline")==="pull")).toHaveLength(2);
 await waitFor(()=>expect(within(board()).getByText("#51")).toBeTruthy());
 fireEvent.click(within(board()).getByRole("button",{name:"Compare test_athlete push across algorithms"}));
 const comparison=await screen.findByRole("table",{name:"Athlete ranks across algorithms"});
 await waitFor(()=>expect(within(comparison).getByText("#77")).toBeTruthy());
 expect(within(comparison).getByText("19")).toBeTruthy();
 expect(fetch.mock.calls.filter(([url])=>query(url).get("view")==="detail")).toHaveLength(2);
 expect(screen.getAllByText("provisional_seconds_30")).toHaveLength(1);
});

it("applies the same gender and country filters to every board while preserving supplied tied ranks",async()=>{
 const fetch=setup(vi.fn(async(url:string)=>ok(response(url,{rows:[{...row,discipline:query(url).get("discipline"),gender:query(url).get("gender"),rank:1},{...row,athlete_id:uuid(20),username:"other",discipline:query(url).get("discipline"),gender:query(url).get("gender"),rank:1}]}))));page();await loaded();
 expect(within(board()).getAllByText("#1")).toHaveLength(2);
 fireEvent.click(screen.getByRole("button",{name:"Female"}));
 await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>query(url).get("gender")==="female")).toHaveLength(4));
 const before=fetch.mock.calls.length;
 fireEvent.change(screen.getByLabelText("Country filter (two-letter code)"),{target:{value:"g"}});
 await act(async()=>{});expect(fetch.mock.calls.length).toBe(before);
 fireEvent.change(screen.getByLabelText("Country filter (two-letter code)"),{target:{value:"gb"}});
 await waitFor(()=>expect(fetch.mock.calls.filter(([url])=>query(url).get("country")==="gb")).toHaveLength(4));
 for(const[url]of fetch.mock.calls.slice(-4)){expect(query(url).get("gender")).toBe("female");expect(query(url).get("offset")).toBe("0");}
 await waitFor(()=>expect(screen.getAllByText("female · GB")).toHaveLength(8));
 expect(screen.queryByText("male · GB")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Male"}));
 await waitFor(()=>expect(screen.getAllByText("male · GB")).toHaveLength(8));
 expect(screen.queryByText("female · GB")).toBeNull();
 for(const[url]of fetch.mock.calls.slice(-4)){expect(query(url).get("gender")).toBe("male");expect(query(url).get("country")).toBe("gb");}
});

it("retains other boards when a single version fails and retries only that discipline",async()=>{
 let fail=true;
 const fetch=setup(vi.fn(async(url:string)=>query(url).get("algorithm")===algoId&&query(url).get("discipline")==="pull"&&fail?{ok:false,json:async()=>({error:"A private result could not load."})}:ok(response(url))));page();
 expect(await screen.findByRole("alert")).toHaveProperty("textContent","A private result could not load.");
 expect(screen.getAllByRole("table",{name:/Elo leaderboard/})).toHaveLength(3);
 const pushReads=fetch.mock.calls.filter(([url])=>query(url).get("discipline")==="push").length;fail=false;
 fireEvent.click(screen.getByRole("button",{name:"Retry Pull leaderboards"}));await loaded();
 expect(fetch.mock.calls.filter(([url])=>query(url).get("discipline")==="push")).toHaveLength(pushReads);
 expect(screen.getAllByRole("table",{name:/Elo leaderboard/})).toHaveLength(4);
});

it.each(["run","dataset","algorithm","discipline","gender"])("refuses mismatched %s response data",async mismatch=>{
 setup(vi.fn(async(url:string)=>{
  const q=query(url),invalid=q.get("algorithm")===algoId&&q.get("discipline")==="push";
  const value=response(url);if(invalid){if(mismatch==="gender")value.rows=[{...row,username:"wrong_result",discipline:"push",gender:"female"}];else if(mismatch==="discipline")value.rows=[{...row,username:"wrong_result",discipline:"pull"}];else{(value as Record<string,unknown>)[mismatch+"_id"]=uuid(99);value.rows=[{...row,username:"wrong_result"}];}}
  return ok(value);
 }));page();await loaded();await screen.findByRole("alert");expect(screen.queryByText("@wrong_result")).toBeNull();
 expect(screen.getAllByRole("table",{name:/Elo leaderboard/})).toHaveLength(3);
});

it("aborts an old athlete comparison and ignores its late response",async()=>{
 const pending:{url:string;signal?:AbortSignal|null;resolve:(v:ReturnType<typeof ok>)=>void}[]=[];
 setup(vi.fn((url:string,options?:RequestInit)=>query(url).get("view")==="detail"?new Promise<ReturnType<typeof ok>>(resolve=>pending.push({url,signal:options?.signal,resolve})):Promise.resolve(ok(response(url,{rows:[{...row,discipline:query(url).get("discipline")},{...row,athlete_id:uuid(21),username:"new_athlete",discipline:query(url).get("discipline")}]})))));
 page();await loaded();fireEvent.click(within(board()).getByRole("button",{name:"Compare test_athlete push across algorithms"}));
 await waitFor(()=>expect(pending).toHaveLength(2));
 fireEvent.click(within(board()).getByRole("button",{name:"Compare new_athlete push across algorithms"}));
 await waitFor(()=>expect(pending).toHaveLength(4));expect(pending[0].signal?.aborted).toBe(true);expect(pending[1].signal?.aborted).toBe(true);
 await act(async()=>{for(const p of pending.slice(2))p.resolve(ok(detailResponse(p.url,{username:"new_athlete"})));});
 await screen.findByText(/@new_athlete · push/);
 await act(async()=>{for(const p of pending.slice(0,2))p.resolve(ok(detailResponse(p.url,{username:"stale_detail"})));});
 expect(screen.queryByText(/stale_detail/)).toBeNull();
});

it("clears athlete detail on filter and page changes and aborts all reads on unmount",async()=>{
 const pending:AbortSignal[]=[];
 setup(vi.fn((url:string,options?:RequestInit)=>{
  if(query(url).get("view")==="detail"){pending.push(options!.signal as AbortSignal);return new Promise<ReturnType<typeof ok>>(()=>{});}
  return Promise.resolve(ok(response(url,{total:101})));
 }));const view=page();await loaded();fireEvent.click(within(board()).getByRole("button",{name:"Compare test_athlete push across algorithms"}));
 await waitFor(()=>expect(pending).toHaveLength(2));fireEvent.click(screen.getByRole("button",{name:"Next Push page"}));
 expect(pending.every(signal=>signal.aborted)).toBe(true);expect(screen.queryByRole("region",{name:"Athlete position comparison"})).toBeNull();
 await waitFor(()=>expect(screen.getByRole("button",{name:"Next Push page"})).toHaveProperty("disabled",false));
 fireEvent.click(within(board()).getByRole("button",{name:"Compare test_athlete push across algorithms"}));await waitFor(()=>expect(pending).toHaveLength(4));
 fireEvent.click(screen.getByRole("button",{name:"Female"}));expect(pending.every(signal=>signal.aborted)).toBe(true);
 await loaded();fireEvent.click(within(board()).getByRole("button",{name:"Compare test_athlete push across algorithms"}));await waitFor(()=>expect(pending).toHaveLength(6));
 view.unmount();expect(pending.every(signal=>signal.aborted)).toBe(true);
});

it("withholds unavailable athlete results rather than displaying a zero rank or score",async()=>{
 setup(vi.fn(async(url:string)=>query(url).get("view")==="detail"&&query(url).get("algorithm")===algoId?{ok:false,json:async()=>({error:"This athlete is unavailable."})}:ok(query(url).get("view")==="detail"?detailResponse(url):response(url))));page();await loaded();
 fireEvent.click(within(board()).getByRole("button",{name:"Compare test_athlete push across algorithms"}));
 const table=await screen.findByRole("table",{name:"Athlete ranks across algorithms"});
 await waitFor(()=>expect(within(table).getByText("Unavailable")).toBeTruthy());
 expect(screen.getByRole("button",{name:"Retry athlete positions"})).toBeTruthy();expect(within(table).queryByText("0")).toBeNull();
});

it("aborts superseded runs and cannot display a late earlier-run response",async()=>{
 const pending:{url:string;signal?:AbortSignal|null;resolve:(v:ReturnType<typeof ok>)=>void}[]=[];
 setup(vi.fn((url:string,options?:RequestInit)=>new Promise<ReturnType<typeof ok>>(resolve=>pending.push({url,signal:options?.signal,resolve}))));
 const view=page();await waitFor(()=>expect(pending).toHaveLength(4));
 const nextRun={...run,id:uuid(81)};
 view.rerender(<ScoringLabComparison run={nextRun} algorithms={algorithms as never} dataset={dataset}/>);
 await waitFor(()=>expect(pending).toHaveLength(8));expect(pending.slice(0,4).every(p=>p.signal?.aborted)).toBe(true);
 await act(async()=>{for(const p of pending.slice(4))p.resolve(ok(response(p.url,{rows:[{...row,discipline:query(p.url).get("discipline"),username:"current_run"}]})));});
 await screen.findAllByText("@current_run");
 await act(async()=>{for(const p of pending.slice(0,4))p.resolve(ok(response(p.url,{rows:[{...row,discipline:query(p.url).get("discipline"),username:"stale_run"}]})));});
 expect(screen.queryByText("@stale_run")).toBeNull();expect(screen.getAllByText("@current_run")).toHaveLength(4);
});

it("ignores a page response after a filter resets pagination",async()=>{
 const pending:{url:string;signal?:AbortSignal|null;resolve:(v:ReturnType<typeof ok>)=>void}[]=[];
 setup(vi.fn((url:string,options?:RequestInit)=>query(url).get("offset")==="50"?new Promise<ReturnType<typeof ok>>(resolve=>pending.push({url,signal:options?.signal,resolve})):Promise.resolve(ok(response(url,{total:101})))));
 page();await loaded();fireEvent.click(screen.getByRole("button",{name:"Next Push page"}));await waitFor(()=>expect(pending).toHaveLength(2));
 fireEvent.change(screen.getByLabelText("Country filter (two-letter code)"),{target:{value:"gb"}});
 await loaded();expect(pending.every(p=>p.signal?.aborted)).toBe(true);
 await act(async()=>{for(const p of pending)p.resolve(ok(response(p.url,{rows:[{...row,username:"stale_page",discipline:"push"}]})));});
 expect(screen.queryByText("@stale_page")).toBeNull();expect(screen.getByRole("button",{name:"Previous Push page"})).toHaveProperty("disabled",true);
});

it("aborts active reads and never starts queued reads after unmount",async()=>{
 const signals:AbortSignal[]=[];
 const fetch=setup(vi.fn((_url:string,options?:RequestInit)=>{signals.push(options!.signal as AbortSignal);return new Promise<ReturnType<typeof ok>>(()=>{});}));
 const versions=Array.from({length:9},(_,i)=>({...algorithms[1],id:uuid(90+i),name:`Algorithm ${i}`}));
 const view=render(<ScoringLabComparison run={{...run,algorithm_ids:versions.map(v=>v.id)}} algorithms={versions as never} dataset={dataset}/>);
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(4));view.unmount();await act(async()=>{});
 expect(signals.every(signal=>signal.aborted)).toBe(true);expect(fetch).toHaveBeenCalledTimes(4);
});

it("releases hung leaderboard reads after the comparison deadline",async()=>{
 vi.useFakeTimers();setup(vi.fn(()=>new Promise<ReturnType<typeof ok>>(()=>{})));page();
 await act(async()=>{await vi.advanceTimersByTimeAsync(45000);});
 expect(screen.getAllByRole("alert")).toHaveLength(4);
 expect(screen.getByRole("button",{name:"Retry Push leaderboards"})).toHaveProperty("disabled",false);
 expect(screen.getByRole("button",{name:"Retry Pull leaderboards"})).toHaveProperty("disabled",false);
 expect(screen.queryByRole("table",{name:/Elo leaderboard/})).toBeNull();
});

it("focuses the selected-athlete panel and restores keyboard focus when it closes",async()=>{
 setup();page();await loaded();const trigger=within(board()).getByRole("button",{name:"Compare test_athlete push across algorithms"});
 fireEvent.click(trigger);const panel=screen.getByRole("region",{name:"Athlete position comparison"});
 expect(document.activeElement).toBe(panel);
 fireEvent.click(screen.getByRole("button",{name:"Close athlete comparison"}));
 expect(document.activeElement).toBe(trigger);expect(screen.queryByRole("region",{name:"Athlete position comparison"})).toBeNull();
});

it("renders a bounded static mock preview for desktop/mobile layout review",async()=>{
 const versions=Array.from({length:8},(_,i)=>({...algorithms[i===0?0:1],id:uuid(40+i),name:i===0?"Production baseline":`Experimental algorithm ${i}`}));
 setup(vi.fn(async(url:string)=>{const q=query(url),index=versions.findIndex(v=>v.id===q.get("algorithm")),swap=index%2===1;return ok(response(url,{total:2,summary:{...results.summary,athlete_count:2,mean_absolute_rank_movement:swap?1:0,max_absolute_rank_movement:swap?1:0},rows:[{...row,discipline:q.get("discipline"),rank:swap?2:1,baseline_rank:1,score:70+index*3,baseline_score:70,rank_delta:swap?-1:0},{...row,athlete_id:uuid(22),username:"another_athlete",discipline:q.get("discipline"),country:"dk",rank:swap?1:2,baseline_rank:2,score:swap?100+index*3:50+index*3,baseline_score:50,rank_delta:swap?1:0}].sort((a,b)=>a.rank-b.rank)}));}));
 const view=render(<main className="main"><div className="scoring-lab"><section className="lab-panel"><h1>Scoring lab comparison · synthetic preview</h1><ScoringLabComparison run={{...run,algorithm_ids:versions.map(v=>v.id)}} algorithms={versions as never} dataset={dataset}/></section></div></main>);
 await screen.findByRole("table",{name:"Experimental algorithm 7 Pull Elo leaderboard"});
 const output=process.env.SCORING_LAB_PREVIEW_DIR;
 if(output){mkdirSync(output,{recursive:true});const css=readFileSync("src/app/admin/globals.css","utf8");writeFileSync(output+"/comparison.html",`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${view.container.innerHTML}</body></html>`);}
 expect(view.container.querySelectorAll(".lab-leaderboard-scroll")).toHaveLength(2);
 expect(view.container.querySelectorAll(".lab-leaderboard-card")).toHaveLength(16);
});
it("shows the frozen active baseline configuration after an algorithm switch",async()=>{
 setup();const frozen={...algorithms[1].config,discount:.85};
 render(<ScoringLabComparison run={{...run,metadata:{algorithm_configs:{[baselineId]:frozen}}}} algorithms={algorithms as never} dataset={dataset}/>);await loaded();
 expect(screen.getByText(/captured production aggregation and discount/,{selector:"pre"}).textContent).toContain('"discount": 0.85');
 expect(screen.getByText(/captured production aggregation and discount/,{selector:"pre"}).textContent).toContain('"alpha": 0.5');
});
