import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {parseExerciseRules,parseRuleIds} from '../src/lib/exercise-rules';
import {parseRankingFlagDecision} from '../src/lib/ranking-flags';
import {parseRankingFlagGroupDecision} from '../src/lib/ranking-flag-group';
import {parseRankingFlagRejectionV2} from '../src/lib/ranking-flag-rejection-v2';
const stomach='0994f1f7-a39e-d12b-cf93-9566fe52ee1b',line='f451ec75-95a3-880e-8b5c-8135d5377180';
const report='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const legacy={report_id:report,confirmed:true,review_note:'Verified stomach contact and body alignment failures.',watched_video:true,rule_ids:[stomach,line]};
it('accepts the two deployed Full Front Lever Touch rules throughout legacy and category-changing review contracts',()=>{
 expect(parseRuleIds(legacy.rule_ids)).toEqual(legacy.rule_ids);
 expect(parseRankingFlagDecision(legacy)).toEqual(legacy);
 expect(parseRankingFlagGroupDecision({...legacy,expected_open_report_ids:[report]})).toEqual({...legacy,expected_open_report_ids:[report]});
 expect(parseRankingFlagRejectionV2({...legacy,reason_code:'unacceptable_form'})).toEqual({...legacy,reason_code:'unacceptable_form'});
 expect(parseRankingFlagRejectionV2({...legacy,reason_code:'unacceptable_form',expected_open_report_ids:[report]},true)).toEqual({...legacy,reason_code:'unacceptable_form',expected_open_report_ids:[report]});
 const rules=[{id:stomach,type:'form',text:'Keep your stomach in contact with the bar throughout the hold.',position:2},{id:line,type:'form',text:'Keep the line through your feet, hips and shoulders parallel to the ground throughout the hold.',position:1}];
 expect(parseExerciseRules(rules)).toEqual(rules);
});
it('accepts every deterministic Touch form-rule ID without assuming UUID version or variant bits',()=>{
 for(const board of ['front-lever-touch-adv-tuck','front-lever-touch-straddle','front-lever-touch-full'])for(const key of ['bar_contact','horizontal_alignment']){
  const hex=createHash('md5').update(`front_lever_touch_form_v1:${board}:${key}`).digest('hex');
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  expect(parseRuleIds([id])).toEqual([id]);
 }
});
it('still rejects malformed IDs, duplicates, excessive choices, unwatched rejections and unrelated category rules',()=>{
 for(const id of ['',stomach+'x',stomach.replace(/-/g,''),stomach.replace('0994','zzzz'),'../rule',null,7])expect(parseRuleIds([id])).toBeNull();
 expect(parseRuleIds([stomach,stomach])).toBeNull();expect(parseRuleIds(Array(9).fill(stomach))).toBeNull();
 expect(parseRuleIds([stomach.toUpperCase()])).toEqual([stomach.toUpperCase()]);
 expect(parseRankingFlagRejectionV2({...legacy,reason_code:'unacceptable_form',watched_video:false})).toBeNull();
 expect(parseRankingFlagRejectionV2({...legacy,reason_code:'incorrect_exercise'})).toBeNull();
 expect(()=>parseExerciseRules([{id:stomach,type:'other',text:'Invalid kind'}])).toThrow();
});
