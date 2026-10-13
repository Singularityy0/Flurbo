// The native shell appends this token. A desktop browser never has it, so the extension path stays unchanged.
export function inFlurboApp(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /\bFlurboNative\b/.test(userAgent);
}

// Phones have no MetaMask extension. The shell and a phone browser both open the MetaMask app.
export function phoneUsesMetaMaskApp(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return inFlurboApp(userAgent) || /Android|iPhone|iPad|iPod/i.test(userAgent);
}
