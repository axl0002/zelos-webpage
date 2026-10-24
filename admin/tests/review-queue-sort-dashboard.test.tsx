import {afterEach,beforeEach,expect,it,vi} from 'vitest';import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import ReviewDashboard from '../src/components/review-dashboard';import type {Board,Candidate} from '../src/lib/review-types';
const board:Board={id:'pull-up',exercise_id:'pull_up',exercise_name:'Pull Up',name:'Pull Up',progression:null,metric:'reps',max_value:2147483647,form:'Full range',camera:'Side'};
const clip=(n:number):Candidate=>({post_id:'clip-'+n,revision:1,status:'pending',title:'Clip '+n,caption:'Pull up set',username:'athlete',country:null,author_id:'athlete',created_at:'2026-01-01',duration_ms:30000,primary_url:'https://media.zelos.club/'+n+'.mp4',poster_url:null,renditions:{},suggestions:[{exercise_id:'pull_up',name:'Pull Up',evidence:['tag']}],warnings:[],current_records:[],queue_sort:{level:0,board:'pull-up',board_name:'Pull Up',measurement:100-n,metric:'reps'},board_id:null,value:null,note:'',reviewed_at:null,result:null});
const cursor={v:1,level:0,weight:10,exercise:'pull_up',board:'pull-up',measurement:10,post:'clip-20',status:'pending',filter_exercise:null,search:''};
const fetcher=vi.fn();beforeEach(()=>{vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.stubGlobal('fetch',fetcher);});afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();fetcher.mockReset();});
it('Next and Previous carry v2 ordering keys without reusing post-ID pagination',async()=>{
 fetcher.mockImplementation(async(url:string)=>{const q=new URL(url,'http://localhost').searchParams;return {ok:true,json:async()=>q.has('cursor')?{items:[clip(21)],stats:{pending:21,approved:0,skipped:0},has_more:false,next_cursor:null}:{items:Array.from({length:21},(_,i)=>clip(i+1)),stats:{pending:21,approved:0,skipped:0},has_more:true,next_cursor:cursor}};});
 render(<ReviewDashboard boards={[board]}/>);await screen.findByRole('heading',{name:'Clip 1'});
 expect(screen.getByText('Imported claim: Pull Up · 99 reps')).toBeTruthy();expect(new URL(fetcher.mock.calls[0][0],'http://localhost').searchParams.get('order')).toBe('difficulty_v1');fireEvent.click(screen.getByText('Next →'));await screen.findByRole('heading',{name:'Clip 21'});
 const query=new URL(fetcher.mock.calls[1][0],'http://localhost').searchParams;expect(query.get('after')).toBeNull();expect(JSON.parse(query.get('cursor')!)).toEqual(cursor);
 fireEvent.click(screen.getByText('← Previous'));await screen.findByRole('heading',{name:'Clip 1'});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));expect(new URL(fetcher.mock.calls[2][0],'http://localhost').searchParams.has('cursor')).toBe(false);
});
it('changing an exercise clears the prior keyset cursor and resets pagination',async()=>{
 fetcher.mockResolvedValue({ok:true,json:async()=>({items:[clip(1)],stats:{pending:1,approved:0,skipped:0},has_more:false,next_cursor:null})});render(<ReviewDashboard boards={[board]}/>);await screen.findByRole('heading',{name:'Clip 1'});
 const exercise=screen.getByLabelText('Filter by exercise');fireEvent.change(exercise,{target:{value:'pull_up'}});await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));const query=new URL(fetcher.mock.calls[1][0],'http://localhost').searchParams;expect(query.get('exercise')).toBe('pull_up');expect(query.has('cursor')).toBe(false);
});
