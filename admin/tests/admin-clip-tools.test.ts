import {expect,it} from 'vitest';
import {parseAdminClipContext,parseClipTrimCommand,parseClipRejectCommand,parseClipReportCommand,parseAdminUserClipsPage,safeClipMediaUrls} from '../src/lib/admin-clip-tools';
export const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requestId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const clip={kind:'post',id:'legacy-post',post_id:'legacy-post',upload_id:null,author_id:owner,username:'athlete',country:'sg',title:'Full planche',state:'published',can_trim:true,can_reject:true,can_report:true,unavailable_reason:null,source_fingerprint:'a'.repeat(32),source_revision:4,duration_ms:15000,claim:10,metric:'seconds',hold_timing:{start_ms:2000,end_ms:12000},primary_url:'https://media.zelos.club/post.mp4',renditions:{},latest_trim:null,rules:[]};
export const trim={target_kind:'post',target_id:clip.id,request_id:requestId,expected_revision:4,expected_source_fingerprint:clip.source_fingerprint,trim_start_ms:1000,trim_end_ms:13000,hold_start_ms:2000,hold_end_ms:12000,watched_video:true,review_note:''};
it('allowlists clip context, supports legacy post IDs, and strips unsafe media',()=>{expect(parseAdminClipContext({...clip,private_email:'secret',primary_url:'https://evil.test/video.mp4'})).toEqual({...clip,primary_url:null,renditions:null});expect(parseAdminClipContext({...clip,kind:'upload',id:'bad'})).toBeNull();});
it.each([{...trim,actor:owner},{...trim,expected_revision:-1},{...trim,trim_start_ms:2001},{...trim,hold_end_ms:13001},{...trim,hold_start_ms:null},{...trim,trim_end_ms:1001},{...trim,watched_video:false},{...trim,review_note:'a'}])('rejects forged/invalid trim commands %j',v=>expect(parseClipTrimCommand(v)).toBeNull());
it('accepts matching exact request and optional note without changing measured hold',()=>{expect(parseClipTrimCommand(trim)).toEqual({...trim,reviewed_duration_ms:null});expect(parseClipTrimCommand({...trim,review_note:'  full attempt  '})).toMatchObject({review_note:'full attempt'});});
it('requires explicit report kind and rejection watch/note/taxonomy',()=>{const base={target_kind:'post',target_id:clip.id,request_id:requestId,reason_code:'unacceptable_form'};expect(parseClipReportCommand({...base,report_kind:'ranking',details:'Verified form'})).toBeTruthy();expect(parseClipReportCommand({...base,report_kind:'safety',details:'Verified form'})).toBeNull();expect(parseClipRejectCommand({...trim,reason_code:'unacceptable_form',rule_ids:[]})).toBeNull();});
it('validates page contract including cursor pairs and ordered contexts',()=>{expect(parseAdminUserClipsPage({items:[{...clip,created_at:'2026-11-05T00:00:00Z'}],has_more:true,next_cursor:{created_at:'2026-11-05T00:00:00Z',id:clip.id}})?.items).toHaveLength(1);expect(parseAdminUserClipsPage({items:[],has_more:true,next_cursor:null})).toBeNull();});

it('allows only exact legacy Firebase bucket paths and CDN media',()=>{
 const valid=['https://firebasestorage.googleapis.com/v0/b/zelos-prod.firebasestorage.app/o/clip%2Fone.mp4?alt=media&token=fixture','https://storage.googleapis.com/zelos-prod.firebasestorage.app/clip.mp4'];
 for(const u of valid)expect(safeClipMediaUrls({primary_url:u,renditions:null})).toEqual([u]);
 for(const u of ['http://media.zelos.club/clip.mp4','https://firebasestorage.googleapis.com/v0/b/other/o/clip.mp4','https://storage.googleapis.com/other/clip.mp4','https://media.zelos.club.evil.test/clip.mp4','https://user:secret@media.zelos.club/clip.mp4','https://media.zelos.club:8443/clip.mp4','https://media.zelos.club/clip.mp4#fragment'])expect(safeClipMediaUrls({primary_url:u,renditions:null})).toEqual([]);
});
it('accepts nullable context duration and bounds observed duration command without trusting it as authoritative',()=>{
 expect(parseAdminClipContext({...clip,duration_ms:null})?.duration_ms).toBeNull();expect(parseClipTrimCommand({...trim,reviewed_duration_ms:15000})?.reviewed_duration_ms).toBe(15000);
 for(const v of [-1,0,180001,15000.5,'15000'])expect(parseClipTrimCommand({...trim,reviewed_duration_ms:v})).toBeNull();
});
it('allowlists optional open report evidence ranges and rejects malformed marker evidence',()=>{
 const range={start_ms:1000,end_ms:14000,fingerprint:'e'.repeat(32)};expect(parseAdminClipContext({...clip,report_evidence_range:{...range,private_data:'secret'}})?.report_evidence_range).toEqual(range);
 expect(parseAdminClipContext({...clip,report_evidence_range:{start_ms:null,end_ms:14000,fingerprint:'e'.repeat(32)}})?.report_evidence_range?.start_ms).toBeNull();
 for(const evidence of [{...range,start_ms:-1},{...range,end_ms:500},{...range,start_ms:1.5},{...range,fingerprint:''}])expect(parseAdminClipContext({...clip,report_evidence_range:evidence})).toBeNull();
});
it('caps report evidence details at 800 while retaining 1000-character rejection notes',()=>{
 const report={target_kind:'post',target_id:clip.id,request_id:requestId,report_kind:'ranking',reason_code:'unacceptable_form',details:'a'.repeat(800)};
 expect(parseClipReportCommand(report)?.details).toHaveLength(800);expect(parseClipReportCommand({...report,details:'a'.repeat(801)})).toBeNull();
 expect(parseClipRejectCommand({target_kind:'post',target_id:clip.id,request_id:requestId,expected_revision:4,expected_source_fingerprint:clip.source_fingerprint,reason_code:'unacceptable_form',rule_ids:[],watched_video:true,review_note:'a'.repeat(1000)})?.review_note).toHaveLength(1000);
});
