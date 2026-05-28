# Obsidian PRM Map (人脉地理雷达地图插件) 🗺️

`obsidian-prm-map` 是专为 Obsidian 人脉管理（PRM, Personal Relationship Management）系统打造的地理可视化与决策辅助插件。它能将您记录在 Markdown 文档中的联系人自动转化为地图上的可视化标记，并提供多维数据过滤、差旅距离雷达、一键联系记录以及完全离线的精准坐标拾取功能。

本插件遵循 **零配置（Zero-Configuration）** 和 **隐私优先（Offline-First）** 原则，无需注册任何高德/百度等第三方地图 API 密钥，开箱即用，对社区用户极其友好。

---

## 🌟 核心功能特性

### 1. 🌐 零配置本地化地理编码 (Geocoding)
* **省市级自动定位**：通过内置的高频中国省市经纬度离线字典，直接解析 Frontmatter 中的 `city`（支持单城市如 `郑州`，或多城市数组如 `[北京, 深圳]`），在不消耗任何网络资源的前提下实现瞬间定位。
* **高精度标记**：提供闪烁呼吸灯效果，并在标记上方悬浮提示姓名与所在城市。

### 2. 📌 手动高精度坐标拾取 (Manual Geocoding Fallback)
* **可视化精准微调**：解决“知道具体地点名称但不知道具体经纬度”的痛点。无需查阅外部地图，直接点击卡片上的 **“📌 手工拾取坐标”**，然后在地图上任意位置（如郑州二七广场）点击，即可自动将精准的 `[纬度, 经度]` 写入人物 Markdown 文档的 Frontmatter 中。
* **精准标记区分**：通过高精度拾取的坐标会在地图标记上附加一层专属的光晕框（Precise Border），并在人物卡片上显示“精确坐标已设”标签。

### 3. ✈️ 差旅雷达范围搜索 (Travel Radar & Radius Search)
* **智能商旅规划**：点击地图上的任意城市或地点作为中心点，在侧边栏即可开启“差旅雷达”。
* **多档距离辐射**：支持以该中心点辐射 **10km、50km、100km、300km** 的圆圈范围。插件会智能计算所有联系人（无论是城市中心还是手动精确拾取的坐标）与中心点的距离，过滤出雷达圈内的人脉，方便您在出差时一网打尽周边好友和客户。

### 4. 📊 关系域智能着色 (Domain-Based Visual Theme)
* **多维色彩归类**：根据联系人的 `primary_domain` 或首个 `relationship_domains` 属性，为地图标记自动赋予不同的色彩（例如：朋友-绿色、客户/潜在客户-金色、亲戚/家人-紫色、同学-蓝色），使人脉分布的结构类型一目了然。
* **群聚人脉合并 (Cluster)**：集成 Leaflet MarkerCluster。当多个联系人重叠在同一区域时自动聚合，并在聚合图标上直观显示该区域内的**唯一联系人数量**。

### 5. 📅 一键维护警告与快速记事 (Quick Contact Logger)
* **超期联系警示**：如果联系人超过 90 天未联系，卡片将显示橙色警告状态并带有 ⚠️ 标识。
* **快捷一键登记**：卡片提供 **“✅ 记今日联系”** 按钮，点击即可静默且快速地将该人物 Markdown 文档的 `last_contact` 前置参数更新为当天日期，地图和卡片会自动热重载。

### 6. 🌓 双色主题自适应 (Theme Adaptive Tile Layer)
* **无缝视觉过渡**：深度接入 Obsidian 官方主题系统，自动监听软件的深色（Dark）/ 浅色（Light）模式切换。
* **CartoDB 优质底图**：
  - ☀️ 浅色模式下调用 **CartoDB Voyager** 经典航海风底图。
  - 🌙 深色模式下调用 **CartoDB Dark Matter** 暗黑风底图。
  - **带标注完整版**：已切换为包含详细地名、街道、交通枢纽的完整版，便于无缝缩放导航。

---

## 🛠️ 技术架构与文件组成

该插件基于 **React 18**、**Leaflet.js** 以及 **Obsidian API** 构建。代码结构清晰明了，便于后期维护与升级：

```
obsidian-prm-map/
├── main.tsx             # 插件入口文件（负责注册视图、生命周期、监听元数据缓存变化及防抖机制）
├── view.tsx             # 核心 UI 视图（包含 React 状态流、Leaflet 初始化、侧边栏、过滤器与拾取逻辑）
├── utils.ts             # 辅助工具包（内置中国各大城市经纬度对照字典与距离解析算法）
├── styles.css           # 插件样式表（包含精美的毛玻璃、炫彩渐变、Marker 呼吸灯及侧边栏排版）
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

---

## 📝 人脉文档元数据格式 (Frontmatter Schema)

插件通过读取您 `People/` 文件夹下人物 Markdown 文档的 **Frontmatter YAML** 自动进行渲染。以下是标准字段规范：

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

---

## 🚀 后期升级与维护指南

如果您或未来其他开发者计划对插件进行升级，以下是建议的扩展方向：

1. **地图底图自由切换**：可以在 `main.tsx` 和设置面板中加入底图源选项（如天地图、超图、高德图），方便用户自定义样式。
2. **多点商旅路线规划**：利用 Leaflet.Routing.Machine 扩展，用户选中多名同一片区联系人后，自动规划最佳拜访路线。
3. **活动/记事关联过滤**：关联 PRM 中的活动笔记（Events），在地图上不仅展示人的分布，还能过滤“最近 30 天举办过活动的区域”。

### 🛠️ 编译与开发命令
在修改源代码（如 `view.tsx`、`main.tsx`、`utils.ts`）后，请在项目根目录下执行以下指令进行打包编译：

```bash
# 安装开发依赖
npm install

# 编译代码（自动进行 TS 语法检查、CSS 物理合并及 production 压缩打包）
npm run build
```
编译成功后，将在当前目录生成最新的 `main.js` 和 `styles.css`，此时在 Obsidian 插件面板中点击**重新加载（Reload）**即可见证更新。
