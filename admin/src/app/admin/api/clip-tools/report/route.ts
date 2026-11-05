import {NextRequest} from 'next/server';
import {clipActionReceipt,clipMutation} from '@/lib/admin-clip-api';
import {parseClipReportCommand} from '@/lib/admin-clip-tools';
export async function POST(request:NextRequest){return clipMutation(request,parseClipReportCommand,'admin_report_clip_v1',clipActionReceipt);}
