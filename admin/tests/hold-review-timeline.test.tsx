import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {createRef} from "react";
import HoldReviewTimeline from "../src/components/hold-review-timeline";
import RankingFlagsDashboard from "../src/components/ranking-flags-dashboard";
import RankedUploadsDashboard from "../src/components/ranked-uploads-dashboard";
import {rankedUpload, privatePreview} from "./fixtures/ranked-upload";
const frames = {start_ms: 2033, end_ms: 11999, duration_ms: 9966};
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
function setup(timing: typeof frames | null = frames) {
 const ref=createRef<HTMLVideoElement>();
 const view=render(<><video ref={ref}/><HoldReviewTimeline videoRef={ref} source="fixture.mp4" timing={timing}/></>);
 const video=ref.current!;const pause=vi.fn(),play=vi.fn().mockResolvedValue(undefined);
 Object.defineProperties(video,{duration:{value:30,configurable:true},pause:{value:pause},play:{value:play}});
 fireEvent.loadedMetadata(video);
 return {video,pause,play,ref,...view};
}
it('jumps to exact saved boundaries and scrubs without changing them',()=>{
 const {video,pause}=setup();
 fireEvent.click(screen.getByRole('button',{name:'Uploader start · 2.033 s'}));expect(video.currentTime).toBe(2.033);
 fireEvent.click(screen.getByRole('button',{name:'Uploader end · 11.999 s'}));expect(video.currentTime).toBe(11.999);expect(pause).toHaveBeenCalledTimes(2);
 expect(screen.getByLabelText('Hold elapsed time').textContent).toBe('9.9 s / 9.966 s');
 fireEvent.change(screen.getByRole('slider'),{target:{value:'8437'}});expect(video.currentTime).toBe(8.437);
 expect(screen.getByLabelText('Video position').textContent).toBe('8.437 / 30.000 s');
 expect(screen.getByRole('button',{name:'Uploader start · 2.033 s'})).toBeTruthy();
});
it('uses video position as clock and caps elapsed before/after the hold',()=>{
 const {video}=setup();
 video.currentTime=1;fireEvent.timeUpdate(video);expect(screen.getByLabelText('Hold elapsed time').textContent).toBe('0.0 s / 9.966 s');
 video.currentTime=5;fireEvent.timeUpdate(video);expect(screen.getByLabelText('Hold elapsed time').textContent).toBe('2.9 s / 9.966 s');
 video.currentTime=20;fireEvent.timeUpdate(video);expect(screen.getByLabelText('Hold elapsed time').textContent).toBe('9.9 s / 9.966 s');
});
it('resumes a playing drag, but marker taps and hidden tabs keep it paused',()=>{
 const {video,play}=setup();Object.defineProperty(video,'paused',{value:false});
 const slider=screen.getByRole('slider');fireEvent.pointerDown(slider);fireEvent.change(slider,{target:{value:'7000'}});fireEvent.pointerUp(slider);expect(play).toHaveBeenCalledTimes(1);
 fireEvent.pointerDown(slider);fireEvent.change(slider,{target:{value:'9000'}});
 Object.defineProperty(document,'hidden',{value:true,configurable:true});fireEvent(document,new Event('visibilitychange'));fireEvent.pointerUp(slider);expect(play).toHaveBeenCalledTimes(1);
 Object.defineProperty(document,'hidden',{value:false,configurable:true});
 fireEvent.click(screen.getByRole('button',{name:'Uploader start · 2.033 s'}));expect(video.currentTime).toBe(2.033);expect(play).toHaveBeenCalledTimes(1);
});
it('does not replace missing uploader frames with manufactured boundaries',()=>{
 setup(null);expect(screen.getByText(/No saved uploader hold frames/)).toBeTruthy();expect(screen.queryByRole('button',{name:/Uploader start/})).toBeNull();expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(false);
});
it('rejects boundaries outside the actual loaded clip and resets a new source',()=>{
 const {video,ref,rerender}=setup();Object.defineProperty(video,'duration',{value:8,configurable:true});fireEvent.durationChange(video);
 expect((screen.getByRole('button',{name:'Uploader end · 11.999 s'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText(/Saved hold frames do not fit/)).toBeTruthy();
 rerender(<HoldReviewTimeline videoRef={ref} source="new.mp4" timing={frames}/>);
 expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
});
it('ranked flags show current uploader boundaries separately from report snapshots',async()=>{
 const item={id:'flag',post_id:'post',reason:'incorrect_hold_frames',details:'Check boundaries',corrected_value:null,reported_value:8,metric:'seconds',rule_violations:[],rules:[],claimed_value:9,board_name:'Full Planche',board_metric:'seconds',username:'athlete',title:'Planche',created_at:'2026-10-31',submission_status:'eligible',primary_url:'https://media.zelos.club/clip.mp4',renditions:{},hold_timing:frames,reported_hold_start_ms:1000,reported_hold_end_ms:9000};
 const fetch=vi.fn(async()=>({ok:true,json:async()=>[item]}));vi.stubGlobal('fetch',fetch);
 const {container}=render(<RankingFlagsDashboard/>);await screen.findByRole('region',{name:'Current upload hold frames'});
 const video=container.querySelector('video')!;Object.defineProperties(video,{duration:{value:30},pause:{value:vi.fn()}});fireEvent.loadedMetadata(video);
 const uploader=within(screen.getByRole('region',{name:'Current upload hold frames'}));fireEvent.click(uploader.getByRole('button',{name:'Uploader start · 2.033 s'}));expect(video.currentTime).toBe(2.033);
 fireEvent.click(screen.getByRole('button',{name:'Hold start · 1.000 s'}));expect(video.currentTime).toBe(1);
 expect((screen.getByLabelText('I watched the clip and checked the reported issue') as HTMLInputElement).checked).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);
});
it('ranked submissions expose uploader frame markers without marking watched or saving',async()=>{
 const fetch=vi.fn(async(path:string)=>({ok:true,json:async()=>path.endsWith('/preview')?privatePreview:[{...rankedUpload,hold_timing:frames}]}));vi.stubGlobal('fetch',fetch);
 const {container}=render(<RankedUploadsDashboard/>);await screen.findByLabelText('Private ranked upload');
 const video=container.querySelector('video')!;Object.defineProperties(video,{duration:{value:30},pause:{value:vi.fn()}});fireEvent.loadedMetadata(video);
 const timeline=within(screen.getByRole('region',{name:'Uploader-selected hold frames'}));const end=timeline.getByRole('button',{name:'Uploader end · 11.999 s'});await waitFor(()=>expect((end as HTMLButtonElement).disabled).toBe(false));fireEvent.click(end);expect(video.currentTime).toBe(11.999);
 expect((screen.getByLabelText('I watched the full video and checked the exercise, result and form against these rules.') as HTMLInputElement).checked).toBe(false);expect(fetch.mock.calls.every(([path])=>!path.endsWith('/decision')&&!path.endsWith('/hold-correction'))).toBe(true);
});
