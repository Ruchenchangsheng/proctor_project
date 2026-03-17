// StudentHome 展示学生可参加的考试列表和当前状态，是学生端的主入口。
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../apiClient";
import { Table, Card, Typography, Image, Button, Tag, message, Spin } from "antd";
import { LoginOutlined } from "@ant-design/icons";
import ChangePasswordButton from "../../components/ChangePasswordButton";
import useCatalogTranslation from "../../i18n/useCatalogTranslation";

const { Title, Text } = Typography;

// 负责把输入数据整理成当前页面更容易消费的格式。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function toTimestamp(value) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function StudentHome() {
  const { tr } = useCatalogTranslation();
  // p 保存个人画像，sessions 保存考试列表，photoUrl 则单独保存成浏览器可直接预览的 blob URL。
  const [p, setP] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    (async () => {
      try {
        // 学生首页初始化时会并行感知三类信息：个人资料、考试会话、登记照片。
        const r = await api.get("/student/profile");
        setP(r.data);
        const exams = await api.get("/student/exams");
        setSessions(exams.data || []);
        try {
          // 照片接口可能返回 204，表示当前账号没有登记照；这里把它当作正常情况处理。
          const img = await api.get("/student/photo", { responseType: "blob" });
          if (img.status !== 204) {
            const url = URL.createObjectURL(img.data);
            setPhotoUrl(url);
          }
        } catch (e) { setPhotoUrl(null); }
      } catch (e) {
        message.error(`${tr("加载数据失败:")} ${e.message}`);
      } finally { setLoading(false); }
    })();
  }, []);

  const sortedSessions = useMemo(
    // 考试列表默认按开始时间倒序，让最近要参加或刚结束的考试排在最前面。
    () => [...(sessions || [])].sort((a, b) => toTimestamp(b.startAt) - toTimestamp(a.startAt)),
    [sessions]
  );

  if (loading) return <div style={{ textAlign: 'center', marginTop: '20vh' }}><Spin size="large" tip={tr("加载中...")} /></div>;

  // 表格列配置集中描述了当前页面最核心的展示字段和每列的交互行为。
  // 如果你想理解页面允许用户做什么，优先看这里的 render、按钮和状态标签。
  // 表格列配置集中描述了当前页面最核心的展示字段和每列的交互行为。
  // 如果你想理解页面允许用户做什么，优先看这里的 render、按钮和状态标签。
  const columns = [
    { title: tr("考试名称"), dataIndex: "examName", key: "examName", render: text => <Text strong>{text}</Text> },
    { title: tr("开始时间"), dataIndex: "startAt", key: "startAt" },
    { title: tr("考场"), dataIndex: "roomId", key: "roomId", render: text => <Tag color="blue">{text || "-"}</Tag> },
    {
      title: tr("状态"),
      dataIndex: "phase",
      key: "phase",

      render: (phase) => (
        <Tag color={phase === "RUNNING" ? "green" : phase === "COMPLETED" ? "default" : "orange"}>
          {phase === "RUNNING" ? tr("进行中") : phase === "COMPLETED" ? tr("已结束") : tr("待开始")}
        </Tag>
      )
    },
    {
      title: tr("参与情况"),
      key: "participation",
      render: (_, record) => {
        const status = String(record.sessionStatus || "").toUpperCase();
        if (status === "FINISHED") return <Tag color="green">{tr("已完成考试")}</Tag>;
        return <Tag>{tr("未参加考试")}</Tag>;
      }
    },
    {
      title: tr("操作"),
      key: "action",
      render: (_, record) => (
        <Button
          type="primary"
          icon={<LoginOutlined />}
          disabled={record.phase === "COMPLETED" || record.phase === "TERMINATED" || record.sessionStatus === "FINISHED" || record.sessionStatus === "CANCELLED"}
          // 学生不能直接进入考试页，必须先经过设备授权和身份核验页。
          onClick={() => navigate(`/student/exams/${record.sessionId}/verify`)} // 修正路径
        >
          {tr("进入考试")}
        </Button>
      )
    },
  ];

  return (
    <div className="app-student-home">
      <Card className="glass-effect app-student-home-profile-card" variant={false} style={{ borderRadius: 16 }}>
        {/* 上半区展示身份信息，帮助学生确认当前登录的是哪一个账号。 */}
        <div className="app-student-home-header">
          <Title level={3} style={{ margin: 0 }}>{tr("考生主页")}</Title>
          <ChangePasswordButton buttonText="修改密码" />
        </div>
        <div className="app-student-home-profile">
          <Image
            className="app-student-home-photo"
            width={96}
            height={120}
            src={photoUrl}
            fallback={`https://via.placeholder.com/120x160?text=${encodeURIComponent(tr("无照片"))}`}
            preview={false}
            style={{ borderRadius: 12, objectFit: 'cover' }}
          />
          <div className="app-student-home-meta">
            <div className="app-student-home-meta-item">
              <div className="app-student-home-meta-label">{tr("姓名")}</div>
              <Text strong>{p?.name || "-"}</Text>
            </div>
            <div className="app-student-home-meta-item">
              <div className="app-student-home-meta-label">{tr("学校")}</div>
              <Text>{p?.schoolName || "-"}</Text>
            </div>
            <div className="app-student-home-meta-item">
              <div className="app-student-home-meta-label">{tr("学院")}</div>
              <Text>{p?.departmentName || "-"}</Text>
            </div>
            <div className="app-student-home-meta-item">
              <div className="app-student-home-meta-label">{tr("专业")}</div>
              <Text>{p?.majorName || "-"}</Text>
            </div>
          </div>
        </div>
      </Card>
      <Card className="glass-effect app-student-home-table-card" variant={false} style={{ borderRadius: 16 }}>
        {/* 下半区才是考试入口；真正进入考试前还会经过 verify / run 两个子页面。 */}
        <Table
          dataSource={sortedSessions}
          columns={columns}
          rowKey="sessionId"
          pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
          style={{ background: 'transparent' }}
        />
      </Card>
    </div>
  );
}
