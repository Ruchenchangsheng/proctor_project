// Login 页面处理用户登录、令牌写入以及登录后角色跳转。
import { useAuthStore } from "../store/auth";
import { useState } from "react";
import { Card, Form, Input, Button, Typography, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher.jsx";

const { Title } = Typography;

export default function Login() {
  const { t } = useTranslation();
  // err / loading 只服务于当前页的交互反馈；
  // 真正的登录态仍由 auth store 统一托管，避免页面刷新后丢失。
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const bootstrapAfterLogin = useAuthStore((s) => s.bootstrapAfterLogin);

  // 负责把输入数据整理成当前页面更容易消费的格式。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  function sanitize(value, removeAllWhitespace = false) {
    const raw = String(value ?? "");
    return removeAllWhitespace ? raw.replace(/\s+/g, "") : raw.trim();
  }

  // 负责处理当前页面的提交型交互，并在成功后刷新界面状态。
  // 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
  async function onFinish(values) {
    setErr("");
    setLoading(true);
    try {
      // 登录接口只返回 token，用户角色和更多上下文信息要靠 bootstrapAfterLogin 再拉一次 /api/me。
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: sanitize(values.email, true),
          password: sanitize(values.password, true),
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || t("登录失败"));

      // 保存 token -> 自举 /api/me
      setToken(data.token);
      await bootstrapAfterLogin();

      // 按角色跳转
      // 这里故意使用整页跳转而不是 navigate，确保不同角色壳层初始化时拿到的是干净页面状态。
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
    <div className="app-auth-page">

      {/* 加上之前在 css 里定义的 glass-effect 类 */}
      <Card className="glass-effect" variant={false} style={{ borderRadius: 16, padding: "20px 10px" }}>
        {/* 登录页结构比较简单：上面是标题和错误提示，下面是表单，最底部是语言切换。 */}
        <Title level={2} style={{ textAlign: "center", marginBottom: 30, color: "#333" }}>
          {t("系统登录")}
        </Title>

        {err && <Alert title={err} type="error" showIcon style={{ marginBottom: 20 }} />}

        <Form name="login" onFinish={onFinish} size="large">
          <Form.Item
            name="email"
            rules={[{ required: true, message: t("请输入邮箱!") }]}
          >
            <Input prefix={<UserOutlined style={{ color: "rgba(0,0,0,.25)" }} />} placeholder={t("邮箱")} />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t("请输入密码!") }]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />} placeholder={t("密码")} />
          </Form.Item>

          <Form.Item style={{ marginTop: 30, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ borderRadius: 8 }}>
              {t("登 录")}
            </Button>
          </Form.Item>
        </Form>

      </Card>

      <div className="app-login-toolbar" style={{ marginTop: "2%" }}>
        <LanguageSwitcher compact />
      </div>
    </div>
  );
}
