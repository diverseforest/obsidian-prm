import { App, TFile, TFolder, requestUrl, Notice } from "obsidian";
import * as React from "react";
import { resolveCoordinates } from "./utils";
import PRMMapPlugin from "./main";

// 修复 Leaflet 插件找不到全局 L 的问题
const L = require("leaflet");
(window as any).L = L;
require("leaflet.markercluster");

interface PRMMapViewComponentProps {
    app: App;
    plugin: PRMMapPlugin;
}

interface PersonData {
    name: string;
    path: string;
    cityList: string[];
    preciseLocation: [number, number] | null;
    status: string;
    relationshipDomains: string[];
    primaryDomain: string;
    relationshipStage: string;
    lastContact: string;
    trustInMe: string;
    trustInSolution: string;
    lifeStage: string;
}

// 错误边界组件，用于捕获 React 崩溃
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', color: 'red' }}>
                    <h2>视图加载崩溃！</h2>
                    <pre>{this.state.error?.toString()}</pre>
                    <pre>{this.state.error?.stack}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

const PRMMapApp: React.FC<PRMMapViewComponentProps> = ({ app, plugin }) => {
    const [allPeople, setAllPeople] = React.useState<PersonData[]>([]);
    const [filteredPeople, setFilteredPeople] = React.useState<PersonData[]>([]);
    const [selectedLocation, setSelectedLocation] = React.useState<string | null>(null);
    const [selectedPeople, setSelectedPeople] = React.useState<PersonData[]>([]);

    // 拾取坐标状态
    const [pickingFor, setPickingFor] = React.useState<PersonData | null>(null);

    // 过滤器状态
    const [filterStatus, setFilterStatus] = React.useState<string>("全部");
    const [filterDomain, setFilterDomain] = React.useState<string>("全部");
    const [filterContactWarning, setFilterContactWarning] = React.useState<string>("全部");
    const [filterRadius, setFilterRadius] = React.useState<number>(0);

    const [activeTab, setActiveTab] = React.useState<"radar" | "ai">("radar");
    const [isInitialized, setIsInitialized] = React.useState(true);

    React.useEffect(() => {
        const checkFolders = () => {
            const folders = ["People", "Interactions", "Endeavors", "Daily", "Templates"];
            let allExist = true;
            for (const f of folders) {
                if (!(app.vault.getAbstractFileByPath(f) instanceof TFolder)) {
                    allExist = false;
                }
            }
            setIsInitialized(allExist);
        };
        checkFolders();
    }, [app]);

    // 地图引用
    const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
    const mapRef = React.useRef<L.Map | null>(null);
    const markerClusterGroupRef = React.useRef<any>(null);
    const tileLayerRef = React.useRef<L.TileLayer | null>(null);

    // 1. 读取人物数据
    const loadPeopleData = React.useCallback(() => {
        const files = app.vault.getMarkdownFiles();
        const peopleFiles = files.filter(f => f.path.startsWith("People/") && !f.name.includes("Template"));
        
        const peopleList: PersonData[] = [];
        
        peopleFiles.forEach(file => {
            const cache = app.metadataCache.getFileCache(file);
            if (!cache || !cache.frontmatter) return;
            
            const fm = cache.frontmatter;
            
            // 解析城市
            let cityList: string[] = [];
            if (fm.city) {
                if (Array.isArray(fm.city)) {
                    cityList = fm.city.map(c => String(c).trim());
                } else {
                    cityList = [String(fm.city).trim()];
                }
            }

            // 解析精确坐标
            let preciseLocation: [number, number] | null = null;
            if (fm.location && Array.isArray(fm.location) && fm.location.length === 2) {
                preciseLocation = [Number(fm.location[0]), Number(fm.location[1])];
            }
            
            // 关系域
            let relationshipDomains: string[] = [];
            if (fm.relationship_domains) {
                if (Array.isArray(fm.relationship_domains)) {
                    relationshipDomains = fm.relationship_domains.map(d => String(d).trim());
                } else {
                    relationshipDomains = [String(fm.relationship_domains).trim()];
                }
            }

            peopleList.push({
                name: file.basename,
                path: file.path,
                cityList: cityList,
                preciseLocation: preciseLocation,
                status: fm.status || "活跃",
                relationshipDomains: relationshipDomains,
                primaryDomain: fm.primary_domain || "",
                relationshipStage: fm.relationship_stage || "",
                lastContact: fm.last_contact || "未记录",
                trustInMe: fm.trust_in_me || "未知",
                trustInSolution: fm.trust_in_solution || "未知",
                lifeStage: fm.life_stage || "未知"
            });
        });
        
        setAllPeople(peopleList);
    }, [app]);

    React.useEffect(() => {
        loadPeopleData();
    }, [loadPeopleData]);

    // 2. 多维属性过滤逻辑
    React.useEffect(() => {
        let result = allPeople;

        if (filterStatus !== "全部") result = result.filter(p => p.status === filterStatus);
        if (filterDomain !== "全部") result = result.filter(p => p.relationshipDomains.includes(filterDomain));
        
        if (filterContactWarning !== "全部") {
            const now = new Date();
            result = result.filter(p => {
                if (!p.lastContact || p.lastContact === "未记录") return filterContactWarning === "超3个月未联系";
                const contactDate = new Date(p.lastContact);
                const diffTime = Math.abs(now.getTime() - contactDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (filterContactWarning === "超1个月未联系") return diffDays > 30;
                else if (filterContactWarning === "超3个月未联系") return diffDays > 90;
                return true;
            });
        }

        setFilteredPeople(result);
    }, [allPeople, filterStatus, filterDomain, filterContactWarning]);

    // 更新侧边栏人员（引入差旅雷达距离计算）
    React.useEffect(() => {
        if (!selectedLocation) {
            setSelectedPeople([]);
            return;
        }

        const centerCoords = resolveCoordinates(selectedLocation);
        
        const peopleInRadius = filteredPeople.filter(p => {
            if (filterRadius === 0) {
                return p.cityList.includes(selectedLocation);
            }
            
            if (centerCoords) {
                const centerLatLng = L.latLng(centerCoords[0], centerCoords[1]);
                return p.cityList.some(c => {
                    const coords = p.preciseLocation || resolveCoordinates(c);
                    if (!coords) return false;
                    const dist = centerLatLng.distanceTo(L.latLng(coords[0], coords[1]));
                    return dist <= filterRadius * 1000;
                });
            }
            return false;
        });
        
        setSelectedPeople(peopleInRadius);
    }, [selectedLocation, filterRadius, filteredPeople]);

    // 3. 初始化地图
    React.useEffect(() => {
        if (!mapContainerRef.current) return;
        const isDark = document.body.classList.contains("theme-dark");

        if (!mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, {
                center: [34.7579, 113.6654], 
                zoom: 5,
                zoomControl: false 
            });

            L.control.zoom({ position: "topright" }).addTo(mapRef.current);
            
            setTimeout(() => { mapRef.current?.invalidateSize(); }, 100);
            
            const resizeObserver = new ResizeObserver(() => {
                mapRef.current?.invalidateSize();
            });
            resizeObserver.observe(mapContainerRef.current);
        }

        const map = mapRef.current;
        if (!map) return;

        const lightTileUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
        const darkTileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
        const tileUrl = isDark ? darkTileUrl : lightTileUrl;

        if (tileLayerRef.current) {
            map.removeLayer(tileLayerRef.current);
        }
        tileLayerRef.current = L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://carto.com/">CartoDB</a>',
            maxZoom: 18
        }).addTo(map);

        if (markerClusterGroupRef.current) {
            map.removeLayer(markerClusterGroupRef.current);
        }

        // @ts-ignore
        markerClusterGroupRef.current = L.markerClusterGroup({
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            iconCreateFunction: (cluster: any) => {
                const childMarkers = cluster.getAllChildMarkers();
                const uniqueNames = new Set<string>();
                childMarkers.forEach((m: any) => {
                    if (m.options.personName) uniqueNames.add(m.options.personName);
                });
                
                const uniqueCount = uniqueNames.size;
                let sizeClass = "prm-cluster-small";
                if (uniqueCount > 5) sizeClass = "prm-cluster-medium";
                if (uniqueCount > 15) sizeClass = "prm-cluster-large";

                return L.divIcon({
                    html: `<div><span>${uniqueCount}</span></div>`,
                    className: `prm-cluster-marker ${sizeClass}`,
                    iconSize: L.point(40, 40)
                });
            }
        });

        const markerClusterGroup = markerClusterGroupRef.current;
        const createdMarkers: L.Marker[] = [];

        filteredPeople.forEach(person => {
            person.cityList.forEach(cityName => {
                const coords = person.preciseLocation || resolveCoordinates(cityName);
                if (coords) {
                    // 关系域智能着色
                    let colorClass = "prm-marker-default";
                    const domain = person.primaryDomain || (person.relationshipDomains.length > 0 ? person.relationshipDomains[0] : "");
                    if (domain) {
                        if (domain.includes("朋友")) colorClass = "prm-marker-green";
                        else if (domain.includes("客户")) colorClass = "prm-marker-gold";
                        else if (domain.includes("亲戚") || domain.includes("家人")) colorClass = "prm-marker-purple";
                        else if (domain.includes("同学")) colorClass = "prm-marker-blue";
                    }

                    const isPrecise = !!person.preciseLocation;
                    const glowIcon = L.divIcon({
                        html: `<div class="prm-map-marker-glow ${colorClass} ${isPrecise ? 'prm-marker-precise' : ''}" title="${person.name} (${cityName}${isPrecise ? ' - 精确' : ''})"></div>`,
                        className: "prm-custom-marker-container",
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });

                    const marker = L.marker(coords, {
                        icon: glowIcon,
                        title: `${person.name} (${cityName})`,
                        personName: person.name, 
                        cityName: cityName
                    } as any);

                    marker.on("click", () => {
                        setSelectedLocation(cityName);
                    });

                    createdMarkers.push(marker);
                    markerClusterGroup.addLayer(marker);
                }
            });
        });

        map.addLayer(markerClusterGroup);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    const darkNow = document.body.classList.contains("theme-dark");
                    const newUrl = darkNow ? darkTileUrl : lightTileUrl;
                    if (tileLayerRef.current) tileLayerRef.current.setUrl(newUrl);
                }
            });
        });
        
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();

    }, [filteredPeople]);

    // 4. 手动坐标拾取交互
    React.useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const handleMapClick = (e: any) => {
            if (pickingFor) {
                const lat = Number(e.latlng.lat.toFixed(5));
                const lng = Number(e.latlng.lng.toFixed(5));
                
                if (confirm(`确定将 ${pickingFor.name} 的精确坐标设为 [${lat}, ${lng}] 吗？`)) {
                    const file = app.vault.getAbstractFileByPath(pickingFor.path);
                    if (file instanceof TFile) {
                        app.fileManager.processFrontMatter(file, (frontmatter) => {
                            frontmatter.location = [lat, lng];
                        }).then(() => {
                            setPickingFor(null);
                        });
                    }
                } else {
                    setPickingFor(null);
                }
            }
        };

        map.on('click', handleMapClick);
        // @ts-ignore
        map._container.style.cursor = pickingFor ? 'crosshair' : '';

        return () => {
            map.off('click', handleMapClick);
            // @ts-ignore
            map._container.style.cursor = '';
        };
    }, [pickingFor, app]);

    // 工具函数
    const openPersonFile = (path: string) => {
        const file = app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) app.workspace.getLeaf().openFile(file);
    };

    const handleResetLocation = () => {
        setSelectedLocation(null);
        setFilterRadius(0);
        setSelectedPeople([]);
    };

    const handleQuickLog = (person: PersonData) => {
        const file = app.vault.getAbstractFileByPath(person.path);
        if (file instanceof TFile) {
            app.fileManager.processFrontMatter(file, (frontmatter) => {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                frontmatter.last_contact = `${yyyy}-${mm}-${dd}`;
            });
        }
    };

    const domainOptions = ["全部", "朋友", "同学", "客户", "潜在客户", "合作方", "家人", "亲戚"];
    const statusOptions = ["全部", "活跃", "沉寂", "归档", "边界"];
    const radiusOptions = [
        { label: "同城不限距离", value: 0 },
        { label: "10 km", value: 10 },
        { label: "50 km", value: 50 },
        { label: "100 km", value: 100 },
        { label: "300 km", value: 300 }
    ];

    const uniqueContactCount = filteredPeople.length;
    const totalLocationsCount = filteredPeople.reduce((sum, p) => sum + p.cityList.length, 0);

    if (!isInitialized) {
        return <OneClickSetup app={app} onComplete={() => setIsInitialized(true)} />;
    }

    return (
        <div className="prm-map-layout">
            <div className="prm-map-wrapper" style={{ display: activeTab === "radar" ? "block" : "none" }}>
                <div id="prm-leaflet-map" ref={mapContainerRef}></div>
                
                {pickingFor && (
                    <div className="prm-picking-overlay">
                        正在为 <strong>{pickingFor.name}</strong> 拾取坐标。请点击地图具体位置，或 <button onClick={() => setPickingFor(null)}>取消</button>
                    </div>
                )}
            </div>

            <div className="prm-sidebar" style={{ width: "100%", maxWidth: activeTab === "ai" ? "100%" : "350px", transition: "max-width 0.3s ease" }}>
                <div className="prm-tab-switcher">
                    <button className={`prm-tab-btn ${activeTab === "radar" ? "active" : ""}`} onClick={() => setActiveTab("radar")}>
                        📍 地理雷达
                    </button>
                    <button className={`prm-tab-btn ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")}>
                        🤖 AI 归档助理
                    </button>
                </div>
                
                {activeTab === "ai" && <PRMAIArchiver app={app} plugin={plugin} />}
                
                <div style={{ display: activeTab === "radar" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
                <div className="prm-dashboard-card">
                    <div className="prm-dashboard-title">📍 人脉数据雷达</div>
                    <div className="prm-dashboard-grid">
                        <div className="prm-dashboard-item">
                            <span className="prm-dash-value">{uniqueContactCount}</span>
                            <span className="prm-dash-label">👤 唯一联系人</span>
                        </div>
                        <div className="prm-dashboard-item">
                            <span className="prm-dash-value">{totalLocationsCount}</span>
                            <span className="prm-dash-label">🗺️ 辐射分布点</span>
                        </div>
                    </div>
                </div>

                <div className="prm-filters-section">
                    <div className="prm-filter-group">
                        <label>活跃状态</label>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                    <div className="prm-filter-group">
                        <label>关系域</label>
                        <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}>
                            {domainOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                    <div className="prm-filter-group">
                        <label>联系维护警告</label>
                        <select value={filterContactWarning} onChange={e => setFilterContactWarning(e.target.value)}>
                            <option value="全部">不限</option>
                            <option value="超1个月未联系">超1个月未联系</option>
                            <option value="超3个月未联系">超3个月未联系</option>
                        </select>
                    </div>
                    {selectedLocation && (
                        <div className="prm-filter-group prm-radius-filter">
                            <label>差旅雷达 (辐射范围)</label>
                            <select value={filterRadius} onChange={e => setFilterRadius(Number(e.target.value))}>
                                {radiusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <div className="prm-cards-section">
                    <div className="prm-section-title">
                        <span>
                            {selectedLocation ? `📍 中心: ${selectedLocation} ${filterRadius ? `(${filterRadius}km)` : ''}` : "👤 全部联系人"}
                        </span>
                        {selectedLocation && (
                            <button className="prm-btn-reset" onClick={handleResetLocation}>
                                重置
                            </button>
                        )}
                    </div>

                    <div className="prm-cards-scroll">
                        {(selectedLocation ? selectedPeople : filteredPeople).length === 0 ? (
                            <div className="prm-empty-state">
                                没有匹配的联系人。
                            </div>
                        ) : (
                            (selectedLocation ? selectedPeople : filteredPeople).map(person => {
                                const isWarning = (() => {
                                    if (!person.lastContact || person.lastContact === "未记录") return false;
                                    const diffDays = Math.ceil(Math.abs(new Date().getTime() - new Date(person.lastContact).getTime()) / (1000 * 60 * 60 * 24));
                                    return diffDays > 90;
                                })();

                                return (
                                    <div key={person.path} className={`prm-person-card ${isWarning ? "prm-card-warning" : ""}`}>
                                        <div className="prm-card-header">
                                            <a 
                                                className="prm-card-name internal-link" 
                                                data-href={person.path} 
                                                onClick={(e) => { e.preventDefault(); openPersonFile(person.path); }}
                                            >
                                                {person.name}
                                            </a>
                                            <span className={`prm-badge prm-status-${person.status}`}>{person.status}</span>
                                        </div>

                                        <div className="prm-card-body">
                                            <div className="prm-card-row">
                                                <span className="prm-card-label">位置：</span>
                                                <span className="prm-card-val-cities">
                                                    {person.preciseLocation ? (
                                                        <span className="prm-city-tag prm-tag-precise">精确坐标已设</span>
                                                    ) : null}
                                                    {person.cityList.map(c => (
                                                        <span key={c} className="prm-city-tag" onClick={() => setSelectedLocation(c)}>{c}</span>
                                                    ))}
                                                </span>
                                            </div>

                                            <div className="prm-card-row">
                                                <span className="prm-card-label">最近：</span>
                                                <span className={`prm-card-val ${isWarning ? "prm-text-danger" : ""}`}>
                                                    {person.lastContact}
                                                    {isWarning && <span className="prm-warn-icon" title="超过3个月未联系">⚠️</span>}
                                                </span>
                                            </div>
                                            
                                            <div className="prm-card-actions">
                                                <button className="prm-action-btn" onClick={() => handleQuickLog(person)}>
                                                    ✅ 记今日联系
                                                </button>
                                                <button className="prm-action-btn" onClick={() => setPickingFor(person)}>
                                                    📌 手工拾取坐标
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// One-Click Setup & Templates
// ============================================================
const TEMPLATE_PEOPLE = `---
categories:
  - "[[People]]"
aliases: []
status: 活跃
relationship_domains:
  - 朋友
primary_domain: 朋友
relationship_stage:
last_contact:
trust_in_me:
trust_in_solution:
city:
life_stage:
---

# {{title}}

## 基本信息
## 关系画像
## 关系上下文
## 家庭教育观察
## 重要观察
## 后续行动
- [ ] 

## 共同事项
![[Endeavors.base#Person]]

## 交互
![[Interactions.base#Person]]
`;

const TEMPLATE_INTERACTION = `---
categories:
  - "[[Interactions]]"
date: {{date}}
participants: []
interaction_context:
  - 私人
business_intent: 无
scene_type: 面谈
location_city: 
location_type: 
location_place: ""
topics: []
self_energy: 
self_openness: 
self_mode: 平衡
self_aftertaste: 一般
entropy_max: 
entropy_avg: 
entropy_map: {}
depth_reason: ""
relationship_delta: ""
linked_endeavors: []
---

# {{title}}

## 事实
## 摘要（按人）
## 交流深度判断
- depth reason:
- relationship delta:

## 后续行动
- [ ] 
`;

const TEMPLATE_ENDEAVOR = `---
categories:
  - "[[Endeavors]]"
status: 活跃
endeavor_type: 项目
participants: []
relationship_domains:
  - 朋友
start_date:
end_date:
importance:
energy_cost:
relationship_impact:
outcome:
linked_interactions: []
next_review_date:
---

# {{title}}

## 初衷
## 参与者
## 目标
## 当前状态
## 分工
## 关键互动
## 关系观察
## 后续行动
- [ ] 
## 结果复盘
`;

const TEMPLATE_DAILY = `---
date: {{date}}
prm_processed: false
---

记录一下今天的见闻...
`;

const OneClickSetup: React.FC<{ app: App, onComplete: () => void }> = ({ app, onComplete }) => {
    const [loading, setLoading] = React.useState(false);

    const handleInitialize = async () => {
        setLoading(true);
        try {
            const folders = ["People", "Interactions", "Endeavors", "Daily", "Templates"];
            for (const f of folders) {
                if (!(app.vault.getAbstractFileByPath(f) instanceof TFolder)) {
                    await app.vault.createFolder(f);
                }
            }

            const writeTemplate = async (path: string, content: string) => {
                if (!app.vault.getAbstractFileByPath(path)) {
                    await app.vault.create(path, content);
                }
            };

            await writeTemplate("Templates/PRM-人脉模板.md", TEMPLATE_PEOPLE);
            await writeTemplate("Templates/PRM-交互记录模板.md", TEMPLATE_INTERACTION);
            await writeTemplate("Templates/PRM-共同事项模板.md", TEMPLATE_ENDEAVOR);
            await writeTemplate("Templates/PRM-日记模板.md", TEMPLATE_DAILY);

            const today = new Date().toISOString().split('T')[0];
            await writeTemplate(`Daily/${today}-PRM新手测试.md`, `---\ndate: ${today}\nprm_processed: false\n---\n\n今天下午见到了小明。他说他最近在郑州忙一些教育相关的事情。我们聊得很深入，感觉关系又近了一步。\n`);

            new Notice("PRM 工作区初始化成功！");
            onComplete();
        } catch (e) {
            new Notice("初始化失败: " + e);
        }
        setLoading(false);
    };

    return (
        <div className="prm-setup-container">
            <h2 className="prm-setup-title">欢迎使用 PRM Map & AI Assistant 🚀</h2>
            <p className="prm-setup-desc">检测到您的库中缺少基础的 PRM 文件夹结构。只需点击下方按钮，我们将自动为您生成所需的目录和标准模板。</p>
            <button className="prm-btn-primary prm-setup-btn" onClick={handleInitialize} disabled={loading}>
                {loading ? "正在初始化..." : "✨ 一键初始化 PRM 工作区"}
            </button>
        </div>
    );
};

// ============================================================
// AI Archiver
// ============================================================
interface DailyNote {
    file: TFile;
    title: string;
    date: string;
}

const PRMAIArchiver: React.FC<{ app: App, plugin: PRMMapPlugin }> = ({ app, plugin }) => {
    const [dailyNotes, setDailyNotes] = React.useState<DailyNote[]>([]);
    const [selectedNotes, setSelectedNotes] = React.useState<TFile[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [auditData, setAuditData] = React.useState<any>(null);

    React.useEffect(() => {
        loadUnprocessedNotes();
    }, [app]);

    const loadUnprocessedNotes = () => {
        const folder = app.vault.getAbstractFileByPath("Daily");
        if (!(folder instanceof TFolder)) return;

        const files: DailyNote[] = [];
        folder.children.forEach((file: any) => {
            if (file instanceof TFile && file.extension === "md") {
                const cache = app.metadataCache.getFileCache(file);
                if (!cache?.frontmatter || cache.frontmatter.prm_processed !== true) {
                    files.push({
                        file,
                        title: file.basename,
                        date: cache?.frontmatter?.date || "未知日期"
                    });
                }
            }
        });
        setDailyNotes(files);
        setSelectedNotes(files.map(f => f.file));
    };

    const toggleNote = (file: TFile) => {
        setSelectedNotes(prev => prev.includes(file) ? prev.filter(f => f.path !== file.path) : [...prev, file]);
    };

    const runAnalysis = async () => {
        if (selectedNotes.length === 0) {
            new Notice("请选择至少一篇日记！");
            return;
        }

        if (!plugin.settings.apiKey) {
            new Notice("错误：请先在插件设置中配置大模型 API Key！");
            return;
        }

        setLoading(true);
        try {
            let combinedContent = "";
            for (const file of selectedNotes) {
                const content = await app.vault.cachedRead(file);
                combinedContent += `\n\n--- 日记: ${file.basename} ---\n` + content;
            }

            const url = plugin.settings.apiBaseUrl.endsWith("/chat/completions") 
                ? plugin.settings.apiBaseUrl 
                : plugin.settings.apiBaseUrl.replace(/\/$/, "") + "/chat/completions";

            const response = await requestUrl({
                url: url,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${plugin.settings.apiKey}`
                },
                body: JSON.stringify({
                    model: plugin.settings.model,
                    messages: [
                        { role: "system", content: plugin.settings.promptTemplate },
                        { role: "user", content: "请分析以下日记内容，并严格按照 JSON 格式输出拟归档方案：\n" + combinedContent }
                    ],
                    temperature: 0.2
                })
            });

            if (response.status !== 200) {
                throw new Error(response.text);
            }

            const aiContent = response.json.choices[0].message.content;
            const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/);
            const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
            
            setAuditData(JSON.parse(jsonString));
            new Notice("✨ AI 分析完成！请审核。");

        } catch (e) {
            console.error(e);
            new Notice("分析失败，请检查设置中的接口配置和网络: " + String(e));
        }
        setLoading(false);
    };

    const confirmAndWrite = async () => {
        setLoading(true);
        try {
            // Write new people
            if (auditData.newPeople) {
                for (const p of auditData.newPeople) {
                    const path = `People/${p.name}.md`;
                    if (!app.vault.getAbstractFileByPath(path)) {
                        let content = TEMPLATE_PEOPLE.replace("{{title}}", p.name);
                        await app.vault.create(path, content);
                        const file = app.vault.getAbstractFileByPath(path) as TFile;
                        await app.fileManager.processFrontMatter(file, (fm) => {
                            fm.status = p.status || "活跃";
                            fm.city = p.city || "";
                            fm.primary_domain = p.primary_domain || "";
                            if (p.relationship_domains) fm.relationship_domains = p.relationship_domains;
                        });
                    }
                }
            }

            // Update people
            if (auditData.updatePeople) {
                for (const p of auditData.updatePeople) {
                    const file = app.vault.getAbstractFileByPath(`People/${p.name}.md`);
                    if (file instanceof TFile && p.updates) {
                        await app.fileManager.processFrontMatter(file, (fm) => {
                            for (const [k, v] of Object.entries(p.updates)) {
                                fm[k] = v;
                            }
                        });
                    }
                }
            }

            // Write interactions
            if (auditData.newInteractions) {
                for (const i of auditData.newInteractions) {
                    const safeTitle = i.title ? i.title.replace(new RegExp('[\\\\/:*?"<>|]', 'g'), "") : `交互-${i.date}`;
                    const path = `Interactions/${i.date}-${safeTitle}.md`;
                    if (!app.vault.getAbstractFileByPath(path)) {
                        let content = TEMPLATE_INTERACTION.replace("{{title}}", safeTitle).replace(/{{date}}/g, i.date || "");
                        await app.vault.create(path, content);
                        const file = app.vault.getAbstractFileByPath(path) as TFile;
                        await app.fileManager.processFrontMatter(file, (fm) => {
                            fm.participants = i.participants || [];
                            fm.entropy_avg = i.entropy || 0;
                            fm.depth_reason = i.depth_reason || "";
                            fm.scene_type = i.scene_type || "";
                        });
                    }
                }
            }

            // Update original daily notes
            for (const file of selectedNotes) {
                await app.fileManager.processFrontMatter(file, (fm) => {
                    fm.prm_processed = true;
                });
            }

            new Notice("💾 写入成功！所有数据已归档至库中。");
            setAuditData(null);
            loadUnprocessedNotes();

        } catch (e) {
            new Notice("写入时发生错误: " + String(e));
        }
        setLoading(false);
    };

    if (auditData) {
        return (
            <div className="prm-audit-panel">
                <div className="prm-audit-header">
                    <h3>🔍 AI 拟归档审核</h3>
                    <button className="prm-btn-secondary" onClick={() => setAuditData(null)}>放弃</button>
                </div>

                <div className="prm-audit-scroll">
                    {auditData.newPeople && auditData.newPeople.length > 0 && (
                        <div className="prm-audit-group">
                            <div className="prm-audit-group-title">👤 拟新建人物 ({auditData.newPeople.length})</div>
                            {auditData.newPeople.map((p: any, idx: number) => (
                                <div key={idx} className="prm-audit-card">
                                    <strong>{p.name}</strong> <span className="prm-badge">{p.status}</span>
                                    <div className="prm-audit-meta">城市: {p.city} | 核心圈: {p.primary_domain}</div>
                                    <div className="prm-audit-reason">💬 {p.reason}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {auditData.newInteractions && auditData.newInteractions.length > 0 && (
                        <div className="prm-audit-group">
                            <div className="prm-audit-group-title">🤝 拟新增交互 ({auditData.newInteractions.length})</div>
                            {auditData.newInteractions.map((i: any, idx: number) => (
                                <div key={idx} className="prm-audit-card">
                                    <strong>{i.title}</strong> <span className="prm-badge">{i.date}</span>
                                    <div className="prm-audit-meta">参与者: {(i.participants || []).join(", ")}</div>
                                    <div className="prm-audit-reason">深度: {i.entropy} | {i.depth_reason}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {auditData.newEndeavors && auditData.newEndeavors.length > 0 && (
                        <div className="prm-audit-group">
                            <div className="prm-audit-group-title">🎯 拟新增共同事项 ({auditData.newEndeavors.length})</div>
                            {auditData.newEndeavors.map((e: any, idx: number) => (
                                <div key={idx} className="prm-audit-card">
                                    <strong>{e.title}</strong>
                                    <div className="prm-audit-meta">参与者: {(e.participants || []).join(", ")}</div>
                                    <div className="prm-audit-reason">{e.description}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {auditData.uncertain && auditData.uncertain.length > 0 && (
                        <div className="prm-audit-group prm-audit-group-warning">
                            <div className="prm-audit-group-title">❓ 需要您确认的信息</div>
                            {auditData.uncertain.map((u: any, idx: number) => (
                                <div key={idx} className="prm-audit-card">
                                    <strong>{u.content}</strong>
                                    <div className="prm-audit-reason">💡 {u.reason}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="prm-audit-footer">
                    <button className="prm-btn-primary prm-write-btn" onClick={confirmAndWrite} disabled={loading}>
                        {loading ? "写入中..." : "💾 确认并一键写入系统"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="prm-ai-archiver">
            <div className="prm-dashboard-card">
                <div className="prm-dashboard-title">📥 未归档日记池</div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>扫描到 {dailyNotes.length} 篇待处理笔记</p>
                <div className="prm-notes-list">
                    {dailyNotes.length === 0 ? (
                        <div className="prm-empty-state">太棒了！所有日记都已归档完毕。</div>
                    ) : (
                        dailyNotes.map(n => (
                            <label key={n.file.path} className="prm-note-item">
                                <input type="checkbox" checked={selectedNotes.includes(n.file)} onChange={() => toggleNote(n.file)} />
                                <span>{n.title}</span>
                            </label>
                        ))
                    )}
                </div>
            </div>
            
            <button className="prm-btn-primary prm-ai-btn" onClick={runAnalysis} disabled={loading || selectedNotes.length === 0}>
                {loading ? "🤖 脑力激荡中..." : "✨ 开始 AI 智能分析"}
            </button>
        </div>
    );
};

export const PRMMapViewComponent: React.FC<PRMMapViewComponentProps> = (props) => (
    <ErrorBoundary>
        <PRMMapApp {...props} />
    </ErrorBoundary>
);
