export type ReviewQueueCursor = {
  v: 1;
  level: 0 | 1 | 2;
  weight: number;
  exercise: string;
  board: string;
  measurement: number;
  post: string;
  status: 'pending' | 'approved' | 'skipped';
  filter_exercise: string | null;
  search: string;
};
export function parseReviewQueueCursor(value: unknown): ReviewQueueCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string,unknown>;
  const keys = ['v','level','weight','exercise','board','measurement','post','status','filter_exercise','search'];
  if (Object.keys(c).length !== keys.length || !keys.every(k=>k in c) || c.v!==1 || ![0,1,2].includes(c.level as number) ||
      typeof c.weight!=='number' || !Number.isFinite(c.weight) || c.weight<0 || c.weight>10000 ||
      !Number.isSafeInteger(c.measurement) || Number(c.measurement)<0 || Number(c.measurement)>2147483647 ||
      !['exercise','board','post','status','search'].every(k=>typeof c[k]==='string' && (c[k] as string).length<=200) ||
      !(c.post as string).length || (c.search as string).length>100 ||
      !['pending','approved','skipped'].includes(c.status as string) ||
      c.filter_exercise!==null && (typeof c.filter_exercise!=='string'||c.filter_exercise.length>200)) return null;
  return c as ReviewQueueCursor;
}
