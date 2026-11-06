// A read-only production build check. Use the exact server query/parser without
// copying or logging the Vercel secret. This never creates users or events.
import {registerHooks} from 'node:module';
if (!process.env.POSTHOG_PERSONAL_API_KEY && process.env.VERCEL_ENV !== 'production') {
  console.log('DAU connection check skipped: no local server read credential.');
} else {
  try {
    // Node 24 (the pinned Vercel build runtime) strips TypeScript. Resolve the
    // extensionless local imports that Next normally resolves for these files.
    registerHooks({resolve(specifier, context, next) {
      if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !/\.[a-z]+$/i.test(specifier))
        return next(new URL(specifier + '.ts', context.parentURL).href, context);
      return next(specifier, context);
    }});
    const {getDailyActiveUsers} = await import('../src/lib/admin-dau.server.ts');
    for (const timezone of ['UTC','Asia/Shanghai']) {
      const data = await getDailyActiveUsers({days:7,timezone});
      console.log('DAU source verified: ' + JSON.stringify({project:99683,timezone,asOf:data.generated_at,days:data.daily.length,today:data.daily.at(-1).active_users,yesterday:data.daily.at(-2)?.active_users??null}));
    }
  } catch {
    console.error('DAU source verification failed. Check the production PostHog project restriction and query:read permission. Provider details withheld.');
    process.exitCode=1;
  }
}
