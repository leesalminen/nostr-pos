export type Fetcher = typeof fetch;

export const browserFetch: Fetcher = (input, init) => globalThis.fetch(input, init);
