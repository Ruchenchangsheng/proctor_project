import React, { useEffect, useState } from "react";
import { api } from "../apiClient";

export default function Admin() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ schoolName: "", adminName: "", adminEmail: "" ,domain: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const th = { textAlign: "left", padding: "10px 12px", background: "#f5f7fa", fontWeight: 600, fontSize: 14, borderBottom: "1px solid #eaeaea" };
  const td = { padding: "10px 12px", borderTop: "1px solid #f0f0f0", verticalAlign: "top" };

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/admin/schools");
      setList(r.data || []);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createSchool(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api.post("/admin/schools", form);
      setMsg("创建成功（已向管理员邮箱发送初始密码）");
      setForm({ schoolName: "", adminName: "", adminEmail: "",domain: "" });
      await load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 960, margin: "0 auto" }}>
      <h3 style={{ margin: "0 0 12px" }}>添加学校 + 管理员</h3>
      <form onSubmit={createSchool} style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr auto", alignItems: "center" }}>
        <input
          placeholder="学校名称"
          value={form.schoolName}
          onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
        />
                <input
          placeholder="学校邮箱"
          value={form.domain}
          onChange={(e) => setForm({ ...form, domain: e.target.value })}
        />
        <input
          placeholder="管理员姓名"
          value={form.adminName}
          onChange={(e) => setForm({ ...form, adminName: e.target.value })}
        />
        <input
          placeholder="管理员邮箱"
          value={form.adminEmail}
          onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
        />
        <button style={{ height: 36 }}>创建</button>
      </form>
      {msg && <div style={{ marginTop: 10, color: "#555" }}>{msg}</div>}

      <div style={{ height: 20 }} />

      <h2 style={{ margin: "0 0 12px" }}>学校列表（含管理员）</h2>
      <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 16 }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 16, color: "#777" }}>暂无数据</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {/* <th style={th}>#</th> */}
                  <th style={th}>学校名称</th>
                  <th style={th}>管理员姓名</th>
                  <th style={th}>管理员邮箱</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s, i) => (
                  <tr key={s.id ?? i} style={{ background: i % 2 ? "#fcfcfc" : "#fff" }}>
                    {/* <td style={td}>{i + 1}</td> */}
                    <td style={td}>{s.name}</td>
                    <td style={td}>{s.adminName || "--"}</td>
                    <td style={td}>{s.adminEmail || "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
