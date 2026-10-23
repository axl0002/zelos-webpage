import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

export function temporaryAuthError(error: AuthError | null) {
  return (
    !!error &&
    (isAuthRetryableFetchError(error) ||
      error.status === 0 ||
      error.status === 429 ||
      (error.status !== undefined && error.status >= 500))
  );
}
