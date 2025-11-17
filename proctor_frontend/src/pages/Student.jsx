import { useEffect, useState } from "react";
import { api } from "../apiClient";

export default function Student() {
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [msg, setMsg] = useState("");

useEffect(() => {
  let cancelled = false;

  (async () => {
    try {
      const prof = await api.get("/student/profile");
      if (cancelled) return;
      setP(prof.data);

      // 取照片：204/空内容时不报错，直接不显示
      try {
        const resp = await api.get("/student/photo", { responseType: "blob" });
        if (cancelled) return;
        if (resp?.data && resp.data.size > 0) {
          const url = URL.createObjectURL(resp.data);
          setPhotoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
        } else {
          setPhotoUrl("");
        }
      } catch {
        setPhotoUrl("");
      }
    } catch (e) {
      if (!cancelled) setMsg(e.message);
    }
  })();

  return () => setPhotoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return ""; });
}, []);


  if (!p) return <div style={{ padding: 20 }}>{msg || "加载中..."}</div>;

  return (
    <div style={{ padding: 20, display: "grid", gap: 12, gridTemplateColumns: "160px 1fr", alignItems: "start" }}>
      <div style={{ width: 150, height: 200, border: "1px solid #eee", borderRadius: 6, overflow: "hidden", background: "#f8f8f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {photoUrl ? (
          <img src={photoUrl} alt="证件照" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "#888" }}>无证件照</span>
        )}
      </div>

      <div>
        <h2 style={{ margin: "0 0 8px" }}>考生：{p.name}</h2>
        <div>学校：{p.schoolName}</div>
        <div>学院：{p.departmentName}</div>
        <div>专业：{p.majorName || "-"}</div>
        <div>邮箱：{p.email}</div>
      </div>
    </div>
  );
}
