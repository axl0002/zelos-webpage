import {NextRequest, NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {checkMutation, rpcFailure} from '@/lib/review-api';
import {privateResponse} from '@/lib/ranked-upload-api';
import {readHoldCommand} from '@/lib/ranked-upload-hold';
import {parseRankedUploadRepContext, repUploadId} from '@/lib/ranked-upload-reps';
export async function POST(request: NextRequest) {
  try {
    const invalid = checkMutation(request); if (invalid) return privateResponse(invalid);
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    const upload = repUploadId(await readHoldCommand(request));
    if (!upload) return privateResponse(NextResponse.json({error: 'Choose a valid ranked upload.'}, {status: 400}));
    const {data, error} = await auth.client.rpc('get_ranked_upload_rep_edit_context_v1', {upload_id: upload});
    if (error) return privateResponse(rpcFailure(error, 'load'));
    const context = parseRankedUploadRepContext(data);
    if (!context || context.upload_id !== upload) return privateResponse(NextResponse.json({error: 'The rep count could not be loaded. Refresh the queue.'}, {status: 503}));
    return privateResponse(NextResponse.json(context));
  } catch { return privateResponse(rpcFailure({}, 'load')); }
}
