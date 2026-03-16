import { useEffect, useState } from "react";
import { Button, Form, Input, Modal, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { api } from "../apiClient";
import { opaqueWhiteModalProps } from "../pages/school/modalStyles";
import { useAuthStore } from "../store/auth";
import { useTranslation } from "react-i18next";
import { translateSourceText } from "../i18n/catalog";

function sanitizePassword(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

export default function ChangePasswordButton({
  buttonText,
  buttonProps = {},
  modalTitle,
  defaultOpen = false,
  hideButton = false,
  onSuccess,
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const me = useAuthStore((s) => s.me);
  const setMe = useAuthStore((s) => s.setMe);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  async function submit(values) {
    const payload = {
      oldPassword: sanitizePassword(values.oldPassword),
      newPassword: sanitizePassword(values.newPassword),
    };

    setSaving(true);
    try {
      await api.post("/account/change-password", payload);
      if (me) {
        setMe({ ...me, mustChangePassword: false });
      }
      message.success(t("密码修改成功"));
      setOpen(false);
      form.resetFields();
      onSuccess?.();
    } catch (e) {
      message.error(e.message || t("密码修改失败"));
    } finally {
      setSaving(false);
    }
  }

  const resolvedButtonText = buttonText ? translateSourceText(buttonText, i18n.language) : t("修改密码");
  const resolvedModalTitle = modalTitle ? translateSourceText(modalTitle, i18n.language) : t("修改密码");

  return (
    <>
      {!hideButton && (
        <Button icon={<LockOutlined />} onClick={() => setOpen(true)} {...buttonProps}>
          {resolvedButtonText}
        </Button>
      )}

      <Modal
        title={resolvedModalTitle}
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={t("保存")}
        cancelText={t("取消")}
        {...opaqueWhiteModalProps}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item
            name="oldPassword"
            label={t("当前密码")}
            rules={[{ required: true, message: t("请输入当前密码") }]}
          >
            <Input.Password placeholder={t("输入当前密码")} />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t("新密码")}
            rules={[
              { required: true, message: t("请输入新密码") },
              {
                validator: (_, value) => (
                  sanitizePassword(value).length >= 6
                    ? Promise.resolve()
                    : Promise.reject(new Error(t("新密码长度不能少于6位")))
                ),
              },
            ]}
          >
            <Input.Password placeholder={t("输入新密码")} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t("确认新密码")}
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: t("请再次输入新密码") },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return sanitizePassword(value) === sanitizePassword(getFieldValue("newPassword"))
                    ? Promise.resolve()
                    : Promise.reject(new Error(t("两次输入的新密码不一致")));
                },
              }),
            ]}
          >
            <Input.Password placeholder={t("再次输入新密码")} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
