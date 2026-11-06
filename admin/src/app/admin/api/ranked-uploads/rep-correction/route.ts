import {NextRequest, NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {checkMutation, rpcFailure} from '@/lib/review-api';
import {privateResponse} from '@/lib/ranked-upload-api';
import {readHoldCommand} from '@/lib/ranked-upload-hold';
import {parseRankedUploadRepCorrection} from '@/lib/ranked-upload-reps';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const invalid = checkMutation(request); if (invalid) return privateResponse(invalid);
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    const command = parseRankedUploadRepCorrection(await readHoldCommand(request));
    if (!command) return privateResponse(NextResponse.json({error: 'Enter whole reps, confirm the full video review and add a correction note.'}, {status: 400}));
    const {data, error} = await auth.client.rpc('admin_correct_ranked_upload_reps_v1', command);
    if (error) return privateResponse(rpcFailure(error));
    if (!data || data.ok !== true || data.status !== 'corrected' || data.value !== command.corrected_value || data.revision !== command.expected_revision + 1)
      return privateResponse(NextResponse.json({error: 'The saved correction could not be verified. Refresh the queue before retrying.'}, {status: 503}));
    return privateResponse(NextResponse.json({ok: true, status: 'corrected', value: data.value, revision: data.revision}));
  } catch { return privateResponse(NextResponse.json({error: 'The correction could not finish. Refresh the queue before retrying; it may have saved.'}, {status: 503})); }
}
