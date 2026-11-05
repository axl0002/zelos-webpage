import {NextRequest} from 'next/server';
import {clipActionReceipt,clipMutation} from '@/lib/admin-clip-api';
import {parseClipRejectCommand} from '@/lib/admin-clip-tools';
export async function POST(request:NextRequest){return clipMutation(request,parseClipRejectCommand,'admin_reject_clip_v1',clipActionReceipt);}
