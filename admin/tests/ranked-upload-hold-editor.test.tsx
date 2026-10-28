import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import RankedUploadsDashboard from '../src/components/ranked-uploads-dashboard';
import {rankedUpload,privatePreview} from './fixtures/ranked-upload';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const timing={start_ms:1500,end_ms:13999,duration_ms:12499};
const item={...rankedUpload,metric:'seconds' as const,claim:12,hold_timing:timing};
function mock(fail=false){let edited=false;const fetch=vi.fn(async(path:string,options:RequestInit)=>({ok:!(fail&&path.endsWith('/hold-correction')),json:async()=>{
 if(path.endsWith('/preview'))return privatePreview;
 if(path.endsWith('/hold-context'))return {upload_id:item.id,revision:item.revision,source_fingerprint:'a'.repeat(32),duration_ms:15000,max_value:600,claim:12,hold_timing:timing};
 if(path.endsWith('/hold-correction')){if(fail)return {error:'Network request failed; refresh before retrying.'};edited=true;return {ok:true,status:'corrected',value:10,revision:item.revision+1,hold_timing:{start_ms:2000,end_ms:12999,duration_ms:10999}};}
 if(path.endsWith('/decision'))return {ok:true};
 return [edited?{...item,revision:item.revision+1,claim:10,hold_timing:{start_ms:2000,end_ms:12999,duration_ms:10999}}:item];
 }}));vi.stubGlobal('fetch',fetch);return fetch;}
async function open(){render(<RankedUploadsDashboard/>);await screen.findByRole('heading',{name:item.title});await waitFor(()=>expect(document.querySelector('video')).not.toBeNull());fireEvent.click(screen.getByRole('button',{name:'Edit hold start and end frames'}));await screen.findByLabelText('Correct start (seconds)');await waitFor(()=>expect(screen.queryByText('Loading source timeline…')).toBeNull());}
it('requires full review, valid frames, note and explicit confirmation; saves separately from approval',async()=>{
 const fetch=mock();await open();const review=screen.getByRole('button',{name:'Review hold correction'}) as HTMLButtonElement;expect(review.disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Correct start (seconds)'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Correct end (seconds)'),{target:{value:'12.999'}});fireEvent.change(screen.getByLabelText('Correction note'),{target:{value:'Checked actual start and end'}});expect(review.disabled).toBe(true);
 fireEvent.click(screen.getByLabelText('I watched the full video and checked the exercise, result and form against these rules.'));expect(review.disabled).toBe(false);fireEvent.click(review);
 const dialog=screen.getByRole('dialog',{name:'Confirm private hold correction'});fireEvent.click(within(dialog).getByRole('button',{name:'Save hold correction'}));
 await screen.findByText(/Hold frames corrected/);await waitFor(()=>expect(screen.getByText(/credited 10 s/)).toBeTruthy());
 const calls=fetch.mock.calls.filter(([p])=>p.endsWith('/hold-correction'));expect(calls).toHaveLength(1);expect(JSON.parse(calls[0][1].body as string)).toEqual({upload_id:item.id,expected_revision:item.revision,expected_source_fingerprint:'a'.repeat(32),hold_start_ms:2000,hold_end_ms:12999,watched_video:true,review_note:'Checked actual start and end'});
 expect(fetch.mock.calls.some(([p])=>p.endsWith('/decision'))).toBe(false);expect((screen.getByRole('button',{name:'Approve upload'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByLabelText('I watched the full video and checked the exercise, result and form against these rules.') as HTMLInputElement).checked).toBe(false);
});
it('keeps private edit inputs on uncertain failure and blocks duplicate retry until queue refresh',async()=>{
 const fetch=mock(true);await open();fireEvent.change(screen.getByLabelText('Correct start (seconds)'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Correct end (seconds)'),{target:{value:'12.999'}});fireEvent.change(screen.getByLabelText('Correction note'),{target:{value:'Checked actual frames'}});fireEvent.click(screen.getByLabelText('I watched the full video and checked the exercise, result and form against these rules.'));fireEvent.click(screen.getByRole('button',{name:'Review hold correction'}));const save=within(screen.getByRole('dialog')).getByRole('button',{name:'Save hold correction'});fireEvent.click(save);fireEvent.click(save);
 await screen.findByText('Network request failed; refresh before retrying.');expect(fetch.mock.calls.filter(([p])=>p.endsWith('/hold-correction'))).toHaveLength(1);expect((screen.getByLabelText('Correct end (seconds)') as HTMLInputElement).value).toBe('12.999');expect((screen.getByRole('button',{name:'Review hold correction'}) as HTMLButtonElement).disabled).toBe(true);
});
it('requires a trimmed resubmission when the corrected claim violates existing upload duration policy',async()=>{
 mock();await open();fireEvent.change(screen.getByLabelText('Correct start (seconds)'),{target:{value:'9'}});fireEvent.change(screen.getByLabelText('Correct end (seconds)'),{target:{value:'13'}});fireEvent.change(screen.getByLabelText('Correction note'),{target:{value:'Shorter hold'}});fireEvent.click(screen.getByLabelText('I watched the full video and checked the exercise, result and form against these rules.'));expect((screen.getByRole('button',{name:'Review hold correction'}) as HTMLButtonElement).disabled).toBe(true);
});
