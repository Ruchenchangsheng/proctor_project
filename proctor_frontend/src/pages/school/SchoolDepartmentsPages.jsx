import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";

export default function SchoolDepartmentsPages() {
  const { school } = useOutletContext();
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");

  async function load() {
    if (!school?.id) return;
    try {
      const r = await api.get(`/school/${school.id}/departments`);
      setList(r.data || []);
    } catch (e) { setMsg(e.message); }
  }

  useEffect(() => { load(); }, [school?.id]);

  async function addDept(e) {
    e.preventDefault();
    const name = e.target.dept.value.trim();
    if (!name) return;
    try {
      await api.post(`/school/${school.id}/departments`, { name });
      e.target.reset();
      await load();
      setMsg("学院已添加");
    } catch (e) { setMsg(e.message); }
  }

  return (
    <>
      <div className="card">
        <h3>添加学院</h3>
        <form onSubmit={addDept} className="form-row cols-3">
          <input name="dept" placeholder="学院名称" required />
          <div />
          <button>添加</button>
        </form>
        {msg && <div className="msg">{msg}</div>}
      </div>

      <div className="card">
        <h3>学院列表</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>id</th><th>学院名称</th></tr></thead>
            <tbody>
              {list.map((d, i) => <tr key={d.id}><td>{i+1}</td><td>{d.name}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
