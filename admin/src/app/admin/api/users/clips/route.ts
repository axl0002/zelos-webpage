import {NextRequest,NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {privateResponse} from '@/lib/ranked-upload-api';
import {clipFailure} from '@/lib/admin-clip-api';
import {parseAdminUserClipsPage} from '@/lib/admin-clip-tools';
import {reportId} from '@/lib/moderation-reports';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{const auth=await requireAdmin();if(auth.response)return privateResponse(auth.response);const p=request.nextUrl.searchParams,id=p.get('user_id'),time=p.get('cursor_time'),cursor=p.get('cursor_id');
 if(!reportId(id)||(time===null)!==(cursor===null)||time!==null&&(!Number.isFinite(Date.parse(time))||time.length>80||!cursor||cursor.length>200))return privateResponse(NextResponse.json({error:'Choose a user and valid clip page.'},{status:400}));
 const {data,error}=await auth.client.rpc('admin_user_clips_v1',{target_user:id,cursor_time:time,cursor_id:cursor,page_size:20});if(error)return clipFailure(error);const page=parseAdminUserClipsPage(data);if(!page||page.items.some(x=>x.author_id!==id))return clipFailure();return privateResponse(NextResponse.json(page));}catch{return clipFailure();}}
