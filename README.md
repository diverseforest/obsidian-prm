# Obsidian PRM Map & AI Assistant (人脉地理雷达与 AI 归档助理) 🗺️🤖

`obsidian-prm` 是专为 Obsidian 人脉管理（PRM, Personal Relationship Management）系统打造的地图可视化与轻量 AI 归档入口插件。

它的稳定核心是读取 `People/` 中的 `city` 和 `location` 字段，把联系人转化为地图上的可视化标记，并提供多维过滤、差旅距离雷达、一键联系记录和离线精准坐标拾取。插件也提供轻量 AI 日记归档助理，用于快速处理少量 `Daily/` 笔记；更复杂的归档规则建议交给 Starter Vault 中的 `AI_WORKFLOW.md` 和 Agent 执行。

本插件遵循 **零配置（Zero-Configuration）** 和 **隐私优先（Privacy-First）** 原则，无需注册任何高德/百度等第三方地图 API 密钥，大模型接口完全本地配置并支持自定义 API 代理端点（支持 OpenAI、DeepSeek、Gemini 等，Bring Your Own Key），开箱即用，对社区用户极其友好。

---

## 插件在 PRM 系统中的位置

完整 PRM 系统分三层：

```text
Starter Vault / 模板库   提供目录、模板、Bases、示例和方法说明
AI_WORKFLOW.md / Agent  负责高质量归档和复杂判断
obsidian-prm 插件       负责地图核心、轻量 AI 助理和基础交互
```

插件不要求用户一定使用内置 AI。只要最终文件遵循 `People/`、`Interactions/`、`Endeavors/` 的结构，地图和筛选能力都可以正常工作。你可以用插件内轻量 AI 助理处理少量日记，也可以让 Agent 按 `AI_WORKFLOW.md` 完成更完整的归档。

## 🔒 隐私与 API Key 说明

* **API Key 不会发送给插件作者**：插件没有作者服务器、遥测或远程配置。AI 请求只会发送到您在设置中填写的 `API Base URL`。
* **日记内容会发送到模型服务商**：使用 AI 归档时，您勾选的 `Daily/` 日记正文会作为请求内容发送到配置的 API 服务。高隐私数据建议使用本地 OpenAI-compatible 模型服务。
* **本地模型接口支持空 Key**：当 `API Base URL` 是 `localhost`、`127.0.0.1` 或 `::1` 时，插件允许 API Key 留空，并且不会发送 `Authorization` 请求头。
* **远程接口建议使用 HTTPS**：如果远程 API 使用 `http://`，插件会在请求前强提示，因为 API Key 和日记内容可能以明文经过网络传输。
* **本地保存不是加密保存**：API Key 会保存在 Obsidian 插件本地配置中。请不要把 `.obsidian/plugins/obsidian-prm/data.json` 提交到 Git、公开仓库或共享给他人；本仓库 `.gitignore` 已默认忽略该文件。

---

## 🌟 核心功能特性

### 1. 📍 地理雷达与地图交互 (PRM Radar)
* **零配置本地化地理编码**：通过内置的高频中国省市经纬度离线字典，直接解析 Frontmatter 中的 `city`（支持单城市如 `郑州`，或多城市数组如 `[北京, 深圳]`），在不消耗任何网络资源的前提下实现瞬间定位。
* **手动高精度坐标拾取**：解决“知道具体地点名称但不知道具体经纬度”的痛点。无需查阅外部地图，直接点击卡片上的 **“📌 手工拾取坐标”**，然后在地图上任意位置（如郑州二七广场）点击，即可自动将精准的 `[纬度, 经度]` 写入人物 Markdown 文档的 Frontmatter 中。
* **精准标记区分**：通过高精度拾取的坐标会在地图标记上附加一层专属的光晕框（Precise Border），并在人物卡片上显示“精确坐标已设”标签。
* **差旅雷达范围搜索 (Travel Radar)**：点击地图上的任意城市或地点作为中心点，在侧边栏即可开启“差旅雷达”。支持以该中心点辐射 **10km、50km、100km、300km** 的圆圈范围，智能计算雷达圈内的人脉，方便您在出差时一网打尽周边好友和客户。
* **关系域智能着色**：根据联系人的 `primary_domain` 属性，为地图标记自动赋予不同的色彩（朋友-绿色、客户-金色、家人/亲戚-紫色、同学-蓝色）。
* **群聚人脉合并 (Cluster)**：集成 Leaflet MarkerCluster。当多个联系人重叠在同一区域时自动聚合，并在聚合图标上直观显示该区域内的**唯一联系人数量**。
* **一键维护警告与快速记事**：若联系人超过 90 天未联系，卡片将显示橙色警告 ⚠️。点击 **“✅ 记今日联系”** 按钮即可一键更新该人物的 `last_contact` 参数，地图与卡片实时重载。
* **🌓 双色主题自适应**：深度监听 Obsidian 深浅色模式。浅色模式调用 **CartoDB Voyager** 经典航海风底图，深色模式调用 **CartoDB Dark Matter** 暗黑风底图，且均为包含详细街道和地名的带标注完整版。

### 2. 🤖 轻量 AI 日记归档助理 (PRM AI Archiver)
* **轻量草拟**：适合快速处理少量 `Daily/` 日记，自动草拟新人物、人物更新、交互记录和共同事项。
* **零配置/BYOK 模型接入**：支持配置任何 OpenAI 兼容格式的 API 接口（如 OpenAI、DeepSeek、Gemini、本地 Ollama、LM Studio 等）。API Key 本地保存，AI 请求通过 Obsidian 原生 `requestUrl` 直接发送到您配置的端点。
* **基础结构提取**：
  - **新人物识别**：自动感知文本中提及的新人名（支持双链格式 `[[姓名]]` 或 `@姓名` 强识别信号），自动建议新建人脉卡片并匹配标签和居住城市。
  - **已有人脉更新**：自动检索现有库，提出对已有联系人元数据（如 `city`、`last_contact` 等）的智能更新建议。
  - **交互记录生成**：自动汇总本次碰面时间、地点、参与人、核心议题，并智能生成**交互深度评分（Entropy 0.1 - 1.0）**与评估理由。
  - **项目/共同事项识别**：自动提取提及的合作事宜、共同目标并拟新增至共同事项列表中。
  - **存疑信息归纳**：针对语意不明或待确认的内容，专门归纳在“待确认”列表中，供人工判断，避免 AI 幻觉误写。
* **直观待审核面板 (Audit Panel)**：在最终写入库之前，为您呈现美观的结构化预览。您可以自由审阅 AI 提取的新建人物、更新字段、新增交互以及存疑内容。
* **一键安全持久化**：点击“确认并一键写入系统”，系统会通过 Obsidian 的 `FileManager.processFrontMatter` API 安全地将人物更新、交互卡片批量生成到库中，并将源日记 Frontmatter 标记为 `prm_processed: true`，防止重复扫描。
* **复杂归档交给 Agent**：涉及多篇日记合并、人物别名判断、长期画像更新、共同事项持续维护时，建议使用 Starter Vault 中的 `AI_WORKFLOW.md` 配合 Agent 执行。

### 3. ⚡ 一键新手初始化 (One-Click Setup)
* **零门槛极速上手**：当您在一个全新的、空白的 Obsidian 库中开启插件时，系统会自动检测基础 PRM 结构是否完备。
* **最小结构搭建**：如果检测到环境不全，侧边栏将提供“一键初始化 PRM 工作区”引导。它会创建插件运行所需的最小 PRM 结构，不覆盖用户已有文件，也不承诺复制完整 Starter Vault。
  - `Templates/PRM-人脉模板.md`：包含详细的关系画像、家庭背景观察、后续行动及关联看板引用。
  - `Templates/PRM-交互记录模板.md`：包含面谈事实、交流深度判断与后续行动待办。
  - `Templates/PRM-共同事项模板.md`：共同项目/事项的管理模板。
  - `Templates/PRM-日记模板.md`：日记基础框架。
  - 自动创建一篇今日日记测试文本 `Daily/{today}-PRM新手测试.md`，方便您即刻开始 AI 归档的探索。
* **完整体验推荐 Starter Vault**：如果希望获得完整目录说明、Bases、示例和 Agent 归档规则，推荐直接使用 PRM Starter Vault。

### 4. 🌓 双轨侧边栏工作台 (Dual-Tab Sidebar Layout)
* **平滑无缝体验**：在右侧工作区提供 **📍 地理雷达** 与 **🤖 AI 归档助理** 两个双向选项卡。
* **精细化性能管理**：使用 CSS 精细控制 Leaflet 地图容器的显隐（`display: none`），在切换到 AI 界面时保持 Leaflet 全局对象未被销毁，避免高频切换导致 Leaflet 报错崩溃，确保了无缝丝滑的交互过程。

---

## 🛠️ 技术架构与文件组成

该插件基于 **React 18**、**Leaflet.js** 以及 **Obsidian API** 构建。代码结构清晰明了，便于后期维护与升级：

```
obsidian-prm/
├── main.tsx             # 插件入口文件（负责注册视图、生命周期、监听元数据缓存变化、大模型设置面板及防抖机制）
├── view.tsx             # 核心 UI 视图（包含 React 状态流、Leaflet 初始化、一键建库向导、AI 归档助理组件与待审核面板）
├── utils.ts             # 辅助工具包（内置中国各大城市经纬度对照字典与距离解析算法）
├── styles.css           # 插件样式表（包含精美的毛玻璃、炫彩渐变、Marker 呼吸灯、大模型审核卡片及侧边栏排版）
├── append-styles.js     # 样式合并脚本（解决 Obsidian 沙箱下 @import 拦截问题，将 Leaflet 核心 CSS 直接压入 styles.css）
├── build-css.js         # 自动化 CSS 打包脚本
├── esbuild.config.mjs   # Esbuild 编译配置文件
├── manifest.json        # Obsidian 插件元数据声明
└── package.json         # 项目依赖与编译指令
```

### ⚡ 核心实现细节与避坑指南

1. **Leaflet CSS 加载拦截**：Obsidian 在沙箱环境中会屏蔽 `@import url(...)` 这种外部样式载入。因此，我们在构建流程中设计了 `append-styles.js`，在编译时将 `leaflet.css` 的全部内容物理合并到 `styles.css` 中，确保地图控制按钮和瓦片错位问题完美解决。
2. **全局 `L` 对象污染**：Leaflet 插件（如 `leaflet.markercluster`）要求全局 `window.L` 必须存在。在 `view.tsx` 中我们通过以下方式安全注册：
   ```typescript
   const L = require("leaflet");
   (window as any).L = L;
   require("leaflet.markercluster");
   ```
3. **缓存性能防抖 (Debounce)**：由于 Obsidian 元数据变化非常频繁，我们在 `main.tsx` 中对文件修改 (`modify`) 和元数据变化 (`changed`) 事件加装了**防抖器**，防止频繁刷盘导致界面卡顿崩溃。
4. **TSX 标签/正则表达式解析**：在 React TSX 语法下，直接书写包含 `<` 或 `>` 括号字符的正则表达式字面量（例如 `/[\\/:*?"<>|]/g`）会导致解析器错乱。为此，项目中安全地使用 `new RegExp('[\\\\/:*?"<>|]', 'g')` 进行替代。
5. **Obsidian 原生网络请求**：为规避浏览器中普遍存在的跨域 (CORS) 限制，AI 请求直接通过 Obsidian 原生的高保真 `requestUrl` 请求 API 绕过跨域代理，使得本地部署大模型或任意兼容端点请求畅行无阻。

---

## 📝 数据格式规范 (Frontmatter Schema)

### 1. 人脉文档 Frontmatter (`People/`)
```yaml
---
status: 活跃              # 状态选项：活跃 / 沉寂 / 归档 / 边界
city: 郑州                # 居住地：支持字符串 "郑州" 或数组 "[北京, 上海]"
location: [34.7579, 113.6654] # 精准定位：[纬度, 经度]（手工拾取时自动写入）
relationship_domains:     # 关系圈类别
  - 客户
  - 朋友
primary_domain: 客户      # 主关系域（用于地图 Marker 颜色分类）
relationship_stage: 信任  # 关系阶段
last_contact: 2026-05-28  # 最近联系时间（格式：YYYY-MM-DD）
trust_in_me: 高           # 信任度评估
trust_in_solution: 中
life_stage: 青年
---
```

### 2. 日记文档 Frontmatter (`Daily/`)
```yaml
---
date: 2026-05-28
prm_processed: true       # AI 归档助理处理标识。若未处理则为 false，会被 AI 扫描拉取
---
```

### 3. 交互记录 Frontmatter (`Interactions/`)
```yaml
---
categories:
  - "[[Interactions]]"
date: 2026-05-28
participants: [ "张三", "李四" ]  # 参与人列表
scene_type: 面谈
entropy_avg: 0.6          # 交流深度得分 (0.1 - 1.0)
depth_reason: "谈及对方关于职业转型期方向的深度迷茫和困惑"
---
```

---

## 🚀 极速上手指南

1. **选择入口**：新用户推荐下载 PRM Starter Vault；已有 Obsidian 库用户可以直接安装本插件并使用一键部署生成最小结构。
2. **安装并启用插件**：在您的 Obsidian 库中激活 `obsidian-prm`。
3. **一键建库**：如果您的库缺失基础结构，右侧侧边栏会弹出初始化提示，点击 **“✨ 一键初始化 PRM 工作区”** 创建最小目录与模板。
4. **配置 AI 模型**：进入 Obsidian 插件设置面板，配置 API Base URL、模型名称和 API Key。云端 API 通常需要 Key；本地 `localhost` 模型服务可留空。
5. **日常日记**：在 `Daily/` 文件夹下记录碰面与对话见闻（支持用 `[[人名]]` 或 `@人名` 语法帮助识别）。
6. **选择归档方式**：少量日记可用插件内 **“🤖 AI 归档助理”**；复杂归档建议让 Agent 按 Starter Vault 的 `AI_WORKFLOW.md` 执行。
7. **地理雷达分析**：只要 `People/` 页面有 `city` 或 `location`，即可切回 **“📍 地理雷达”** 查看联系人分布、关系域颜色和差旅雷达。

---

## 🛠️ 编译与开发命令

如果您计划扩展更多个性化功能，以下是打包编译命令：

```bash
# 安装开发依赖
npm install

# 编译代码（自动进行 TS 语法检查、CSS 物理合并及 production 压缩打包）
npm run build
```

编译成功后，将在当前目录生成最新的 `main.js` 和 `styles.css`，此时在 Obsidian 插件面板中点击**重新加载（Reload）**即可见证更新。
