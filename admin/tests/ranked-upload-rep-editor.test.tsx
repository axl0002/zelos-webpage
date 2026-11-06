import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import RankedUploadsDashboard from '../src/components/ranked-uploads-dashboard';
import {rankedUpload, privatePreview} from './fixtures/ranked-upload';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const item={...rankedUpload,metric:'reps' as const,claim:10,hold_timing:undefined};
function mock(fail=false){let edited=false;const fetch=vi.fn(async(path:string,options?:RequestInit)=>({ok:!(fail&&path.endsWith('/rep-correction')),json:async()=>{
 if(path.endsWith('/preview'))return privatePreview;
 if(path.endsWith('/rep-context'))return {upload_id:item.id,revision:item.revision,source_fingerprint:'a'.repeat(32),max_value:2147483647,claim:10};
 if(path.endsWith('/rep-correction')){if(fail)return {error:'Request may have saved. Refresh before retrying.'};edited=true;return {ok:true,status:'corrected',value:8,revision:item.revision+1};}
 if(path.endsWith('/decision'))return {ok:true};
 return [edited?{...item,claim:8,revision:item.revision+1,projected_rank:2}:item];
 }}));vi.stubGlobal('fetch',fetch);return fetch;}
async function open(){render(<RankedUploadsDashboard/>);await screen.findByRole('heading',{name:item.title});await waitFor(()=>expect(document.querySelector('video')).not.toBeNull());fireEvent.click(screen.getByRole('button',{name:'Edit rep count'}));await screen.findByLabelText('Correct rep count');await waitFor(()=>expect(screen.queryByText('Loading rep count…')).toBeNull());}
const watched=()=>fireEvent.click(screen.getByLabelText('I watched the full video and checked the exercise, result and form against these rules.'));
function fill(value='8'){fireEvent.change(screen.getByLabelText('Correct rep count'),{target:{value}});fireEvent.change(screen.getByLabelText('Correction note'),{target:{value:'Counted eight complete reps'}});}
it('requires whole reps, note, full review and confirmation; correction stays separate from approval',async()=>{
 const fetch=mock();await open();const review=screen.getByRole('button',{name:'Review rep correction'})as HTMLButtonElement;fill();expect(review.disabled).toBe(true);watched();expect(review.disabled).toBe(false);
 expect((screen.getByRole('button',{name:'Approve upload'})as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(review);const save=within(screen.getByRole('dialog',{name:'Confirm private rep correction'})).getByRole('button',{name:'Save rep correction'});fireEvent.click(save);fireEvent.click(save);
 await screen.findByText(/Rep count corrected/);await screen.findByText(/Projected rank: #2/);
 const calls=fetch.mock.calls.filter(([p])=>p.endsWith('/rep-correction'));expect(calls).toHaveLength(1);expect(JSON.parse(calls[0][1]!.body as string)).toEqual({upload_id:item.id,expected_revision:item.revision,expected_source_fingerprint:'a'.repeat(32),corrected_value:8,watched_video:true,review_note:'Counted eight complete reps'});
 expect(fetch.mock.calls.some(([p])=>p.endsWith('/decision'))).toBe(false);expect((screen.getByRole('button',{name:'Approve upload'})as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByLabelText('I watched the full video and checked the exercise, result and form against these rules.')as HTMLInputElement).checked).toBe(false);
});
it('rejects fractional/zero/negative/overflow/no-op edits and permits the positive integer maximum',async()=>{
 mock();await open();watched();for(const value of ['8.5','0','-1','2147483648','10','']){fill(value);expect((screen.getByRole('button',{name:'Review rep correction'})as HTMLButtonElement).disabled).toBe(true);}
 fill('2147483647');expect((screen.getByRole('button',{name:'Review rep correction'})as HTMLButtonElement).disabled).toBe(false);
});
it('keeps the entered correction and blocks retry and approval on uncertain failure',async()=>{
 const fetch=mock(true);await open();fill();watched();fireEvent.click(screen.getByRole('button',{name:'Review rep correction'}));fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Save rep correction'}));await screen.findByText('Request may have saved. Refresh before retrying.');
 expect(fetch.mock.calls.filter(([p])=>p.endsWith('/rep-correction'))).toHaveLength(1);expect((screen.getByLabelText('Correct rep count')as HTMLInputElement).value).toBe('8');
 for(const name of ['Cancel rep edit','Review rep correction','Approve upload'])expect((screen.getByRole('button',{name})as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Refresh upload review'})).toBeTruthy();
});
it('cancelling an unsaved edit leaves normal legacy approval available',async()=>{
 const fetch=mock();await open();fill();watched();fireEvent.click(screen.getByRole('button',{name:'Cancel rep edit'}));expect((screen.getByRole('button',{name:'Approve upload'})as HTMLButtonElement).disabled).toBe(false);expect(fetch.mock.calls.some(([p])=>p.endsWith('/rep-correction'))).toBe(false);
});
