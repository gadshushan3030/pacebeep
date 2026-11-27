// One JSON line per event, read back with `vercel logs`. The request log there keeps a path without
// its query string and without a user agent, so on its own it cannot tell a coach link's cover page
// from its training page or from an add, cannot say which assistant came, and never shows why a
// pasted plan was refused. Never a token, a user id, or anything a runner or a coach typed.
export const event = (at: string, data: Record<string, unknown>) => console.log(JSON.stringify({ at, ...data }));
