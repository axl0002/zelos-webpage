import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {privateResponse} from '@/lib/ranked-upload-api';
import {clipFailure} from '@/lib/admin-clip-api';
import {parseAdminClipContext,parseClipTarget} from '@/lib/admin-clip-tools';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{
 const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);
 const target=parseClipTarget({kind:request.nextUrl.searchParams.get('kind'),id:request.nextUrl.searchParams.get('id')});if(!target)return privateResponse(NextResponse.json({error:'Choose a valid clip.'},{status:400}));
 const {data,error}=await auth.client.rpc('admin_clip_context_v1',{target_kind:target.kind,target_id:target.id});if(error)return clipFailure(error);
 const parsed=parseAdminClipContext(data);if(!parsed||parsed.kind!==target.kind||parsed.id!==target.id)return clipFailure();return privateResponse(NextResponse.json(parsed));
 }catch{return clipFailure();}}
