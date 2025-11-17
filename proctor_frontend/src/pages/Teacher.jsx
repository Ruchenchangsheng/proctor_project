import React, { useEffect, useState } from "react";
import { api } from "../apiClient";

export default function Teacher() {
  const [p, setP] = useState(null); const [msg, setMsg] = useState("");
  useEffect(() => { api.get("/teacher/profile").then(r => setP(r.data)).catch(e => setMsg(e.message)); }, []);
  if (!p) return <div>{msg || "加载中..."}</div>;
  return (
    <div style={{ padding: 20 }}>
      <h2>监考老师：{p.name}</h2>
      <div>学校：{p.schoolName}</div>
      <div>学院：{p.departmentName}</div>
    </div>
  );
}
