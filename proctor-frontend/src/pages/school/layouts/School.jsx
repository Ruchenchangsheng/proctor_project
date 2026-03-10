import React, { useEffect, useState } from "react";
import { api } from "../../apiClient";
import { data } from "react-router-dom";

export default function School() {
  const [school, setSchool] = useState(null);
  const [departments, setDepts] = useState([]);
  const [majors, setMajors] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => { (async () => {
    try {
      const s = await api.get("/school/my"); setSchool(s.data);
      const d = await api.get(`/school/${s.data.id}/departments`); setDepts(d.data);
    } catch (e) { setMsg(e.message); }
  })(); }, []);

  async function addDept(e) {
    e.preventDefault();
    const name = e.target.dept.value.trim(); if (!name) return;
    try {
      await api.post(`/school/${school.id}/departments`, { name });
      const d = await api.get(`/school/${school.id}/departments`); setDepts(d.data);
    } catch (e) { setMsg(e.message); }
  }

  async function addMajor(e) {
    e.preventDefault();
    const departmentId = Number(e.target.departmentId.value);
    const name = e.target.major.value.trim();
    try {
      await api.post(`/school/${school.id}/majors`, { departmentId, name });
      const m = await api.get(`/school/${school.id}/majors?departmentId=${departmentId}`); setMajors(m.data);
    } catch (e) { setMsg(e.message); }
  }

  async function addTeacher(e) {
    e.preventDefault();
    const payload = { email: e.target.t_email.value, name: e.target.t_name.value, departmentId: Number(e.target.t_departmentId.value) };
    try { await api.post(`/school/${school.id}/teachers`, payload); setMsg("已创建并通过邮件发送密码"); }
    catch (e) { setMsg(e.message); }
  }

  async function addStudent(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post(`/school/${school.id}/students`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMsg("已创建学生账号并发送密码（已提取人脸特征）");
    } catch (e) { setMsg(e.message); }
  }

  if (!school) return <div>加载中...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2>学校管理员：{data.name}</h2>

      <h3>1) 添加学院</h3>
      <form onSubmit={addDept} style={{ display: "flex", gap: 8 }}>
        <input name="dept" placeholder="学院名称" />
        <button>添加学院</button>
      </form>

      <h3>2) 添加专业</h3>
      <form onSubmit={addMajor} style={{ display: "flex", gap: 8 }}>
        <select name="departmentId">{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input name="major" placeholder="专业名称" />
        <button>添加专业</button>
      </form>
      <ul>{majors.map(m => <li key={m.id}>{m.name}</li>)}</ul>

      <h3>3) 添加监考老师</h3>
      <form onSubmit={addTeacher} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <input name="t_name" placeholder="姓名" />
        <input name="t_email" placeholder="邮箱" />
        <select name="t_departmentId">{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <button>创建老师账号</button>
      </form>

      <h3>4) 添加考生（含证件照）</h3>
      <form onSubmit={addStudent} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <input name="name" placeholder="姓名" />
        <input name="email" placeholder="邮箱" />
        <select name="departmentId">{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input name="majorId" placeholder="专业ID（可选）" />
        <input type="file" name="photo" accept="image/*" />
        <button>创建学生账号</button>
      </form>

      {msg && <div style={{ marginTop: 12, color: "#555" }}>{msg}</div>}
    </div>
  );
}
