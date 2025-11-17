import { useAuthStore } from "../store/auth";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPwd] = useState("");
  const [err, setErr] = useState("");
  const setToken = useAuthStore((s) => s.setToken);
  const bootstrapAfterLogin = useAuthStore((s) => s.bootstrapAfterLogin);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "登录失败");

      // 保存 token -> 自举 /api/me
      setToken(data.token);
      await bootstrapAfterLogin();

      // 按角色跳转
      const me = useAuthStore.getState().me || {};
      const role = me.role;
      location.replace(
        role === "ADMIN" ? "/admin" :
        role === "SCHOOL_ADMIN" ? "/school" :
        role === "TEACHER" ? "/teacher" : "/student"
      );
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 360, margin: "60px auto", display: "grid", gap: 8 }}>
      <h2>登录</h2>
      <input placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="密码" value={password} onChange={(e) => setPwd(e.target.value)} />
      <button type="submit">登录</button>
      {err && <div style={{ color: "red" }}>{err}</div>}
    </form>
  );
}
