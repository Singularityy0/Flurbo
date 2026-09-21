import { getRandomValues } from 'expo-crypto';

// Required before future Mera imports on Hermes; no account keys are created here.
if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}
