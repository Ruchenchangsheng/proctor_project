import { useAuthStore } from "../store/auth";
import { useState } from "react";
import { Card, Form, Input, Button, Typography, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";

const { Title } = Typography;

export default function Login() {
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const bootstrapAfterLogin = useAuthStore((s) => s.bootstrapAfterLogin);

  async function onFinish(values) {
    setErr("");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email, password: values.password })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "登录失败");

      // 保存 token -> 自举 /api/me
      setToken(data.token);
      await bootstrapAfterLogin();

      // 按角色跳转
      const me = useAuthStore.getState().me || {};
      const role = me.role;
      location.replace(
        role === "ADMIN" ? "/admin" :
        role === "SCHOOL_ADMIN" ? "/school" :
        role === "TEACHER" ? "/teacher" : "/student"
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "10vh auto", width: "100%", padding: "0 20px" }}>
      {/* 加上之前在 css 里定义的 glass-effect 类 */}
      <Card className="glass-effect" bordered={false} style={{ borderRadius: 16, padding: "20px 10px" }}>
        <Title level={2} style={{ textAlign: "center", marginBottom: 30, color: "#333" }}>
          系统登录
        </Title>
        
        {err && <Alert message={err} type="error" showIcon style={{ marginBottom: 20 }} />}

        <Form name="login" onFinish={onFinish} size="large">
          <Form.Item
            name="email"
            rules={[{ required: true, message: "请输入邮箱!" }]}
          >
            <Input prefix={<UserOutlined style={{ color: 'rgba(0,0,0,.25)' }}/>} placeholder="邮箱" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: "请输入密码!" }]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: 'rgba(0,0,0,.25)' }}/>} placeholder="密码" />
          </Form.Item>

          <Form.Item style={{ marginTop: 30, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ borderRadius: 8 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}