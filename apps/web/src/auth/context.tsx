import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AuthController } from "./controller";
import { authPolicy } from "./policy";

const AuthContext = createContext<AuthController | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Private browsing may deny storage. */ }
    return new AuthController({
      policy: authPolicy(window.location.href, import.meta.env.DEV, window.isSecureContext,
        !!window.PublicKeyCredential && !!navigator.credentials?.create && !!navigator.credentials?.get), storage,
    });
  });
  useEffect(() => {
    const pageHide = () => controller.signOut();
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("focus", controller.checkExpiry);
    document.addEventListener("visibilitychange", controller.checkExpiry);
    return () => {
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("focus", controller.checkExpiry);
      document.removeEventListener("visibilitychange", controller.checkExpiry);
      controller.signOut();
    };
  }, [controller]);
  return <AuthContext.Provider value={controller}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const controller = useContext(AuthContext);
  if (!controller) throw new Error("AuthProvider is missing");
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { controller, state, policy: controller.policy };
}
