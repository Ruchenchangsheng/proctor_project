import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";

const DEFAULT_FORM = {
  name: "",
  departmentId: "",
  majorId: "",
  startAt: "",
  endAt: "",
  invigilatorScreenWidth: 1920,
  invigilatorScreenHeight: 1080,
  minStudentTileWidth: 320,
  minStudentTileHeight: 240,
  hardCapPerRoom: ""
};

export default function SchoolExamsPages() {
  const { school } = useOutletContext();
  const [departments, setDepartments] = useState([]);
  const [majors, setMajors] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);
  const [examList, setExamList] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [rooms, setRooms] = useState([]);

  const currentDeptId = useMemo(() => Number(form.departmentId) || null, [form.departmentId]);

  useEffect(() => {
    if (!school?.id) return;
    (async () => {
      try {
        const d = await api.get(`/school/${school.id}/departments`);
        const list = d.data || [];
        setDepartments(list);
        if (list.length) {
          const firstDeptId = String(list[0].id);
          setForm((prev) => ({ ...prev, departmentId: firstDeptId }));
          await loadMajors(firstDeptId);
        }
        await loadExams();
      } catch (e) {
        setMsg(e.message);
      }
    })();
  }, [school?.id]);

  async function loadMajors(departmentId) {
    if (!departmentId) return;
    const m = await api.get(`/school/${school.id}/majors?departmentId=${departmentId}`);
    const majorList = m.data || [];
    setMajors(majorList);
    setForm((prev) => ({
      ...prev,
      majorId: majorList.length ? String(majorList[0].id) : ""
    }));
  }

  async function loadExams() {
    if (!school?.id) return;
    setListLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/exams`);
      setExamList(r.data || []);
      setSelectedExamId("");
      setRooms([]);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setListLoading(false);
    }
  }

  async function viewRooms(examId) {
    if (!examId) return;
    setListLoading(true);
    try {
      const r = await api.get(`/school/${school.id}/exams/${examId}/rooms`);
      setSelectedExamId(String(examId));
      setRooms(r.data || []);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setListLoading(false);
    }
  }

  async function onChangeDepartment(e) {
    const nextId = e.target.value;
    setForm((prev) => ({ ...prev, departmentId: nextId }));
    try {
      await loadMajors(nextId);
    } catch (err) {
      setMsg(err.message);
    }
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.departmentId || !form.majorId) {
      setMsg("请先选择学院和专业");
      return;
    }
    setLoading(true);
    setMsg("");
    setResult(null);
    try {
      const payload = {
        name: form.name.trim(),
        departmentId: Number(form.departmentId),
        majorId: Number(form.majorId),
        startAt: form.startAt || null,
        endAt: form.endAt || null,
        invigilatorScreenWidth: Number(form.invigilatorScreenWidth),
        invigilatorScreenHeight: Number(form.invigilatorScreenHeight),
        minStudentTileWidth: Number(form.minStudentTileWidth),
        minStudentTileHeight: Number(form.minStudentTileHeight),
        hardCapPerRoom: form.hardCapPerRoom ? Number(form.hardCapPerRoom) : null
      };
      const r = await api.post(`/school/${school.id}/exams`, payload);
      setResult(r.data);
      setMsg("考试创建成功，已完成考生与监考老师自动分配");
      await loadExams();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h3>创建考试并自动分房</h3>
        <form onSubmit={onSubmit} className="form-row cols-5">
          <input name="name" value={form.name} onChange={onChange} placeholder="考试名称" required />

          <select name="departmentId" value={form.departmentId} onChange={onChangeDepartment} required>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <select name="majorId" value={form.majorId} onChange={onChange} required disabled={!majors.length}>
            {majors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <input name="startAt" type="datetime-local" value={form.startAt} onChange={onChange} />
          <input name="endAt" type="datetime-local" value={form.endAt} onChange={onChange} />

          <input name="invigilatorScreenWidth" type="number" min="1" value={form.invigilatorScreenWidth} onChange={onChange} placeholder="监考屏幕宽(px)" />
          <input name="invigilatorScreenHeight" type="number" min="1" value={form.invigilatorScreenHeight} onChange={onChange} placeholder="监考屏幕高(px)" />
          <input name="minStudentTileWidth" type="number" min="1" value={form.minStudentTileWidth} onChange={onChange} placeholder="最小学生画面宽(px)" />
          <input name="minStudentTileHeight" type="number" min="1" value={form.minStudentTileHeight} onChange={onChange} placeholder="最小学生画面高(px)" />
          <input name="hardCapPerRoom" type="number" min="1" value={form.hardCapPerRoom} onChange={onChange} placeholder="单房间硬上限(可选)" />

          <button type="submit" disabled={loading || !majors.length}>
            {loading ? "创建中..." : "创建考试"}
          </button>
        </form>
        {msg && <div className="msg">{msg}</div>}
        {currentDeptId && !majors.length && <div className="msg">当前学院暂无专业，请先创建专业</div>}
      </div>

      {result && (
        <div className="card">
          <h3>分配结果</h3>
          <div style={{ marginBottom: 10 }}>
            考试ID：{result.examId}，考试名称：{result.examName}，考生数：{result.studentCount}，
            房间数：{result.roomCount}，单房间容量：{result.roomCapacity}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>房间号</th>
                  <th>房间ID</th>
                  <th>监考老师ID</th>
                  <th>房间容量</th>
                  <th>已分配考生数</th>
                </tr>
              </thead>
              <tbody>
                {result.rooms?.map((r) => (
                  <tr key={r.examRoomId}>
                    <td>{r.roomId}</td>
                    <td>{r.examRoomId}</td>
                    <td>{r.invigilatorId}</td>
                    <td>{r.capacity}</td>
                    <td>{r.studentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>考试与考场查看</h3>
        <div className="form-row cols-3" style={{ marginBottom: 10 }}>
          <button type="button" onClick={loadExams} disabled={listLoading}>刷新考试列表</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>考试ID</th>
                <th>考试名称</th>
                <th>学院</th>
                <th>专业</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {examList.map((e) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td>{e.name}</td>
                  <td>{e.departmentName || "-"}</td>
                  <td>{e.majorName || "-"}</td>
                  <td>{e.startAt || "-"}</td>
                  <td>{e.endAt || "-"}</td>
                  <td>
                    <button type="button" onClick={() => viewRooms(e.id)} disabled={listLoading}>
                      查看考场
                    </button>
                  </td>
                </tr>
              ))}
              {(!examList || examList.length === 0) && (
                <tr><td colSpan={7} style={{ color: "#777" }}>暂无考试数据</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedExamId && (
          <>
            <h4 style={{ marginTop: 16 }}>考试 {selectedExamId} 的考场</h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>房间号</th>
                    <th>监考老师</th>
                    <th>容量</th>
                    <th>已分配人数</th>
                    <th>考生名单</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r.examRoomId}>
                      <td>{r.roomId}</td>
                      <td>{r.invigilatorName || `ID:${r.invigilatorId}`}</td>
                      <td>{r.capacity}</td>
                      <td>{r.studentCount}</td>
                      <td>
                        {(r.students || []).map((s) => s.studentName).join("、") || "-"}
                      </td>
                    </tr>
                  ))}
                  {(!rooms || rooms.length === 0) && (
                    <tr><td colSpan={5} style={{ color: "#777" }}>暂无考场数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
