import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
type SignInIdentity = { userId: string; token: string };
type SignInConfirmation = {
  identity: SignInIdentity;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};
const confirmationFailure = () => new Error("暂时无法确认新的登录会话，请重新登录。");
type AuthSession = ReturnType<typeof authClient.useSession> & {
  requireSignIn: () => void;
  completeSignIn: (identity: SignInIdentity) => Promise<void>;
};
const AuthState = createContext<AuthSession | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const [signInRequired, setSignInRequired] = useState(false);
  const pending = useRef<SignInConfirmation | null>(null);
  const [confirmation, setConfirmation] = useState<{
    attempt: SignInConfirmation;
    finished: boolean;
  } | null>(null);
  const finishConfirmation = useCallback((attempt: SignInConfirmation, error?: Error) => {
    if (pending.current !== attempt) return;
    pending.current = null;
    clearTimeout(attempt.timeout);
    setConfirmation(null);
    if (error) attempt.reject(error);
    else {
      setSignInRequired(false);
      attempt.resolve();
    }
  }, []);
  const requireSignIn = useCallback(() => {
    if (pending.current) finishConfirmation(pending.current, confirmationFailure());
    setSignInRequired(true);
  }, [finishConfirmation]);
  const refetch = session.refetch;
  const completeSignIn = useCallback(
    (identity: SignInIdentity) => {
      if (pending.current) finishConfirmation(pending.current, confirmationFailure());
      setSignInRequired(true);
      return new Promise<void>((resolve, reject) => {
        const attempt: SignInConfirmation = {
          identity,
          resolve,
          reject,
          timeout: setTimeout(
            () => finishConfirmation(attempt, new Error("确认登录会话超时，请重新登录。")),
            15_000,
          ),
        };
        pending.current = attempt;
        setConfirmation({ attempt, finished: false });
        // 登录请求关闭默认的延迟刷新；这里主动刷新并取消旧查询，避免两次刷新互相取消。
        void Promise.resolve()
          .then(() => refetch({ query: { disableCookieCache: true } }))
          .then(
            () => {
              if (pending.current === attempt) setConfirmation({ attempt, finished: true });
            },
            () => finishConfirmation(attempt, confirmationFailure()),
          );
      });
    },
    [refetch, finishConfirmation],
  );
  useEffect(() => {
    if (!confirmation?.finished || pending.current !== confirmation.attempt) return;
    if (session.isPending || session.isRefetching) return;
    const { attempt } = confirmation;
    // refetch() 本身不返回会话、也不因 HTTP 500 而 reject；必须检查 Hook 的最终快照。
    // 同一个账号重新登录也须匹配新 token，不能用旧会话解除保护。
    const matches =
      !session.error &&
      session.data?.user.id === attempt.identity.userId &&
      session.data?.session.token === attempt.identity.token;
    finishConfirmation(attempt, matches ? undefined : confirmationFailure());
  }, [
    confirmation,
    session.data,
    session.error,
    session.isPending,
    session.isRefetching,
    finishConfirmation,
  ]);
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timeout);
      pending.current.reject(confirmationFailure());
      pending.current = null;
    },
    [],
  );
  // 业务接口已确认会话失效后，缓存及迟到的查询结果不能恢复登录态或挡住登录表单。
  // 该状态跨页面保留，只在确认本次登录的新会话后解除；OAuth 回跳会重新加载页面。
  return (
    <AuthState.Provider
      value={{
        ...session,
        ...(signInRequired
          ? { data: null, error: null, isPending: false, isRefetching: false }
          : {}),
        requireSignIn,
        completeSignIn,
      }}
    >
      {children}
    </AuthState.Provider>
  );
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
        requireSignIn: () => {},
        completeSignIn: async () => {},
      }}
    >
      {children}
    </AuthState.Provider>
  );
}
