# 新增"偏好"设置页面方案

## 背景
用户在底部导航栏"回收站"右侧新增一个"偏好"入口，用于展示基础应用设置及版本介绍信息。

## 推荐方案
采用与其他页面一致的路由页形式实现：新增页面组件、注册路由、在底部导航添加入口。设置项使用 localStorage + Zustand 持久化，版本号通过主进程 IPC 获取。

## 涉及文件

### 1. 新增页面组件
- `src/renderer/pages/Preferences.tsx`
  - 页面标题"偏好"
  - 基础设置区：
    - 启动时自动同步热点/金句（开关）
    - 启动时显示开屏动画（开关）
    - 恢复默认设置按钮
  - 版本介绍区：
    - 应用名称、版本号（通过 IPC 从主进程读取 `app.getVersion()`）、描述

### 2. 新增应用级设置 Store
- `src/renderer/store/appSettings.ts`
  - 使用 Zustand + localStorage（与 `editorSettings.ts` 一致的模式）
  - 状态字段：`autoSyncOnLaunch: boolean`、`showSplash: boolean`
  - 提供 `reset()` 恢复默认

### 3. 路由注册
- `src/renderer/App.tsx`
  - 导入 `Preferences` 页面
  - 添加 `<Route path="/preferences" ... />`

### 4. 底部导航
- `src/renderer/components/BottomNav.tsx`
  - 在 `navItems` 数组末尾（回收站之后）添加 `{ path: '/preferences', label: '偏好' }`

### 5. 主进程版本接口
- `src/main/index.ts`
  - 在 `registerIpcHandlers()` 中新增 `ipcMain.handle('app:get-version', () => app.getVersion())`

### 6. Preload 暴露
- `src/preload/index.ts`
  - 在 `api` 对象中新增 `getAppVersion: () => ipcRenderer.invoke('app:get-version')`

### 7. 样式补充
- `src/renderer/styles/global.css`
  - 新增 `.preferences-section`、`.preferences-card`、`.preference-row`、`.preference-label`、`.preference-desc`、`.version-logo` 等样式
  - 保持与现有页面卡片、按钮、开关风格一致

### 8. 开屏设置联动
- `src/renderer/App.tsx`
  - 使用 `useAppSettingsStore` 读取 `showSplash` 作为 `showSplash` state 的初始值

## 复用内容
- 页面容器：复用 `.page-container`、`.page-header`、`.page-title`
- 卡片容器：复用 `.glass-panel` 或 `.excerpt-card` 风格
- 按钮：复用 `.btn`、`.btn-secondary`、`.btn-sm`
- 设置持久化：复用 `editorSettings.ts` 的 localStorage 模式

## 验证方式
1. 运行 `npm run dev` 启动应用
2. 点击底部导航最右侧"偏好"，进入新页面
3. 确认页面显示：
   - "基础设置"区域包含自动同步、开屏动画开关
   - "版本介绍"区域显示应用名称与版本号（如 `1.0.0`）
4. 切换开关后刷新页面，确认设置持久化
5. 点击"恢复默认"，确认开关恢复初始状态
