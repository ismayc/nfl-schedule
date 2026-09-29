// A FROZEN stand-in for src/data/meta.js, the "data as of" stamp. The refresh rewrites
// the live module whenever the data changes, so under vitest every import of it resolves
// here instead; see the frozenData plugin in vite.config.js. Never regenerated.
//
// Deliberately NOT the live module's value: test/guards.test.js compares the two, and a
// frozen value equal to the live one could not prove the redirect happened.

export const DATA_UPDATED_AT = '2026-09-04T13:05:00.000Z'
