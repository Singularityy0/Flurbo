import {
  createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession,
  getEvmAddress, isMeraError,
  type Secp256k1SigningSession, type WebAuthnClient,
} from "@category-labs/mera";
import { HDKey, HARDENED_OFFSET } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { SESSION_MS, type AuthPolicy } from "./policy.ts";

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Remembered = { version: 1; rpId: string; credentialId: string; address: string };
export type AuthSnapshot = {
  busy: boolean; address: string | null; expiresAt: number | null;
  remembered: boolean; error: string | null; notice: string | null;
};

// Matches Mera's documented BIP-39 / BIP-44 EVM account recipe, index 0.
// These derivation choices are part of account identity and must not change silently.
export function deriveAccount(prfOutput: Uint8Array) {
  if (prfOutput.length !== 32) throw new Error("Invalid account entropy");
  let seed: Uint8Array | undefined;
  let node: HDKey | undefined;
  let key: Uint8Array | null = null;
  let session: Secp256k1SigningSession | undefined;
  try {
    seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
    node = HDKey.fromMasterSeed(seed);
    for (const index of [44 + HARDENED_OFFSET, 60 + HARDENED_OFFSET, HARDENED_OFFSET, 0, 0]) {
      const child: HDKey = node!.deriveChild(index);
      node!.wipePrivateData();
      node = child;
    }
    key = node!.privateKey;
    if (!key) throw new Error("Account derivation failed");
    session = createSecp256k1SigningSession({ privateKey: key });
    return { session, address: getEvmAddress(session.publicKey) };
  } catch (error) {
    session?.end();
    throw error;
  } finally {
    key?.fill(0);
    node?.wipePrivateData();
    seed?.fill(0);
  }
}

function friendlyError(error: unknown, creating: boolean): string {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") return "This passkey provider does not support the account feature Mera needs (PRF). Try a compatible password manager or device. A passkey may have been saved, but Flurbo has not opened an account session.";
    if (error.code === "PASSKEY_OPERATION_FAILED") return creating
      ? "Passkey setup was cancelled or could not finish. If your device saved a passkey, try Sign in before creating another."
      : "Sign-in was cancelled or could not finish. Try again, or choose another passkey.";
  }
  // Never surface raw SDK exceptions, which may contain credential details.
  return "The account could not be opened. Try signing in again with your existing passkey.";
}

export class AuthController {
  readonly policy: AuthPolicy;
  #storage?: StoragePort;
  #client?: WebAuthnClient;
  #now: () => number;
  #key: string;
  #session?: Secp256k1SigningSession;
  #timer?: ReturnType<typeof setTimeout>;
  #generation = 0;
  #inFlight = false;
  #listeners = new Set<() => void>();
  #snapshot: AuthSnapshot;

  constructor(options: { policy: AuthPolicy; storage?: StoragePort; client?: WebAuthnClient; now?: () => number }) {
    this.policy = options.policy;
    this.#storage = options.storage;
    this.#client = options.client;
    this.#now = options.now ?? Date.now;
    this.#key = `flurbo.passkey.v1:${this.policy.rpId ?? "unavailable"}`;
    this.#snapshot = { busy: false, address: null, expiresAt: null, remembered: !!this.#read(), error: null, notice: null };
  }

  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #update(patch: Partial<AuthSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#listeners.forEach(listener => listener());
  }
  #read(): Remembered | undefined {
    try {
      const value = JSON.parse(this.#storage?.getItem(this.#key) ?? "null");
      if (value?.version === 1 && value.rpId === this.policy.rpId &&
          typeof value.credentialId === "string" && /^[A-Za-z0-9_-]{1,2048}$/.test(value.credentialId) &&
          typeof value.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.address)) return value;
    } catch { /* Missing or malformed metadata is not an authenticated account. */ }
    return undefined;
  }
  #endSession() { clearTimeout(this.#timer); this.#session?.end(); this.#session = undefined; }
  signOut = (notice: string | null = null) => {
    this.#generation++;
    this.#endSession();
    this.#update({ busy: false, address: null, expiresAt: null, error: null, notice });
  };
  checkExpiry = () => {
    if (this.#snapshot.expiresAt !== null && this.#now() >= this.#snapshot.expiresAt) {
      this.signOut("Your session expired. Sign in again to open your account.");
    }
  };

  async authenticate(mode: "signup" | "login", name = "Flurbo account", chooseAnother = false, allowNew = false): Promise<boolean> {
    if (this.#inFlight) return false;
    if (!this.policy.rpId) { this.#update({ error: this.policy.reason }); return false; }
    const known = this.#read();
    if (mode === "signup" && known && !allowNew) {
      this.#update({ error: "A passkey is already remembered here. Sign in, or confirm that you want a separate account." });
      return false;
    }
    this.#endSession();
    this.#inFlight = true;
    const generation = ++this.#generation;
    this.#update({ busy: true, address: null, expiresAt: null, error: null, notice: null });
    let result: { credentialId: string; prfOutput: Uint8Array } | undefined;
    let derived: ReturnType<typeof deriveAccount> | undefined;
    try {
      const label = name.trim().slice(0, 48) || "Flurbo account";
      result = mode === "signup"
        ? await createPasskeyWithPrfOutput({ rp: { id: this.policy.rpId, name: this.policy.local ? "Flurbo local test" : "Flurbo" },
            user: { name: label, displayName: label }, timeout: 60_000, webAuthnClient: this.#client })
        : await getPasskeyPrfOutput({ rpId: this.policy.rpId,
            credential: !chooseAnother && known ? { credentialId: known.credentialId } : undefined,
            timeout: 60_000, webAuthnClient: this.#client });
      if (generation !== this.#generation) return false;
      if (mode === "login" && !chooseAnother && known && known.credentialId !== result.credentialId) {
        this.#update({ error: "A different passkey was returned. Use Choose another passkey to switch accounts." });
        return false;
      }
      derived = deriveAccount(result.prfOutput);
      if (known?.credentialId === result.credentialId && known.address.toLowerCase() !== derived.address.toLowerCase()) {
        this.#update({ error: "This passkey returned a different account address. Sign-in was stopped to protect your existing account." });
        return false;
      }
      let notice: string | null = null;
      let remembered = false;
      try {
        if (!this.#storage) throw new Error("Storage unavailable");
        const record: Remembered = { version: 1, rpId: this.policy.rpId, credentialId: result.credentialId, address: derived.address };
        this.#storage.setItem(this.#key, JSON.stringify(record));
        remembered = true;
      } catch { notice = "This browser cannot remember the account. Next time, choose your passkey from the device prompt."; }
      this.#session = derived.session;
      const address = derived.address;
      derived = undefined;
      const expiresAt = this.#now() + SESSION_MS;
      this.#timer = setTimeout(this.checkExpiry, SESSION_MS);
      this.#update({ address, expiresAt, remembered, notice });
      return true;
    } catch (error) {
      if (generation === this.#generation) this.#update({ error: friendlyError(error, mode === "signup") });
      return false;
    } finally {
      result?.prfOutput.fill(0);
      derived?.session.end();
      this.#inFlight = false;
      if (generation === this.#generation) this.#update({ busy: false });
    }
  }
}
