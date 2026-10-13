// The native shell appends this token. A desktop browser never has it, so the extension path stays unchanged.
export function inFlurboApp() {
  return typeof navigator !== 'undefined' && /\bFlurboNative\b/.test(navigator.userAgent);
}
