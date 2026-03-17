// AppSideMenu 负责根据当前角色渲染侧边导航，帮助不同端在统一壳层中切换页面。
import { useEffect, useMemo, useState } from "react";
import { Menu } from "antd";
import { useTranslation } from "react-i18next";
import { translateSourceText } from "../i18n/catalog";

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
function isPathMatch(pathname, targetPath) {
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
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
