export const opaqueWhiteModalStyles = {
  content: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
  },
  header: {
    background: "transparent",
    borderBottom: "1px solid #f0f0f0",
    paddingBottom: 12,
    marginBottom: 20,
  },
  body: {
    background: "transparent",
  },
  footer: {
    background: "transparent",
    borderTop: "1px solid #f0f0f0",
    paddingTop: 14,
    marginTop: 12,
  },
};

export const opaqueWhiteModalProps = {
  rootClassName: "school-opaque-modal",
  styles: opaqueWhiteModalStyles,
};
