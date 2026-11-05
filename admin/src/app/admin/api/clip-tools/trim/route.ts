import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {privateResponse} from '@/lib/ranked-upload-api';
import {clipFailure,clipMutation} from '@/lib/admin-clip-api';
import {parseClipTrimCommand,parseClipTrimStatus} from '@/lib/admin-clip-tools';
import {reportId} from '@/lib/moderation-reports';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){return clipMutation(request,parseClipTrimCommand,'admin_request_clip_trim_v1',v=>parseClipTrimStatus(v));}
export async function GET(request:NextRequest){try{const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);const id=request.nextUrl.searchParams.get('id');if(!reportId(id))return privateResponse(NextResponse.json({error:'Choose a valid trim request.'},{status:400}));
 const {data,error}=await auth.client.rpc('admin_clip_trim_status_v1',{trim_id:id});if(error)return clipFailure(error);const result=parseClipTrimStatus(data);return result&&result.id===id?privateResponse(NextResponse.json(result)):clipFailure();}catch{return clipFailure();}}
