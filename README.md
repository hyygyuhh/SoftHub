# 软集 SoftHub

收录 **GitHub 优质开源软件**，提供国内网盘镜像下载，解决 GitHub Releases 下载慢、需加速器的问题。

## 功能特性

- 应用商店式首页：推广横幅、精选大卡轮播、热门开源列表
- 按 **GitHub Star 数** 排序推荐与列表
- 国内网盘镜像下载（夸克、百度、迅雷、UC）
- 左侧分类导航 + 应用详情页
- 深色/浅色主题，响应式布局
- **飞书多维表格驱动内容**：改表格即可更新网站

## 项目结构

```
softhub/
├── index.html              # 首页
├── css/
│   ├── style.css           # 通用样式
│   └── store.css           # 应用商店布局
├── js/
│   ├── apps-data.js        # 本地兜底数据
│   ├── apps-data.json      # 飞书同步输出（GitHub Actions 写入）
│   └── main.js             # 主逻辑
├── scripts/
│   ├── sync-feishu.js      # 飞书 → apps-data.json（CI 用）
│   └── test-sync.js        # 本地测试同步
├── .github/workflows/
│   └── sync-feishu.yml     # 定时同步工作流
├── fields.json             # 飞书多维表格字段定义（建表参考）
└── assets/favicon.svg
```

## 数据流

```
飞书多维表格（维护应用与镜像链接）
        ↓  GitHub Actions 定时同步（每天 08:00 / 20:00 北京时间）
  js/apps-data.json
        ↓  前端 fetch 加载
  GitHub Pages 展示
```

前端优先加载 `js/apps-data.json`；失败时回退到 `js/apps-data.js`。

---

## 飞书多维表格结构

**表格地址**：https://tcnqaj820g6y.feishu.cn/base/GJvibLPwIakU71s2cyIcjX3Jnxf

建表时可参考根目录 [`fields.json`](fields.json) 批量创建字段。建议按下列顺序排列列，便于运营维护。

### 字段一览

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| 应用ID | 文本 | ✓ | 英文唯一标识，如 `vscode`（用于 `#app/vscode` 链接） |
| 应用名称 | 文本 | ✓ | 前台显示名称 |
| 平台 | 单选 | ✓ | `windows` 或 `android` |
| 分类 | 单选 | ✓ | `office` / `development` / `design` / `entertainment` / `system` / `network` / `security` |
| 分类名称 | 文本 | ✓ | 中文分类，如「开发工具」 |
| 描述 | 文本 | ✓ | 一句话简介 |
| GitHub仓库 | 文本 | | 原始仓库 URL，如 `https://github.com/microsoft/vscode` |
| GitHub Star数 | 数字 | | **可留空**；同步时从 GitHub API 自动拉取；API 失败时使用表中手动值 |
| 图标SVG | 文本 | ✓ | SVG 图标代码 |
| 大小 | 文本 | ✓ | 如 `85MB` |
| 版本 | 文本 | ✓ | 如 `1.92.0` |
| 更新日期 | 日期 | ✓ | 镜像或 Release 更新日期 |
| 特性列表 | 文本 | | 详情页亮点，**每行一条**（换行分隔） |
| 下载源JSON | 文本 | ✓ | 国内网盘镜像，JSON 数组（见下方） |
| 热度 | 数字 | | 可选，旧版排序字段；**已被 GitHub Star数 取代，可不填** |

### 分类（分类 字段）对照

| 值 | 侧边栏 | 典型场景 |
|----|--------|----------|
| office | 办公 | 笔记、Office、效率工具 |
| development | 开发 | 编辑器、CLI、开发环境 |
| design | 创作 | 设计、剪辑、绘图 |
| entertainment | 影音 | 播放器、流媒体 |
| system | 系统 | 压缩、清理、系统工具 |
| network | 网络 | 浏览器、下载、通讯 |
| security | 安全 | VPN、杀毒、加密 |

### 下载源JSON 格式

从 GitHub Releases 下载安装包后上传至网盘，填入镜像链接：

```json
[
  {"name":"夸克网盘","code":"提取码","url":"https://pan.quark.cn/s/xxx","type":"quark"},
  {"name":"百度网盘","code":"提取码","url":"https://pan.baidu.com/s/xxx","type":"baidu"},
  {"name":"迅雷网盘","code":"提取码","url":"https://pan.xunlei.com/s/xxx","type":"thunder"},
  {"name":"UC网盘","code":"提取码","url":"https://pan.uc.cn/s/xxx","type":"uc"}
]
```

- `type` 固定为：`quark` / `baidu` / `thunder` / `uc`
- 无提取码时 `code` 留空字符串 `""`
- 前台仅在**下载弹窗**中展示，详情页不列出网盘源

### 填写示例（VS Code）

| 字段 | 示例值 |
|------|--------|
| 应用ID | `vscode` |
| 应用名称 | `Visual Studio Code` |
| 平台 | `windows` |
| 分类 | `development` |
| 分类名称 | `开发工具` |
| 描述 | `微软出品的免费、开源、跨平台源代码编辑器` |
| GitHub仓库 | `https://github.com/microsoft/vscode` |
| GitHub Star数 | `164523` |
| 大小 | `85MB` |
| 版本 | `1.92.0` |
| 特性列表 | `智能代码补全`<br>`Git 集成`<br>`扩展丰富` |
| 下载源JSON | 见上方 JSON 模板 |

同步后 JSON 字段映射：

| 飞书字段 | 前端字段 |
|----------|----------|
| 应用ID | `id` |
| GitHub仓库 | `githubUrl` |
| GitHub Star数 | `githubStars`（**自动**：同步时调用 GitHub API 覆盖） |
| 特性列表 | `features[]` |
| 下载源JSON | `downloadSources[]` |

### 自动获取 GitHub Star 数

每次运行 `scripts/sync-feishu.js`（含 GitHub Actions 定时同步）时：

1. 读取每条记录的 **GitHub仓库** 地址
2. 调用 [GitHub REST API](https://docs.github.com/en/rest/repos/repos) 获取 `stargazers_count`
3. 写入 `apps-data.json` 的 `githubStars`，用于首页推荐排序

- **GitHub Actions**：已自动注入 `GITHUB_TOKEN`，无需额外配置
- **本地同步**：建议设置环境变量以提高限额  
  `set GITHUB_TOKEN=ghp_xxx`（Windows）或 `export GITHUB_TOKEN=ghp_xxx`（macOS/Linux）
- 无 Token 时约 60 次/小时；应用较多时可能触发限流，失败则回退飞书表中的手动 Star 数
- 同一仓库 URL 只请求一次（去重缓存）

---

## 添加/修改应用

### 方式一：飞书表格（推荐）

1. 在表格中新增或编辑一行
2. 填写 **GitHub仓库** URL（Star 数会在同步时自动获取）
3. 上传 Release 安装包到网盘，填写「下载源JSON」
4. 等待定时同步，或手动触发 GitHub Actions：**Sync Feishu Base → Run workflow**

### 方式二：本地文件（开发用）

编辑 `js/apps-data.js` 中 `APPS_DATA`：

```javascript
{
    id: 'vscode',
    name: 'Visual Studio Code',
    platform: 'windows',
    category: 'development',
    categoryName: '开发工具',
    description: '微软出品的免费、开源、跨平台源代码编辑器',
    githubUrl: 'https://github.com/microsoft/vscode',
    githubStars: 164523,
    icon: '<svg viewBox="0 0 24 24">...</svg>',
    size: '85MB',
    version: '1.92.0',
    updatedDate: '2024-08-10',
    popularity: 98,          // 可选，兼容字段
    features: ['智能代码补全', 'Git 集成'],
    downloadSources: [
        { name: '夸克网盘', code: 'xxx', url: 'https://...', type: 'quark' }
    ]
}
```

---

## 本地预览

```bash
npx http-server -p 8000 -c-1
```

浏览器访问 http://localhost:8000

---

## 飞书同步配置（一次性）

### 1. 创建飞书自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 记录 **App ID**、**App Secret**

### 2. 开启权限

- `bitable:app:readonly` — 读取多维表格

### 3. 添加协作者

打开多维表格 → 添加应用机器人为协作者（可查看）。

### 4. GitHub Secrets / Variables

| 类型 | Name | Value |
|------|------|-------|
| Secret | `FEISHU_APP_ID` | App ID |
| Secret | `FEISHU_APP_SECRET` | App Secret |
| Variable | `FEISHU_BASE_TOKEN` | `GJvibLPwIakU71s2cyIcjX3Jnxf` |
| Variable | `FEISHU_TABLE_ID` | `tbldnqzm1EfXA4zI` |

### 5. 测试同步

Actions → **Sync Feishu Base** → **Run workflow**

---

## 部署到 GitHub Pages

Settings → Pages → Source 选 `main` 分支 `/root`，推送代码后自动部署。

---

## 注意事项

- 本站仅提供应用信息与镜像链接，版权归原作者所有
- GitHub Star 数由同步脚本自动更新，无需手填；仅需维护 **GitHub仓库** 地址
- 非 GitHub 开源软件可将 Star 填 `0`，不会出现在热门推荐前列
