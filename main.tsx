import { Plugin, WorkspaceLeaf, ItemView, PluginSettingTab, App, Setting, debounce } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { PRMMapViewComponent } from "./view";

export const VIEW_TYPE_PRM_MAP = "prm-map-view";

// ============================================================
// Settings Interface & Defaults
// ============================================================

export interface PRMMapPluginSettings {
    apiKey: string;
    apiBaseUrl: string;
    model: string;
    promptTemplate: string;
}

const DEFAULT_PROMPT_TEMPLATE = `你是一个人脉关系管理 (PRM) 日记归档助手。请分析以下日记内容，按照规则提取出结构化的归档方案。

## 处理原则
- 日记是原始材料，默认不删除、不重写。
- 只把有价值的信息提取到结构化笔记里。
- 不确定的信息列为"待确认"。
- 人物属性要少，正文承载细节。
- 交互深度分只属于一次交互，不属于人物。

## 人名解析规则
- [[姓名]] 是最强人物识别信号。
- @姓名 是强人物提及信号。
- 如果人名无法确认，列为"待确认人物"。

## 交互深度评分 (entropy)
- 0.1-0.2: 寒暄、礼貌性联系
- 0.3-0.4: 有具体信息，停留在事实层
- 0.5-0.6: 出现对方状态、情绪、需求
- 0.7-0.8: 进入动机、困境、价值观
- 0.9-1.0: 关系突破、重大转折

## 输出要求
请严格以 JSON 格式输出归档方案，不要输出任何 JSON 以外的内容。格式如下：
\`\`\`json
{
  "newPeople": [
    {
      "name": "姓名",
      "status": "活跃",
      "city": "城市",
      "primary_domain": "朋友",
      "relationship_domains": ["朋友"],
      "reason": "为什么要新建这个人物"
    }
  ],
  "updatePeople": [
    {
      "name": "已有人物姓名",
      "updates": { "字段名": "新值" },
      "bodyAppend": "需要追加到人物页正文的内容（可选）",
      "reason": "为什么要更新"
    }
  ],
  "newInteractions": [
    {
      "title": "交互标题",
      "date": "YYYY-MM-DD",
      "participants": ["姓名1", "姓名2"],
      "summary": "交互摘要",
      "entropy": 0.5,
      "depth_reason": "深度评分理由",
      "scene_type": "面谈"
    }
  ],
  "newEndeavors": [
    {
      "title": "共同事项标题",
      "participants": ["姓名1"],
      "description": "事项描述",
      "status": "活跃"
    }
  ],
  "uncertain": [
    {
      "content": "待确认的内容描述",
      "reason": "为什么无法确认"
    }
  ],
  "skipped": ["跳过的内容说明"]
}
\`\`\``;

const DEFAULT_SETTINGS: PRMMapPluginSettings = {
    apiKey: "",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

// ============================================================
// Plugin Main Class
// ============================================================

export default class PRMMapPlugin extends Plugin {
    settings: PRMMapPluginSettings = DEFAULT_SETTINGS;

    async onload() {
        console.log("加载 PRM Map 插件...");

        // 加载设置
        await this.loadSettings();

        // 1. 注册自定义地图视图
        this.registerView(
            VIEW_TYPE_PRM_MAP,
            (leaf) => new PRMMapView(leaf, this)
        );

        // 2. 添加左侧功能栏（Ribbon）图标
        this.addRibbonIcon("map-pin", "PRM 人脉地图", (evt: MouseEvent) => {
            this.activateView();
        });

        // 3. 添加命令面板指令
        this.addCommand({
            id: "open-prm-map",
            name: "打开 PRM 人脉地图",
            callback: () => {
                this.activateView();
            },
        });

        // 4. 注册设置选项卡
        this.addSettingTab(new PRMMapSettingTab(this.app, this));

        // 5. 监听 Markdown 缓存改变事件，加入防抖机制避免打字卡顿
        const debouncedRefresh = debounce(() => {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_PRM_MAP).forEach((leaf) => {
                if (leaf.view instanceof PRMMapView) {
                    leaf.view.refreshData();
                }
            });
        }, 500, true);

        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                if (file.path.startsWith("People/")) {
                    debouncedRefresh();
                }
            })
        );
    }

    onunload() {
        console.log("卸载 PRM Map 插件。");
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_PRM_MAP);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_PRM_MAP);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // 在主编辑区中打开一个新 Leaf/Tab
            leaf = workspace.getLeaf(true);
            await leaf.setViewState({
                type: VIEW_TYPE_PRM_MAP,
                active: true,
            });
        }
        
        workspace.revealLeaf(leaf);
    }
}

// ============================================================
// View Class
// ============================================================

class PRMMapView extends ItemView {
    plugin: PRMMapPlugin;
    reactRoot: Root | null = null;
    refreshKey = 0;

    constructor(leaf: WorkspaceLeaf, plugin: PRMMapPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_PRM_MAP;
    }

    getDisplayText(): string {
        return "PRM 人脉地图";
    }

    getIcon(): string {
        return "map-pin";
    }

    async onOpen() {
        console.log("打开 PRM Map 视图...");
        
        const container = this.contentEl;
        container.empty();
        container.addClass("prm-map-view-container");

        // 使用 React 18 createRoot 初始化视图
        this.reactRoot = createRoot(container);
        this.renderReact();
    }

    async onClose() {
        console.log("关闭 PRM Map 视图...");
        if (this.reactRoot) {
            this.reactRoot.unmount();
            this.reactRoot = null;
        }
    }

    renderReact() {
        if (this.reactRoot) {
            this.reactRoot.render(
                <PRMMapViewComponent app={this.app} plugin={this.plugin} refreshKey={this.refreshKey} />
            );
        }
    }

    refreshData() {
        // 递增 key，让 React 组件内的数据加载 effect 明确重跑。
        this.refreshKey += 1;
        this.renderReact();
    }
}

// ============================================================
// Settings Tab
// ============================================================

class PRMMapSettingTab extends PluginSettingTab {
    plugin: PRMMapPlugin;

    constructor(app: App, plugin: PRMMapPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "PRM 人脉地图 & AI 归档助理 设置" });

        // ---- AI 大模型配置区 ----
        containerEl.createEl("h3", { text: "🤖 AI 大模型配置" });
        containerEl.createEl("p", {
            text: "隐私提示：AI 归档会把您勾选的日记内容发送到下方 API Base URL。插件不会把 API Key 发送给作者服务器；高隐私内容建议使用 localhost 本地模型服务。",
            cls: "setting-item-description"
        });

        new Setting(containerEl)
            .setName("API Base URL")
            .setDesc("OpenAI 兼容接口地址。本地模型可填 http://localhost:1234/v1 或 http://127.0.0.1:11434/v1；远程地址建议使用 HTTPS。")
            .addText(text => text
                .setPlaceholder("https://api.openai.com/v1")
                .setValue(this.plugin.settings.apiBaseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiBaseUrl = value.trim();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("您的大模型 API 密钥，保存在本地插件数据中。本地 localhost 模型服务通常可留空。")
            .addText(text => {
                text.setPlaceholder("sk-...")
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.apiKey = value.trim();
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = "password";
            });

        new Setting(containerEl)
            .setName("清除 API Key")
            .setDesc("立即从本地插件配置中移除已保存的 API Key。")
            .addButton(button => button
                .setButtonText("清除")
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.apiKey = "";
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        new Setting(containerEl)
            .setName("模型名称")
            .setDesc("使用的模型（如 gpt-4o、deepseek-chat、gemini-pro 等）")
            .addText(text => text
                .setPlaceholder("gpt-4o")
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value.trim();
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("系统指令 Prompt 模板")
            .setDesc("AI 归档时使用的 System Prompt（已内置默认模板，可自定义）")
            .addTextArea(text => {
                text.setPlaceholder("输入自定义系统指令...")
                    .setValue(this.plugin.settings.promptTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.promptTemplate = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 12;
                text.inputEl.cols = 60;
                text.inputEl.style.width = "100%";
                text.inputEl.style.fontFamily = "monospace";
                text.inputEl.style.fontSize = "12px";
            });

        // ---- 重置按钮 ----
        new Setting(containerEl)
            .setName("重置 Prompt 模板")
            .setDesc("将系统指令恢复为内置默认模板")
            .addButton(button => button
                .setButtonText("恢复默认")
                .onClick(async () => {
                    this.plugin.settings.promptTemplate = DEFAULT_PROMPT_TEMPLATE;
                    await this.plugin.saveSettings();
                    this.display(); // 刷新界面
                })
            );
    }
}
