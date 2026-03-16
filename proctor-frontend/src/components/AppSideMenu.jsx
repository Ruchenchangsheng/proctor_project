import { useEffect, useMemo, useState } from "react";
import { Menu } from "antd";
import { useTranslation } from "react-i18next";
import { translateSourceText } from "../i18n/catalog";

function isPathMatch(pathname, targetPath) {
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

function collectActiveOpenKeys(groups, pathname) {
  const keys = [];
  (groups || []).forEach((group) => {
    (group.children || []).forEach((item) => {
      if (item.children?.some((child) => isPathMatch(pathname, child.path))) {
        keys.push(item.key);
      }
    });
  });
  return keys;
}

function resolveSelectedKeys(groups, pathname) {
  for (const group of groups || []) {
    for (const item of group.children || []) {
      if (item.children?.length) {
        const activeChild = item.children.find((child) => isPathMatch(pathname, child.path));
        if (activeChild) {
          return [activeChild.path];
        }
      } else if (item.path && isPathMatch(pathname, item.path)) {
        return [item.path];
      }
    }
  }
  return [];
}

export default function AppSideMenu({ groups, pathname, onNavigate }) {
  const { i18n } = useTranslation();
  const [openKeysByGroup, setOpenKeysByGroup] = useState(() => Object.fromEntries(
    (groups || []).map((group) => [group.key, collectActiveOpenKeys([group], pathname)]),
  ));

  useEffect(() => {
    setOpenKeysByGroup((prev) => {
      const next = { ...prev };
      (groups || []).forEach((group) => {
        const merged = new Set(prev[group.key] || []);
        collectActiveOpenKeys([group], pathname).forEach((key) => merged.add(key));
        next[group.key] = Array.from(merged);
      });
      return next;
    });
  }, [groups, pathname]);

  const selectedKeys = useMemo(() => resolveSelectedKeys(groups, pathname), [groups, pathname]);
  const translate = (label) => translateSourceText(label, i18n.language);

  return (
    <>
      {(groups || []).map((group) => {
        const groupOpenKeys = openKeysByGroup[group.key] || [];
        const items = (group.children || []).map((item) => {
          const itemLabel = translate(item.label);
          if (item.children?.length) {
            return {
              key: item.key,
              label: itemLabel,
              children: item.children.map((child) => ({
                key: child.path,
                label: translate(child.label),
                title: translate(child.label),
              })),
              onTitleClick: () => {
                if (!groupOpenKeys.includes(item.key)) {
                  onNavigate(item.defaultPath || item.children[0]?.path);
                }
              },
            };
          }
          return {
            key: item.path,
            label: itemLabel,
            title: itemLabel,
          };
        });

        return (
          <div key={group.key} className="app-nav-group">
            <div className="app-nav-group-title">{translate(group.label)}</div>
            <Menu
              mode="inline"
              inlineIndent={0}
              className="app-side-menu"
              selectedKeys={selectedKeys}
              openKeys={groupOpenKeys}
              items={items}
              onOpenChange={(keys) => {
                setOpenKeysByGroup((prev) => ({ ...prev, [group.key]: keys }));
              }}
              onClick={({ key }) => onNavigate(key)}
            />
          </div>
        );
      })}
    </>
  );
}
