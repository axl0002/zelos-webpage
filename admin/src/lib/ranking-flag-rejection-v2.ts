import {parseRankingFlagDecision, rankingReasons} from "./ranking-flags";
import {parseRankingFlagGroupDecision} from "./ranking-flag-group";
export function parseRankingFlagRejectionV2(value:unknown,group=false) {
 if (!value || typeof value!=="object" || Array.isArray(value)) return null;
 const {reason_code,...legacy}=value as Record<string,unknown>;
 if (typeof reason_code!=="string" || !(Object.hasOwn(rankingReasons,reason_code)||reason_code==="other")) return null;
 const expected=group?7:6;
 if(Object.keys(value).length!==expected)return null;
 const decision=group?parseRankingFlagGroupDecision(legacy):parseRankingFlagDecision(legacy);
 if(!decision||!decision.confirmed||(!["unacceptable_form","unacceptable_filming"].includes(reason_code)&&decision.rule_ids.length>0))return null;
 return {...decision,reason_code};
}
