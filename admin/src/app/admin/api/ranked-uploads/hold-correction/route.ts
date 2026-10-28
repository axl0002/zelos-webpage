import {NextRequest, NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/require-admin';
import {checkMutation, rpcFailure} from '@/lib/review-api';
import {privateResponse} from '@/lib/ranked-upload-api';
import {parseRankedUploadHoldCorrection, readHoldCommand} from '@/lib/ranked-upload-hold';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const invalid = checkMutation(request); if (invalid) return privateResponse(invalid);
    const auth = await requireAdmin(); if (auth.response) return privateResponse(auth.response);
    const command = parseRankedUploadHoldCorrection(await readHoldCommand(request));
    if (!command) return privateResponse(NextResponse.json({error: 'Check the hold frames, full-video confirmation and review note.'}, {status: 400}));
    const {data, error} = await auth.client.rpc('admin_correct_ranked_upload_hold_v1', command);
    if (error) return privateResponse(rpcFailure(error));
    if (!data || data.ok !== true || data.status !== 'corrected' || data.value !== Math.floor((command.hold_end_ms-command.hold_start_ms)/1000) ||
      data.revision !== command.expected_revision+1 || data.hold_timing?.start_ms !== command.hold_start_ms || data.hold_timing?.end_ms !== command.hold_end_ms || data.hold_timing?.duration_ms !== command.hold_end_ms-command.hold_start_ms)
      return privateResponse(NextResponse.json({error: 'The saved correction could not be verified. Refresh the queue before retrying.'}, {status: 503}));
    return privateResponse(NextResponse.json({ok: true, status: 'corrected', value: data.value, revision: data.revision, hold_timing: data.hold_timing}));
  } catch { return privateResponse(NextResponse.json({error: 'The correction could not finish. Refresh the queue before retrying; it may have saved.'}, {status: 503})); }
}
