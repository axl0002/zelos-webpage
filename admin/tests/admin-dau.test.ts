// @vitest-environment node
import {afterEach,expect,it,vi} from "vitest";
import {dauWindow,parseDailyActiveUsers} from "../src/lib/admin-dau";
import {dailyActiveUsersQuery,dauFromQueryResponse,getDailyActiveUsers} from "../src/lib/admin-dau.server";
const query={days:7,timezone:"UTC"},now=new Date("2026-11-06T12:00:00Z");
const fixture=(rows:unknown[][]=[])=>({columns:["day","active_users"],results:rows});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
it("zero-fills only a successful aggregate; counts remain daily, with no period sum",()=>{
 const result=dauFromQueryResponse(fixture([["2026-11-05",72],["2026-11-06",38]]),query,now);
 expect(result.daily).toHaveLength(7);expect(result.daily[0]).toEqual({date:"2026-10-31",active_users:0});expect(result.daily.at(-2)?.active_users).toBe(72);expect(result.daily.at(-1)?.active_users).toBe(38);
 expect(result).not.toHaveProperty("totals");expect(parseDailyActiveUsers({...result,token:"private",email:"private",daily:result.daily.map(r=>({...r,user_id:"private"}))},query)).toEqual(result);
});
it("handles V2 partial launch day, selected timezone, DST and midnight without UTC-day assumptions",()=>{
 expect(dauWindow({days:90,timezone:"America/New_York"},now).start).toBe("2026-10-21");
 expect(dauWindow({days:90,timezone:"Asia/Shanghai"},now).start).toBe("2026-10-22");
 expect(dauWindow({days:7,timezone:"Asia/Shanghai"},new Date("2026-11-06T18:00:00Z")).end).toBe("2026-11-07");
 expect(dauWindow({days:7,timezone:"America/New_York"},new Date("2026-11-02T02:00:00Z")).dates).toEqual(["2026-10-26","2026-10-27","2026-10-28","2026-10-29","2026-10-30","2026-10-31","2026-11-01"]);
 expect(dauWindow({days:7,timezone:"UTC"},new Date("2026-10-22T12:00:00Z")).dates).toEqual(["2026-10-22"]);
});
it("deduplicates people across activity kinds in the verified query and excludes background/login-only/no-identity/debug traffic",()=>{
 const sql=dailyActiveUsersQuery({days:30,timezone:"Asia/Shanghai"},now);
 expect(sql).toContain("count(DISTINCT person_id)");expect(sql).not.toContain("DISTINCT distinct_id");expect(sql).toContain("toTimeZone(timestamp, 'Asia/Shanghai')");expect(sql).toContain("greatest(toDateTime('2026-10-22 00:00:00', 'Asia/Shanghai')");
 for(const s of ["properties.environment = 'production'","properties.backend = 'supabase'","properties.$app_namespace = 'club.zelos.app'","properties.$is_identified = true","event IN ('$screen', 'Application Opened')","properties.action != 'bootstrapSession'","timestamp <= toDateTime('2026-11-06 12:00:00', 'UTC')"])expect(sql).toContain(s);
 expect(sql).not.toMatch(/Application Backgrounded|\$exception|last_sign_in_at|UNION/);
 for(const timezone of ["UTC'); SELECT * FROM persons --","Invalid/Zone",""] )expect(()=>dailyActiveUsersQuery({days:7,timezone},now)).toThrow();
 expect(()=>dailyActiveUsersQuery({days:1000,timezone:"UTC"},now)).toThrow();
});
it("rejects malformed, duplicate, out-of-window, truncated, asynchronous and error results without inventing zeros",()=>{
 for(const value of [null,[],{}, {query_status:{complete:false}}, {...fixture(),error:"secret SQL"},{...fixture(),hasMore:true},{...fixture(),columns:["active_users","day"]},fixture([["2026-11-05",2],["2026-11-05",3]]),fixture([["2026-11-07",1]]),fixture([["2026-10-30",1]]),...[-1,0,0.5,"3",NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(n=>fixture([["2026-11-05",n]]))])expect(()=>dauFromQueryResponse(value,query,now)).toThrow();
 const good=dauFromQueryResponse(fixture(),query,now);
 for(const bad of [{...good,schema_version:2},{...good,coverage_start:"2026-10-21T00:00:00Z"},{...good,generated_at:"bad"},{...good,daily:[]},{...good,end_date:"2026-11-07"},{...good,timezone:"Asia/Shanghai"},{...good,daily:good.daily.map((r,i)=>i? r:{...r,active_users:-1})}])expect(()=>parseDailyActiveUsers(bad,query)).toThrow();
});
it("uses a server-only fixed EU project, bounded read-only query and no-store without relaying query details",async()=>{
 vi.stubEnv("POSTHOG_PERSONAL_API_KEY","phx_fixture_only");vi.stubEnv("POSTHOG_PROJECT_ID","99683");vi.useFakeTimers();vi.setSystemTime(now);
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({...fixture([["2026-11-06",38]]),hogql:"private",query:"private",email:"private"})}));vi.stubGlobal("fetch",fetch);
 const result=await getDailyActiveUsers(query);expect(result.daily.at(-1)?.active_users).toBe(38);expect(JSON.stringify(result)).not.toContain("private");
 expect(fetch).toHaveBeenCalledOnce();const [url,options]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe("https://eu.posthog.com/api/projects/99683/query/");expect(options.cache).toBe("no-store");expect(options.redirect).toBe("error");expect(options.headers).toEqual({Authorization:"Bearer phx_fixture_only","Content-Type":"application/json"});expect(JSON.parse(options.body as string)).toMatchObject({refresh:"force_blocking",query:{kind:"HogQLQuery"}});
});
it("missing/wrong credentials, project mismatch, rate limits and transport failures stay unavailable",async()=>{
 const fetch=vi.fn(async()=>({ok:false}));vi.stubGlobal("fetch",fetch);
 for(const key of ["","phc_public_ingestion_token"]){vi.stubEnv("POSTHOG_PERSONAL_API_KEY",key);await expect(getDailyActiveUsers(query)).rejects.toThrow();}expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv("POSTHOG_PERSONAL_API_KEY","phx_fixture_only");vi.stubEnv("POSTHOG_PROJECT_ID","other");await expect(getDailyActiveUsers(query)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();
 vi.stubEnv("POSTHOG_PROJECT_ID","99683");await expect(getDailyActiveUsers(query)).rejects.toThrow();fetch.mockRejectedValueOnce(new Error("private token"));await expect(getDailyActiveUsers(query)).rejects.toThrow();
});
