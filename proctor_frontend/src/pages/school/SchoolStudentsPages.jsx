import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";

export default function SchoolStudentsPages() {
  const { school } = useOutletContext();
  const [departments, setDepts] = useState([]);
  const [deptId, setDeptId] = useState(null);
  const [majors, setMajors] = useState([]);
  const [majorId, setMajorId] = useState(null);

  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadDepartments() {
    const d = await api.get(`/school/${school.id}/departments`);
    const depts = d.data || [];
    setDepts(depts);
    const first = depts[0]?.id;
    if (first) {
      setDeptId(first);
      await onChangeDeptInternal(first, true);
    }
  }

  async function onChangeDeptInternal(depId, init = false) {
    const m = await api.get(`/school/${school.id}/majors?departmentId=${depId}`);
    const ms = m.data || [];
    setMajors(ms);
    const firstMajor = ms[0]?.id || null;
    setMajorId(firstMajor);
    await loadList(depId, init ? firstMajor : majorId);
  }

  async function loadList(departmentId, mId) {
    setLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/students`, {
        params: {
          departmentId: departmentId || undefined,
          majorId: mId || undefined
        }
      });
      setList(r.data || []);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (school?.id) loadDepartments(); }, [school?.id]);

  async function onChangeDept(e) {
    const depId = Number(e.target.value);
    setDeptId(depId);
    await onChangeDeptInternal(depId);
  }

  async function onChangeMajor(e) {
    const mId = Number(e.target.value);
    setMajorId(mId);
    await loadList(deptId, mId);
  }

  async function addStudent(e) {
    e.preventDefault();
    if (!majorId) { setMsg("请先为该学院添加专业，再创建学生账号"); return; }
    const fd = new FormData(e.target); // name,email,departmentId,majorId,photo
    try {
      await api.post(`/school/${school.id}/students`, fd); // 不要手动设置 Content-Type
      e.target.reset();
      setMsg("已创建学生账号并发送初始密码（已提取人脸特征）");
      await loadList(deptId, majorId);
    } catch (e) { setMsg(e.message); }
  }

  return (
    <>
      <div className="card">
        <h3>添加考生（含证件照）</h3>
        <form onSubmit={addStudent} className="form-row cols-5">
          <input name="name" placeholder="姓名" required />
          <input name="email" placeholder="邮箱" type="email" required />
          <select name="departmentId" value={deptId ?? ""} onChange={onChangeDept} required>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select name="majorId" value={majorId ?? ""} onChange={onChangeMajor} required disabled={!majors.length}>
            {majors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="file" name="photo" accept="image/*" required />
          <button disabled={!majors.length}>创建学生账号</button>
        </form>
        {msg && <div className="msg">{msg}</div>}
      </div>

      <div className="card">
        <h3>学生列表</h3>
        <div className="form-row cols-3" style={{ marginBottom: 10 }}>
          <select value={deptId ?? ""} onChange={onChangeDept}>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={majorId ?? ""} onChange={onChangeMajor} disabled={!majors.length}>
            {majors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button type="button" onClick={() => loadList(deptId, majorId)}>刷新</button>
        </div>

        <div className="table-wrap">
          {loading ? <div style={{ padding: 8 }}>加载中...</div> : (
            <table className="table">
              <thead>
                <tr><th>id</th><th>姓名</th><th>邮箱</th><th>学院</th><th>专业</th><th>创建时间</th></tr>
              </thead>
              <tbody>
                {list.map((s, i) => (
                  <tr key={s.id ?? i}>
                    <td>{i + 1}</td>
                    <td>{s.name}</td>
                    <td>{s.email}</td>
                    <td>{s.departmentName || "-"}</td>
                    <td>{s.majorName || "-"}</td>
                    <td>{s.createdAt || "-"}</td>
                  </tr>
                ))}
                {(!list || list.length === 0) && (
                  <tr><td colSpan={6} style={{ color: "#777" }}>暂无数据</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
