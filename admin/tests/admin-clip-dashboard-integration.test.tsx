import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import RankedUploadsDashboard from '../src/components/ranked-uploads-dashboard';
import RankingFlagsDashboard from '../src/components/ranking-flags-dashboard';
import {rankedUpload,privatePreview} from './fixtures/ranked-upload';

vi.mock('../src/components/clip-trim-panel',()=>({default:({target,disabled,onBusy,onSaved}:any)=><section aria-label="Mock trim editor"><p>{target.kind}:{target.id}</p><button disabled={disabled} onClick={()=>onBusy(true)}>Start mocked trim</button><button disabled={disabled} onClick={()=>{onBusy(false);onSaved();}}>Finish mocked trim</button></section>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('trims a pending upload without approving, then loads the new private preview and requires fresh review',async()=>{
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 let reads=0;
 const fetcher=vi.fn(async(path:string)=>({ok:true,json:async()=>path.endsWith('/preview')?privatePreview:[{...rankedUpload,revision:rankedUpload.revision+(reads++>0?2:0)}]}));
 vi.stubGlobal('fetch',fetcher);render(<RankedUploadsDashboard/>);
 await screen.findByRole('heading',{name:rankedUpload.title});
 const watched=await screen.findByLabelText('I watched the full video and checked the exercise, result and form against these rules.');
 await waitFor(()=>expect((watched as HTMLInputElement).disabled).toBe(false));fireEvent.click(watched);
 fireEvent.click(screen.getByRole('button',{name:'Trim clip'}));
 expect(screen.getByText(`upload:${rankedUpload.id}`)).toBeTruthy();expect((watched as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Start mocked trim'}));
 expect((screen.getByRole('button',{name:'Refresh queue'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Approve upload'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Finish mocked trim'}) as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Finish mocked trim'}));
 await screen.findByText('Clip trimmed. The upload is still private. Review the new video before approving.');
 await waitFor(()=>expect(fetcher.mock.calls.filter(([p])=>p.endsWith('/preview'))).toHaveLength(2));
 expect((screen.getByRole('button',{name:'Approve upload'}) as HTMLButtonElement).disabled).toBe(true);
 expect(fetcher.mock.calls.some(([p])=>p.includes('/decision'))).toBe(false);
});

it('trims a flagged clip without resolving its flag and refreshes the source before another decision',async()=>{
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 let reads=0;
 const flag={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',post_id:'flagged-clip',reason:'unacceptable_form',details:'Bent arms in hold',corrected_value:null,reported_value:10,metric:'seconds',rule_violations:[],rules:[],claimed_value:10,board_name:'Full Planche',board_metric:'seconds',username:'athlete',title:'Planche',created_at:'2026-10-16T00:00:00Z',submission_status:'eligible',primary_url:'https://media.zelos.club/before.mp4',renditions:{},measurement_revision:0};
 const fetcher=vi.fn(async()=>({ok:true,json:async()=>[{...flag,measurement_revision:reads++,primary_url:reads>1?'https://media.zelos.club/after.mp4':flag.primary_url}]}));
 vi.stubGlobal('fetch',fetcher);const {container}=render(<RankingFlagsDashboard/>);
 const watched=await screen.findByLabelText('I watched the clip and checked the reported issue');fireEvent.click(watched);
 fireEvent.click(screen.getByRole('button',{name:'Trim clip'}));
 expect(screen.getByText('post:flagged-clip')).toBeTruthy();expect((watched as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Start mocked trim'}));
 expect((screen.getByRole('button',{name:'Refresh queue'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Reject ranking'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Finish mocked trim'}) as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Finish mocked trim'}));
 await screen.findByText('Clip trimmed. Review the updated video; the flag and result are unchanged.');
 await waitFor(()=>expect(container.querySelector('video')?.getAttribute('src')).toBe('https://media.zelos.club/after.mp4'));
 expect((screen.getByLabelText('I watched the clip and checked the reported issue') as HTMLInputElement).checked).toBe(false);
 expect(screen.getByRole('button',{name:/athlete · Full Planche/})).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(2);
});
