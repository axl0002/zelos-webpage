import { NextResponse } from "next/server";
import { cache } from "react";
import { serverClient } from "./supabase/server";
import { temporaryAuthError } from "./supabase/auth-errors";
import type { ReviewContext } from "./review-types";

// Deduplicate layout/page verification within one server render. React's cache
// is request-scoped; it never shares identities or admin context across users.
export const requireAdmin = cache(async function requireAdmin() {
  const client = await serverClient();
  let result = await client.auth.getUser();
  // Only retry the read-only identity check, never an approval. A failed
  // connection is not evidence that the user's cookie session is invalid.
  if (temporaryAuthError(result.error) && result.error?.status !== 429)
    result = await client.auth.getUser();
  const {
    data: { user },
    error,
  } = result;
  if (temporaryAuthError(error))
    return {
      response: NextResponse.json(
        {
          error:
            "Could not verify your session because the sign-in service is temporarily unavailable. Your review inputs are still here; try again.",
        },
        { status: 503 },
      ),
    };
  if (error || !user)
    return {
      response: NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401 },
      ),
    };
  const { data, error: roleError } = await client.rpc(
    "admin_rank_review_context",
  );
  if (roleError)
    return {
      response: NextResponse.json(
        {
          error:
            roleError.code === "42501"
              ? "This account does not have admin access."
              : "Review service unavailable. Try again.",
        },
        { status: roleError.code === "42501" ? 403 : 503 },
      ),
    };
  return { client, user, context: data as ReviewContext };
});
