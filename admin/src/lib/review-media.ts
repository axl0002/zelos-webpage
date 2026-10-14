export function mediaUrls(candidate: {
  renditions: Record<string, string>;
  primary_url: string;
}): string[] {
  const safe = (url: string) => {
    try {
      const u = new URL(url);
      return (
        u.protocol === "https:" &&
        u.hostname === "media.zelos.club" &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  };
  const entries = Object.entries(candidate.renditions).sort(
    ([a], [b]) =>
      (/720/.test(a) ? 0 : /480/.test(a) ? 1 : 2) -
      (/720/.test(b) ? 0 : /480/.test(b) ? 1 : 2),
  );
  return [
    ...new Set(
      [...entries.map(([, url]) => url), candidate.primary_url].filter(safe),
    ),
  ];
}
