import { createContext, useContext, type ReactNode } from "react";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
const AuthState = createContext<ReturnType<typeof authClient.useSession> | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  return <AuthState.Provider value={session}>{children}</AuthState.Provider>;
}

export function useAuth() {
  const session = useContext(AuthState);
  if (!session) throw new Error("Missing auth context");
  return session;
}

// Build-time public HTML contains no session data or account-specific content.
export function AnonymousAuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthState.Provider
      value={{
        data: null,
        isPending: false,
        isRefetching: false,
        error: null,
        refetch: async () => {},
      }}
    >
      {children}
    </AuthState.Provider>
  );
}
