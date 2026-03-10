import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";

export default function SchoolMajorsPages() {
  const { school } = useOutletContext();
  const [departments, setDepts] = useState([]);
  const [deptId, setDeptId] = useState(null);
  const [majors, setMajors] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!school?.id) return;
      const r = await api.get(`/school/${school.id}/departments`);
      const depts = r.data || [];
      setDepts(depts);
      const first = depts[0]?.id;
      if (first) {
        setDeptId(first);
        await loadMajors(first);
      }
    })();
  }, [school?.id]);

  async function loadMajors(did) {
    if (!did) return;
    const r = await api.get(`/school/${school.id}/majors?departmentId=${did}`);
    setMajors(r.data || []);
  }

  async function addMajor(e) {
    e.preventDefault();
    const name = e.target.major.value.trim();
    if (!deptId || !name) return;
    try {
      await api.post(`/school/${school.id}/majors`, { departmentId: Number(deptId), name });
      e.target.reset();
      await loadMajors(deptId);
      setMsg("专业已添加");
    } catch (e) { setMsg(e.message); }
  }

  return (
    <>
      <div className="card">
        <h3>添加专业</h3>
        <form onSubmit={addMajor} className="form-row cols-3">
          <select value={deptId ?? ""} onChange={e => { const v = Number(e.target.value); setDeptId(v); loadMajors(v); }} required>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input name="major" placeholder="专业名称" required />
          <button>添加</button>
        </form>
        {msg && <div className="msg">{msg}</div>}
      </div>

      <div className="card">
        <h3>专业列表</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>id</th><th>所属学院</th><th>专业名称</th></tr></thead>
            <tbody>
              {majors.map((m, i) => (
                <tr key={m.id}>
                  <td>{i+1}</td>
                  <td>{departments.find(d=>d.id===m.departmentId)?.name || "-"}</td>
                  <td>{m.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
