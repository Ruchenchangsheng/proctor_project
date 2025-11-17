//auth.js

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * authStore 持久化字段：
 * - token: JWT 访问令牌
 * - me: /api/me 返回的用户画像与角色上下文
 * - ctx:（可选）从 me 派生的上下文字段，便于需要时统一读取
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: "",
      me: null,
      ctx: null,

      setToken: (t) => set({ token: t || "" }),
      setMe: (me) => set({ me }),
      setCtx: (ctx) => set({ ctx }),

      logout: () => set({ token: "", me: null, ctx: null }),

      // 登录后的一次性自举：设置 token -> 拉取 /api/me -> 写入 me/ctx
      bootstrapAfterLogin: async () => {
        const token = get().token;
        if (!token) return;
        const r = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.message || "获取用户信息失败");
        set({ me: data, ctx: {
          schoolId: data.schoolId,
          departmentId: data.departmentId,
          majorId: data.majorId,
          teacherId: data.teacherId,
          studentId: data.studentId
        }});
      }
    }),
    { name: "proctor-auth" } // localStorage key
  )
);
