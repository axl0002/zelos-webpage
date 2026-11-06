export class WeightRequestError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}
export async function weightRequest(signal: AbortSignal, body?: unknown): Promise<unknown> {
  const controller = new AbortController(), abort = () => controller.abort();
  signal.addEventListener("abort", abort, {once: true}); if (signal.aborted) controller.abort();
  let interrupted!: () => void;
  const stopped = new Promise<never>((_, reject) => { interrupted = () => reject(new WeightRequestError("The request was interrupted. Retry the same apply request to check its result."));
    controller.signal.addEventListener("abort", interrupted, {once: true}); if (controller.signal.aborted) interrupted(); });
  const timer = setTimeout(abort, 60000);
  try {
    return await Promise.race([stopped, (async () => {
      const response = await fetch("/admin/api/scoring-weights", {signal: controller.signal, cache: "no-store",
        ...(body ? {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)} : {})});
      const value = await response.json();
      if (!response.ok) throw new WeightRequestError(typeof value?.error === "string" ? value.error : "The weights request could not finish.", response.status);
      return value;
    })()]);
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", interrupted); }
}
