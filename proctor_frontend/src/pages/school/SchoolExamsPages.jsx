import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../apiClient";

export default function SchoolExamsPages() {
  const { school } = useOutletContext();
  const schoolId = school?.id;

  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);

  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [teacherIds, setTeacherIds] = useState([]);
  const [studentIds, setStudentIds] = useState([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadPeopleAndExams() {
    if (!schoolId) return;
    setLoading(true);
    setMsg("");
    try {
      const [tRes, sRes, eRes] = await Promise.all([
        api.get(`/school/${schoolId}/teachers`),
        api.get(`/school/${schoolId}/students`),
        api.get(`/school/${schoolId}/exams`)
      ]);
      setTeachers(tRes.data || []);
      setStudents(sRes.data || []);
      setExams(eRes.data || []);
    } catch (e) {
      setMsg(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPeopleAndExams(); }, [schoolId]);

  const teacherCount = useMemo(() => teacherIds.length, [teacherIds]);
  const studentCount = useMemo(() => studentIds.length, [studentIds]);

  function parseSelectedIds(options) {
    return Array.from(options)
      .filter((o) => o.selected)
      .map((o) => Number(o.value))
      .filter((n) => Number.isFinite(n));
  }

  async function onCreateExam(e) {
    e.preventDefault();
    if (!schoolId) return;
    setMsg("");

    try {
      const payload = {
        name: name.trim(),
        roomCode: roomCode.trim(),
        startAt,
        endAt,
        teacherIds,
        studentIds
      };
      const r = await api.post(`/school/${schoolId}/exams`, payload);
      setMsg(`考试创建成功：房间 ${r.data?.roomCode || roomCode}，已分配老师 ${r.data?.teacherCount ?? teacherCount} 人、学生 ${r.data?.studentCount ?? studentCount} 人。`);

      setName("");
      setRoomCode("");
      setStartAt("");
      setEndAt("");
      setTeacherIds([]);
      setStudentIds([]);

      await loadPeopleAndExams();
    } catch (e2) {
      setMsg(e2.message || "创建考试失败");
    }
  }

  return (
    <>
      <div className="card">
        <h3>创建考试并分配房间</h3>
        <form onSubmit={onCreateExam} className="form-row cols-4">
          <input placeholder="考试名称（如：高数期中）" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="房间号（如：A-301）" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} required />
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} required />

          <div className="exam-select-group">
            <label>分配监考老师（可多选）</label>
            <select multiple value={teacherIds.map(String)} onChange={(e) => setTeacherIds(parseSelectedIds(e.target.options))} required>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{t.email}）
                </option>
              ))}
            </select>
            <div className="exam-hint">已选择 {teacherCount} 位老师</div>
          </div>

          <div className="exam-select-group">
            <label>分配学生（可多选）</label>
            <select multiple value={studentIds.map(String)} onChange={(e) => setStudentIds(parseSelectedIds(e.target.options))} required>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.email}）
                </option>
              ))}
            </select>
            <div className="exam-hint">已选择 {studentCount} 位学生</div>
          </div>

          <button disabled={loading || !teachers.length || !students.length}>创建考试</button>
        </form>
        {msg && <div className="msg">{msg}</div>}
      </div>

      <div className="card">
        <h3>考试列表</h3>
        <div className="table-wrap">
          {loading ? <div style={{ padding: 8 }}>加载中...</div> : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>考试名称</th>
                  <th>房间号</th>
                  <th>开始时间</th>
                  <th>结束时间</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((x, i) => (
                  <tr key={x.id ?? i}>
                    <td>{i + 1}</td>
                    <td>{x.name}</td>
                    <td>{x.roomCode}</td>
                    <td>{x.startAt || "-"}</td>
                    <td>{x.endAt || "-"}</td>
                    <td>{x.status || "-"}</td>
                  </tr>
                ))}
                {(!exams || exams.length === 0) && (
                  <tr><td colSpan={6} style={{ color: "#777" }}>暂无考试</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
