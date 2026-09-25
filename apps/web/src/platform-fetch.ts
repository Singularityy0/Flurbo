// The web defaults to same-origin fetch. Native supplies a transport to the
// canonical HTTPS API while reusing the same review and transaction validators.
let transport: typeof fetch | undefined;
export function setAppTransport(value: typeof fetch) { transport = value; }
export const appFetch: typeof fetch = (input, init) => (transport ?? globalThis.fetch)(input, init);
