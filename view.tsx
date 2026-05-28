import { App, TFile } from "obsidian";
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

    return (
        <div className="prm-map-layout">
            <div className="prm-map-wrapper">
                <div id="prm-leaflet-map" ref={mapContainerRef}></div>
                
                {pickingFor && (
                    <div className="prm-picking-overlay">
                        正在为 <strong>{pickingFor.name}</strong> 拾取坐标。请点击地图具体位置，或 <button onClick={() => setPickingFor(null)}>取消</button>
                    </div>
                )}
            </div>

            <div className="prm-sidebar">
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
    );
};

export const PRMMapViewComponent: React.FC<PRMMapViewComponentProps> = (props) => (
    <ErrorBoundary>
        <PRMMapApp {...props} />
    </ErrorBoundary>
);
