"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  getMe,
  login as apiLogin,
  setUnauthorizedHandler,
  ApiError,
  type UserPublic,
} from "@/lib/api";
import { TOKEN_KEY } from "@/lib/constants";

interface AuthState {
  user: UserPublic | null;
  token: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// 已知风险：JWT 存于 localStorage，存在被注入脚本（XSS）读取的可能。
// 当前为同源 SPA 的常见取舍；如需更高安全性可改为 httpOnly Cookie 方案。
function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function tryRestore(token: string, maxRetries = 3): Promise<UserPublic> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getMe(token);
    } catch (err) {
      // 认证失败（token 无效/过期）是确定性错误，立即放弃不重试
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      if (i < maxRetries - 1) {
        // 网络抖动等瞬时错误，等 2 秒再重试
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw new Error("Failed to restore session");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  // 初始值必须确定（服务端无 localStorage）：token=null、isLoading=true，
  // 否则服务端与客户端首帧不一致会触发水合错误。真实值在下方 effect 挂载后读取。
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 注册全局 401/403 兜底：任意请求遭遇认证失效时清理会话，
    // AuthGuard 侦测到未登录后会自动跳转登录页。
    setUnauthorizedHandler(() => {
      removeToken();
      setToken(null);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    // 读取 localStorage 是客户端专有的外部状态同步，只能在挂载后进行。
    // 此处的同步 setState 属正确用法（effect 就是用来同步外部系统的），
    // set-state-in-effect 规则在这里是误报，故定向豁免。
    const stored = getStoredToken();
    if (!stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      return;
    }
    setToken(stored);
    tryRestore(stored)
      .then(setUser)
      .catch(() => { removeToken(); setToken(null); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    storeToken(res.access_token);
    setToken(res.access_token);
    try {
      const me = await getMe(res.access_token);
      setUser(me);
    } catch {
      // token 有效但获取用户信息失败（网络抖动等），清理以避免不一致状态
      removeToken();
      setToken(null);
      throw new Error("登录后获取用户信息失败，请重试");
    }
  };

  const logout = () => {
    removeToken();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, isLoggedIn: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
