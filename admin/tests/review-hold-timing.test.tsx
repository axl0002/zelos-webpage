import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {CandidateReview} from "../src/components/review-dashboard";
import {parseDecision} from "../src/lib/review-api";
import type {Board,Candidate,Decision} from "../src/lib/review-types";
const board:Board={id:"front-lever-hold-full",exercise_id:"front_lever_hold",exercise_name:"Front Lever Hold",name:"Full Front Lever",progression:"Full",metric:"seconds",max_value:120,form:"Straight arms",camera:"Side"};
const candidate:Candidate={post_id:"legacy-hold",revision:4,status:"pending",title:"Front lever",caption:"",username:"athlete",country:"gb",author_id:"athlete",created_at:"2026-10-24",duration_ms:90000,primary_url:"https://media.zelos.club/hold.mp4",poster_url:null,renditions:{},suggestions:[{exercise_id:board.exercise_id,name:board.exercise_name,evidence:["tag"]}],warnings:[],current_records:[],board_id:null,value:null,note:"",reviewed_at:null,result:null};
const media={primary_url:candidate.primary_url,duration_ms:candidate.duration_ms,renditions:{}};
const decision:Decision={post_id:candidate.post_id,revision:4,decision:"approve",board_id:board.id,value:16,note:"",watched:true,replace_current:false,hold_timing:{start_ms:1250,end_ms:17750,media}};
const fetcher=vi.fn();
beforeEach(()=>{vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});fetcher.mockResolvedValue({ok:true,json:async()=>({active:true})});vi.stubGlobal("fetch",fetcher);});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();fetcher.mockReset();});
const approve=()=>screen.getByRole("button",{name:"Approve ranking ↗"}) as HTMLButtonElement;
const fill=()=>{fireEvent.change(screen.getByLabelText("Hold start (seconds)"),{target:{value:"1.25"}});fireEvent.change(screen.getByLabelText("Hold end (seconds)"),{target:{value:"17.75"}});};
it("requires selected frames, floors duration and submits source guards for long legacy clips",async()=>{
 const saved=vi.fn();render(<CandidateReview candidate={candidate} boards={[board]} onSaved={saved}/>);
 expect(approve().disabled).toBe(true);expect((screen.getByLabelText("Hold time (whole seconds)") as HTMLInputElement).readOnly).toBe(true);
 fill();expect(screen.getByText("16.500s selected → 16 whole seconds")).toBeTruthy();expect(approve().disabled).toBe(false);
 fireEvent.click(approve());fireEvent.click(approve());expect(fetcher).toHaveBeenCalledTimes(1);
 await waitFor(()=>expect(saved).toHaveBeenCalledWith("approve",true));expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(decision);
});
it("sets boundaries at the paused playhead and seeks to selected frames",()=>{
 const {container}=render(<CandidateReview candidate={candidate} boards={[board]} onSaved={vi.fn()}/>);const video=container.querySelector("video")!;
 Object.defineProperty(video,"readyState",{configurable:true,value:2});
 video.currentTime=1.25;fireEvent.click(screen.getByText("Set hold start at playhead"));video.currentTime=17.75;fireEvent.click(screen.getByText("Set hold end at playhead"));
 expect((screen.getByLabelText("Hold start (seconds)") as HTMLInputElement).value).toBe("1.25");expect(approve().disabled).toBe(false);
 fireEvent.click(screen.getByText("View start frame"));expect(video.currentTime).toBe(1.25);fireEvent.click(screen.getByText("Forward 1/30s"));expect(video.currentTime).toBeCloseTo(1.25+1/30);
});
it("marks actual displayed mediaTime and clears stale frames while seeking",()=>{
 let frame:VideoFrameRequestCallback|undefined;
 const frameDescriptor=Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype,"requestVideoFrameCallback");
 const cancelDescriptor=Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype,"cancelVideoFrameCallback");
 Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",{configurable:true,value:vi.fn((callback:VideoFrameRequestCallback)=>{frame=callback;return 1;})});
 Object.defineProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback",{configurable:true,value:vi.fn()});
 try {
  const {container,unmount}=render(<CandidateReview candidate={candidate} boards={[board]} onSaved={vi.fn()}/>);const video=container.querySelector("video")!;
  Object.defineProperty(video,"readyState",{configurable:true,value:2});Object.defineProperty(video,"seeking",{configurable:true,value:false});video.currentTime=2;
  fireEvent.click(screen.getByText("Set hold start at playhead"));expect(screen.getByRole("alert").textContent).toContain("display the frame");
  frame!(0,{mediaTime:1.967} as VideoFrameCallbackMetadata);fireEvent.click(screen.getByText("Set hold start at playhead"));expect((screen.getByLabelText("Hold start (seconds)") as HTMLInputElement).value).toBe("1.967");
  fireEvent.seeking(video);video.currentTime=20;fireEvent.click(screen.getByText("Set hold end at playhead"));expect((screen.getByLabelText("Hold end (seconds)") as HTMLInputElement).value).toBe("");
  frame!(0,{mediaTime:19.967} as VideoFrameCallbackMetadata);Object.defineProperty(video,"seeking",{configurable:true,value:true});fireEvent.click(screen.getByText("Set hold end at playhead"));expect((screen.getByLabelText("Hold end (seconds)") as HTMLInputElement).value).toBe("");
  Object.defineProperty(video,"seeking",{configurable:true,value:false});Object.defineProperty(video,"readyState",{configurable:true,value:0});fireEvent.click(screen.getByText("Set hold end at playhead"));expect((screen.getByLabelText("Hold end (seconds)") as HTMLInputElement).value).toBe("");
  Object.defineProperty(video,"readyState",{configurable:true,value:2});fireEvent.click(screen.getByText("Set hold end at playhead"));expect((screen.getByLabelText("Hold end (seconds)") as HTMLInputElement).value).toBe("19.967");unmount();
 } finally {
  if(frameDescriptor)Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",frameDescriptor);else Reflect.deleteProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback");
  if(cancelDescriptor)Object.defineProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback",cancelDescriptor);else Reflect.deleteProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback");
 }
});
it("bounds frames and preserves selected evidence on temporary save failure",async()=>{
 fetcher.mockResolvedValue({ok:false,json:async()=>({error:"The clip changed. Refresh the queue."})});render(<CandidateReview candidate={candidate} boards={[board]} onSaved={vi.fn()}/>);
 fill();for(const end of ["1.5","0","90.001"]){fireEvent.change(screen.getByLabelText("Hold end (seconds)"),{target:{value:end}});expect(approve().disabled).toBe(true);}
 fill();fireEvent.click(approve());await screen.findByRole("alert");expect((screen.getByLabelText("Hold end (seconds)") as HTMLInputElement).value).toBe("17.75");expect(approve().disabled).toBe(false);
});
it("rejecting a hold sends no measurements or frame mutation",async()=>{
 render(<CandidateReview candidate={candidate} boards={[board]} onSaved={vi.fn()}/>);fill();fireEvent.click(screen.getByText("Reject ranking"));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));const sent=JSON.parse(fetcher.mock.calls[0][1].body);expect(sent.hold_timing).toBeUndefined();expect(sent.value).toBeNull();expect(sent.decision).toBe("skip");
});
it("validates timing payloads without changing compatible rep decisions",()=>{
 expect(parseDecision(decision)).toEqual(decision);
 for(const timing of [null,{}, {...decision.hold_timing,start_ms:-1},{...decision.hold_timing,end_ms:90001},{...decision.hold_timing,end_ms:1750},{...decision.hold_timing,start_ms:1.5},{...decision.hold_timing,media:{...media,renditions:[]}}]) expect(parseDecision({...decision,hold_timing:timing})).toBeNull();
 expect(parseDecision({...decision,value:17})).toBeNull();expect(parseDecision({...decision,decision:"skip",board_id:null,value:null,watched:false})).toBeNull();
});
