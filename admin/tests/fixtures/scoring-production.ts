import {initialLabConfig} from "../../src/lib/scoring-lab";
export const originalId="44444444-4444-4444-8444-000000000001",versionId="44444444-4444-4444-8444-000000000002",previewId="44444444-4444-4444-8444-000000000003",eventId="44444444-4444-4444-8444-000000000004";
const common={engine:"score_engine_v1",config:initialLabConfig,shrinkage:10,calibration_note:"Synthetic reviewed reference",created_at:"2026-10-23T00:00:00Z",ready:true};
export const version={...common,id:versionId,name:"Discounted hybrid"};
export const activation={id:eventId,previous_id:originalId,active_id:versionId,reason:"Reviewed comparison and benchmarks",rankings_version:1,created_at:"2026-10-23T00:05:00Z"};
export const registry={active_id:originalId,rankings_version:0,versions:[{...common,id:originalId,name:"Original rank scoring v1"},version],history:[]};
export const preview={id:previewId,version_id:versionId,created_at:"2026-10-23T00:01:00Z",expires_at:"2099-10-23T00:11:00Z",summary:{record_count:100,cohorts:[{discipline:"pull",gender:"male",athletes:50,moved:20,max_rank_change:12,max_score_change:10.25,top10_overlap:.8}]}};
