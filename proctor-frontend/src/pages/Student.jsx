import { useEffect, useState } from "react";
import { api } from "../apiClient";
import { Card, Descriptions, Image, Typography, Spin, message } from "antd";

const { Title } = Typography;

export default function Student() {
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const prof = await api.get("/student/profile");
        if (cancelled) return;
        setP(prof.data);

        // 取照片
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
        if (!cancelled) message.error(e.message || "加载资料失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setPhotoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return ""; });
    };
  }, []);

  if (loading) return <div style={{ textAlign: "center", marginTop: "20vh" }}><Spin size="large" /></div>;
  if (!p) return <div style={{ textAlign: "center", marginTop: "20vh" }}>无法获取数据</div>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Card className="glass-effect" variant={false} style={{ borderRadius: 16 }}>
        <Title level={3} style={{ marginTop: 0, marginBottom: 24 }}>🎓 考生信息</Title>

        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
          {/* 左侧证件照 */}
          <div style={{ width: 140, flexShrink: 0 }}>
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt="证件照"
                style={{ width: 140, height: 180, objectFit: "cover", borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                preview={{ mask: '点击放大' }}
              />
            ) : (
              <div style={{
                width: 140, height: 180, background: "rgba(255,255,255,0.5)",
                borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px dashed #ccc"
              }}>
                <span style={{ color: "#888" }}>无证件照</span>
              </div>
            )}
          </div>

          {/* 右侧详细资料 */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <Descriptions title={p.name} column={1} size="middle" bordered style={{ background: 'rgba(255,255,255,0.4)', borderRadius: 8, overflow: 'hidden' }}>
              <Descriptions.Item label="学校">{p.schoolName || "-"}</Descriptions.Item>
              <Descriptions.Item label="学院">{p.departmentName || "-"}</Descriptions.Item>
              <Descriptions.Item label="专业">{p.majorName || "-"}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{p.email || "-"}</Descriptions.Item>
            </Descriptions>
          </div>
        </div>
      </Card>
    </div>
  );
}