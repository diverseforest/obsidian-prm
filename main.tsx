import { Plugin, WorkspaceLeaf, ItemView, debounce } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { PRMMapViewComponent } from "./view";

export const VIEW_TYPE_PRM_MAP = "prm-map-view";

export default class PRMMapPlugin extends Plugin {
    async onload() {
        console.log("加载 PRM Map 插件...");

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

        // 4. 监听 Markdown 缓存改变事件，加入防抖机制避免打字卡顿
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

class PRMMapView extends ItemView {
    plugin: PRMMapPlugin;
    reactRoot: Root | null = null;

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
                <PRMMapViewComponent app={this.app} plugin={this.plugin} />
            );
        }
    }

    refreshData() {
        // 重新渲染 React 以触发内部数据重载
        this.renderReact();
    }
}
