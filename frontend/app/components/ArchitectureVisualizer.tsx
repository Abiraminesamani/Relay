"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Network,
  Layers,
  Database,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  ArrowRight,
  Key,
  Link as LinkIcon,
  Cpu,
  Sparkles,
  Server,
  FileCode2,
  RefreshCw,
  Info,
  CheckCircle2,
  FolderGit2,
  Maximize2,
  Minimize2,
  Compass,
  Boxes,
  Hand,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type DependencyNode = {
  id: string;
  name: string;
  path: string;
  category: string;
  size: number;
  in_degree: number;
  out_degree: number;
};

type DependencyEdge = {
  source: string;
  target: string;
  type: string;
  weight: number;
};

type DependencyGraphData = {
  repository_id: number;
  repository_name: string;
  total_modules: number;
  total_dependencies: number;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  categories: string[];
};

type ImpactedEndpoint = {
  method: string;
  path: string;
  handler: string;
  file_path: string;
};

type ImpactAnalysisData = {
  target_file: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  risk_score: number;
  direct_dependents: string[];
  indirect_dependents: string[];
  impacted_endpoints: ImpactedEndpoint[];
  ai_recommendation: string;
};

type ColumnSchema = {
  name: string;
  type: string;
  primary_key: boolean;
  nullable: boolean;
  foreign_key?: string | null;
  unique: boolean;
};

type TableSchema = {
  name: string;
  columns: ColumnSchema[];
  primary_keys: string[];
  foreign_keys: string[];
};

type RelationshipSchema = {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  relationship_type: string;
};

type DBSchemaData = {
  database_type: string;
  total_tables: number;
  total_relationships: number;
  tables: TableSchema[];
  relationships: RelationshipSchema[];
};

type RepositoryItem = {
  id: number;
  name: string;
  repo_url: string;
};

type ArchitectureVisualizerProps = {
  token: string;
  repoId?: number | null;
  onSendToChat?: (query: string) => void;
};

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; label: string; icon: any }> = {
  route: { bg: "bg-blue-950/50", border: "border-blue-500/40", text: "text-blue-400", dot: "bg-blue-400", label: "Routes & API", icon: Compass },
  service: { bg: "bg-emerald-950/50", border: "border-emerald-500/40", text: "text-emerald-400", dot: "bg-emerald-400", label: "Services Layer", icon: Cpu },
  agent: { bg: "bg-purple-950/50", border: "border-purple-500/40", text: "text-purple-400", dot: "bg-purple-400", label: "Agents & RAG", icon: Sparkles },
  model: { bg: "bg-amber-950/50", border: "border-amber-500/40", text: "text-amber-400", dot: "bg-amber-400", label: "Models & DB", icon: Database },
  core: { bg: "bg-cyan-950/50", border: "border-cyan-500/40", text: "text-cyan-400", dot: "bg-cyan-400", label: "Core & Config", icon: Boxes },
};

const LAYER_ORDER = ["route", "service", "agent", "model", "core"];

export default function ArchitectureVisualizer({
  token,
  repoId,
  onSendToChat,
}: ArchitectureVisualizerProps) {
  const [activeView, setActiveView] = useState<"graph" | "impact" | "schema">("graph");
  const [repositories, setRepositories] = useState<RepositoryItem[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number>(repoId || 1);

  const [graphData, setGraphData] = useState<DependencyGraphData | null>(null);
  const [impactData, setImpactData] = useState<ImpactAnalysisData | null>(null);
  const [schemaData, setSchemaData] = useState<DBSchemaData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [impactLoading, setImpactLoading] = useState<boolean>(false);

  // Graph canvas state
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // ERD state
  const [selectedTable, setSelectedTable] = useState<string>("repositories");
  const [tableSearch, setTableSearch] = useState<string>("");

  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch available repositories
  useEffect(() => {
    fetch(`${API_BASE}/repositories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RepositoryItem[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setRepositories(data);
          if (!repoId) {
            setSelectedRepoId(data[0].id);
          }
        }
      })
      .catch(() => {});
  }, [token, repoId]);

  // Sync if repoId prop changes
  useEffect(() => {
    if (repoId) {
      setSelectedRepoId(repoId);
    }
  }, [repoId]);

  // 2. Fetch architecture data for selected repository
  useEffect(() => {
    if (!token) return;
    fetchArchitectureData(selectedRepoId);
  }, [token, selectedRepoId]);

  async function fetchArchitectureData(targetRepoId: number) {
    setLoading(true);
    try {
      const [graphRes, schemaRes] = await Promise.all([
        fetch(`${API_BASE}/architecture/graph?repository_id=${targetRepoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/architecture/schema`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (graphRes.ok) {
        const gData: DependencyGraphData = await graphRes.json();
        setGraphData(gData);
        if (gData.nodes.length > 0) {
          const defaultNode = gData.nodes.find((n) => n.category === "model" || n.category === "service") || gData.nodes[0];
          setSelectedNodeId(defaultNode.id);
        }
      }
      if (schemaRes.ok) {
        const sData: DBSchemaData = await schemaRes.json();
        setSchemaData(sData);
      }
    } catch (err) {
      console.error("Failed to load architecture data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchImpactAnalysis(filePath: string) {
    if (!filePath || !token) return;
    setSelectedNodeId(filePath);
    setImpactLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/architecture/impact?repository_id=${selectedRepoId}&file_path=${encodeURIComponent(filePath)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data: ImpactAnalysisData = await res.json();
        setImpactData(data);
      }
    } catch (err) {
      console.error("Failed to load impact analysis:", err);
    } finally {
      setImpactLoading(false);
    }
  }

  // Trigger impact analysis when selectedNodeId changes
  useEffect(() => {
    if (selectedNodeId && token) {
      fetchImpactAnalysis(selectedNodeId);
    }
  }, [selectedNodeId, selectedRepoId, token]);

  // Compute node coordinates grouped by 5 distinct layer columns
  const layoutNodes = useMemo(() => {
    if (!graphData) return [];

    const filtered = graphData.nodes.filter((node) => {
      const matchCat = categoryFilter === "all" || node.category === categoryFilter;
      const matchSearch =
        !searchQuery ||
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.path.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });

    const layerMap: Record<string, DependencyNode[]> = {};
    LAYER_ORDER.forEach((layer) => {
      layerMap[layer] = filtered.filter((n) => n.category === layer);
    });

    const positionedNodes: (DependencyNode & { x: number; y: number })[] = [];
    const colSpacing = 240;
    const rowSpacing = 82;
    const startX = 30;
    const startY = 75;

    LAYER_ORDER.forEach((layer, colIndex) => {
      const nodesInLayer = layerMap[layer] || [];
      nodesInLayer.forEach((n, rowIndex) => {
        positionedNodes.push({
          ...n,
          x: startX + colIndex * colSpacing,
          y: startY + rowIndex * rowSpacing,
        });
      });
    });

    return positionedNodes;
  }, [graphData, categoryFilter, searchQuery]);

  // Compute max canvas bounds
  const canvasBounds = useMemo(() => {
    if (layoutNodes.length === 0) return { width: 1250, height: 600 };
    const maxX = Math.max(...layoutNodes.map((n) => n.x + 210), 1250);
    const maxY = Math.max(...layoutNodes.map((n) => n.y + 90), 600);
    return { width: maxX + 50, height: maxY + 60 };
  }, [layoutNodes]);

  // Get visible edges
  const visibleEdges = useMemo(() => {
    if (!graphData) return [];
    const nodeIds = new Set(layoutNodes.map((n) => n.id));
    return graphData.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [graphData, layoutNodes]);

  const selectedNode = useMemo(() => {
    return graphData?.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [graphData, selectedNodeId]);

  const filteredTables = useMemo(() => {
    if (!schemaData) return [];
    if (!tableSearch) return schemaData.tables;
    return schemaData.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
        t.columns.some((c) => c.name.toLowerCase().includes(tableSearch.toLowerCase()))
    );
  }, [schemaData, tableSearch]);

  const selectedTableObj = useMemo(() => {
    return schemaData?.tables.find((t) => t.name === selectedTable) || schemaData?.tables[0] || null;
  }, [schemaData, selectedTable]);

  // Mouse pan handlers
  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".interactive-node")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  function handleFitToView() {
    if (canvasContainerRef.current) {
      const containerWidth = canvasContainerRef.current.clientWidth;
      const fitZoom = Math.min(1.0, Math.max(0.55, (containerWidth - 40) / canvasBounds.width));
      setZoomLevel(fitZoom);
      setPanOffset({ x: 0, y: 0 });
    }
  }

  return (
    <div className={`space-y-6 ${isFullscreen ? "fixed inset-0 z-50 bg-[#07080d] p-6 overflow-auto" : ""}`}>
      {/* Top Header & Multi-Repo Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-panel p-5 rounded-2xl border border-white/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
            <Network className="w-4 h-4" />
            <span>Interactive Architecture & Dependency Visualizer</span>
          </div>
          <h1 className="text-2xl font-black text-white">System Topology & Impact Analysis</h1>
          <p className="text-xs text-gray-400">
            Select any connected repository to inspect its AST module graph, blast radius risk score, and relational ERD.
          </p>
        </div>

        {/* Action Controls & Multi-Repo Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Repository Selector Dropdown */}
          <div className="flex items-center gap-2 bg-black/60 px-3 py-2 rounded-xl border border-white/15">
            <FolderGit2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <select
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-2"
            >
              {repositories.length > 0 ? (
                repositories.map((r) => (
                  <option key={r.id} value={r.id} className="bg-[#0b0d14] text-gray-200">
                    {r.name}
                  </option>
                ))
              ) : (
                <option value={1} className="bg-[#0b0d14] text-gray-200">
                  Relay
                </option>
              )}
            </select>
          </div>

          {/* View Switcher Tabs */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveView("graph")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeView === "graph"
                  ? "bg-indigo-600 text-white shadow-lg glow-indigo"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Network className="w-3.5 h-3.5 text-indigo-300" />
              <span>Module Graph</span>
            </button>

            <button
              onClick={() => setActiveView("impact")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeView === "impact"
                  ? "bg-indigo-600 text-white shadow-lg glow-indigo"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
              <span>Impact Map</span>
            </button>

            <button
              onClick={() => setActiveView("schema")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeView === "schema"
                  ? "bg-indigo-600 text-white shadow-lg glow-indigo"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Database className="w-3.5 h-3.5 text-emerald-300" />
              <span>Database ERD</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel p-16 rounded-2xl border border-white/10 flex flex-col items-center justify-center space-y-4">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm font-semibold text-gray-300">
            Analyzing repository AST dependency trees and schemas...
          </p>
        </div>
      ) : (
        <>
          {/* VIEW 1: MODULE DEPENDENCY GRAPH */}
          {activeView === "graph" && (
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              {/* Canvas Controls & SVG Graph */}
              <div className="xl:col-span-3 space-y-3">
                {/* Graph Tool Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 glass-card p-2.5 rounded-xl border border-white/10">
                  {/* Search Bar */}
                  <div className="relative min-w-[180px] flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search module or service..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-black/50 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
                    <button
                      onClick={() => setCategoryFilter("all")}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${
                        categoryFilter === "all"
                          ? "bg-white/15 text-white border border-white/20"
                          : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      All ({graphData?.total_modules || 0})
                    </button>
                    {LAYER_ORDER.map((cat) => {
                      const meta = CATEGORY_COLORS[cat];
                      return (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-2 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                            categoryFilter === cat
                              ? `${meta.bg} ${meta.text} border ${meta.border}`
                              : "text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Zoom & Canvas Actions */}
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono text-gray-300 px-1">{Math.round(zoomLevel * 100)}%</span>
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleFitToView}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 hover:bg-white/20 text-gray-200"
                      title="Fit all 5 layers into screen"
                    >
                      Fit All
                    </button>
                    <button
                      onClick={() => {
                        setZoomLevel(0.85);
                        setPanOffset({ x: 0, y: 0 });
                      }}
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      title="Reset View"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                      title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
                    >
                      {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* SVG Visual Canvas with Drag-to-Pan */}
                <div
                  ref={canvasContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className={`relative glass-panel rounded-2xl border border-white/10 overflow-hidden bg-[#07080d] select-none ${
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                  } ${isFullscreen ? "h-[82vh]" : "h-[620px]"}`}
                >
                  {/* Floating Pan/Drag Instruction Pill */}
                  <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/70 px-2.5 py-1 rounded-full border border-white/10 text-[10px] text-gray-400 pointer-events-none backdrop-blur-md">
                    <Hand className="w-3 h-3 text-indigo-400" />
                    <span>Drag canvas to pan · Scroll to zoom</span>
                  </div>

                  {/* Scalable & Pannable Canvas World */}
                  <div
                    style={{
                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                      transformOrigin: "top left",
                      width: `${canvasBounds.width}px`,
                      height: `${canvasBounds.height}px`,
                      position: "relative",
                      transition: isDragging ? "none" : "transform 0.1s ease-out",
                    }}
                  >
                    {/* Layer Header Labels (Positioned exactly over each layer column) */}
                    {LAYER_ORDER.map((layer, colIndex) => {
                      const meta = CATEGORY_COLORS[layer];
                      const IconComp = meta.icon;
                      const colX = 30 + colIndex * 240;
                      return (
                        <div
                          key={layer}
                          style={{
                            position: "absolute",
                            left: `${colX}px`,
                            top: "16px",
                            width: "200px",
                          }}
                          className={`text-center py-1.5 px-2 rounded-xl border flex items-center justify-center gap-1.5 shadow-md ${meta.bg} ${meta.border} ${meta.text}`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-black uppercase tracking-wider">{meta.label}</span>
                        </div>
                      );
                    })}

                    {/* SVG Connector Lines / Curves */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                      <defs>
                        <marker
                          id="arrowhead-default"
                          markerWidth="8"
                          markerHeight="6"
                          refX="7"
                          refY="3"
                          orient="auto"
                        >
                          <polygon points="0 0, 8 3, 0 6" fill="#4f46e5" opacity="0.8" />
                        </marker>
                        <marker
                          id="arrowhead-highlight"
                          markerWidth="10"
                          markerHeight="8"
                          refX="8"
                          refY="4"
                          orient="auto"
                        >
                          <polygon points="0 0, 10 4, 0 8" fill="#a855f7" />
                        </marker>
                      </defs>

                      {visibleEdges.map((edge, idx) => {
                        const sourceNode = layoutNodes.find((n) => n.id === edge.source);
                        const targetNode = layoutNodes.find((n) => n.id === edge.target);
                        if (!sourceNode || !targetNode) return null;

                        const isHighlighted =
                          selectedNodeId === edge.source || selectedNodeId === edge.target;

                        // Calculate connector coordinates (width of node card is 200px)
                        const x1 = sourceNode.x + 200;
                        const y1 = sourceNode.y + 36;
                        const x2 = targetNode.x;
                        const y2 = targetNode.y + 36;
                        const dx = Math.abs(x2 - x1) * 0.45;

                        const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                        return (
                          <g key={`edge-${idx}`}>
                            <path
                              d={pathData}
                              fill="none"
                              stroke={isHighlighted ? "#c084fc" : "#4338ca"}
                              strokeWidth={isHighlighted ? 2.5 : 1.2}
                              strokeDasharray={edge.type === "queries" ? "4 4" : "none"}
                              opacity={isHighlighted ? 1 : 0.45}
                              markerEnd={isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead-default)"}
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {/* Nodes Render */}
                    {layoutNodes.map((node) => {
                      const isSelected = selectedNodeId === node.id;
                      const meta = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.core;

                      return (
                        <div
                          key={node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                          style={{
                            position: "absolute",
                            left: `${node.x}px`,
                            top: `${node.y}px`,
                            width: "200px",
                          }}
                          className={`interactive-node cursor-pointer rounded-xl p-3 border transition-all duration-200 z-10 select-none shadow-md ${
                            isSelected
                              ? "bg-indigo-950/90 border-indigo-400 ring-2 ring-indigo-500/60 shadow-indigo-500/30 scale-105"
                              : "bg-[#0c0e15]/95 border-white/10 hover:border-white/25 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                              <span className="text-xs font-bold text-white truncate">{node.name}</span>
                            </div>
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize ${meta.bg} ${meta.text}`}
                            >
                              {node.category}
                            </span>
                          </div>

                          <div className="text-[10px] text-gray-500 truncate font-mono mb-2" title={node.path}>
                            {node.path}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-gray-400 border-t border-white/5 pt-1.5">
                            <span title="In-degree (dependents)">In: {node.in_degree}</span>
                            <span title="Out-degree (dependencies)">Out: {node.out_degree}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNodeId(node.id);
                                setActiveView("impact");
                              }}
                              className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-0.5"
                              title="Inspect Blast Radius"
                            >
                              <span>Impact</span>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Node Inspector & Impact Summary Card */}
              <div className="space-y-4">
                <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-bold text-white">Module Inspector</h3>
                    </div>
                    {selectedNode && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          CATEGORY_COLORS[selectedNode.category]?.bg
                        } ${CATEGORY_COLORS[selectedNode.category]?.text}`}
                      >
                        {selectedNode.category}
                      </span>
                    )}
                  </div>

                  {selectedNode ? (
                    <div className="space-y-4 text-xs">
                      <div>
                        <div className="text-gray-400 text-[11px]">Module Identifier</div>
                        <div className="text-sm font-bold text-white mt-0.5">{selectedNode.name}</div>
                        <div className="text-[10px] font-mono text-gray-400 mt-0.5 break-all">
                          {selectedNode.path}
                        </div>
                      </div>

                      {/* Degree Metrics */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                          <div className="text-[10px] text-gray-400">Incoming Calls</div>
                          <div className="text-base font-black text-indigo-400">{selectedNode.in_degree}</div>
                          <div className="text-[9px] text-gray-500">Dependent modules</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                          <div className="text-[10px] text-gray-400">Outgoing Calls</div>
                          <div className="text-base font-black text-purple-400">{selectedNode.out_degree}</div>
                          <div className="text-[9px] text-gray-500">External services</div>
                        </div>
                      </div>

                      {/* Quick Blast Radius Preview */}
                      {impactData && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-300 font-bold text-[11px]">Blast Radius Score</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                impactData.risk_level === "CRITICAL"
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : impactData.risk_level === "HIGH"
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : impactData.risk_level === "MEDIUM"
                                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              }`}
                            >
                              {impactData.risk_level} ({impactData.risk_score}/100)
                            </span>
                          </div>

                          <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                impactData.risk_score > 75
                                  ? "bg-gradient-to-r from-amber-500 to-red-500"
                                  : impactData.risk_score > 40
                                  ? "bg-gradient-to-r from-blue-500 to-amber-500"
                                  : "bg-gradient-to-r from-emerald-500 to-teal-500"
                              }`}
                              style={{ width: `${impactData.risk_score}%` }}
                            />
                          </div>

                          <div className="text-[11px] text-gray-400 space-y-1 pt-1">
                            <div className="flex justify-between">
                              <span>Direct Dependents:</span>
                              <span className="font-bold text-white">{impactData.direct_dependents.length} files</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Impacted Endpoints:</span>
                              <span className="font-bold text-white">{impactData.impacted_endpoints.length} routes</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="space-y-2 pt-2">
                        <button
                          onClick={() => setActiveView("impact")}
                          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs hover:from-indigo-500 hover:to-purple-500 transition shadow-md flex items-center justify-center gap-2"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Full Impact Breakdown</span>
                        </button>

                        {onSendToChat && (
                          <button
                            onClick={() => {
                              const inDeg = selectedNode.in_degree;
                              const outDeg = selectedNode.out_degree;
                              onSendToChat(
                                `Provide a detailed architectural review and code analysis for module '${selectedNode.name}' (${selectedNode.path}) in repository '${graphData?.repository_name}'.\n\nArchitectural Metrics:\n- Layer Category: ${selectedNode.category}\n- In-degree (Upstream Callers): ${inDeg}\n- Out-degree (Dependencies): ${outDeg}\n\nExplain its architectural role, how it interacts with other services, and recommendations for test coverage and modularity.`
                              );
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-white/[0.05] border border-white/10 hover:bg-white/10 text-gray-300 font-semibold text-xs transition flex items-center justify-center gap-2"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Ask AI Copilot About Module</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-xs">
                      Select any node in the graph to inspect its properties and dependencies.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: IMPACT ANALYSIS MAP */}
          {activeView === "impact" && (
            <div className="space-y-6">
              {/* Target File Selector */}
              <div className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Blast Radius Target File</h3>
                    <p className="text-xs text-gray-400">
                      Select any file in repository <span className="text-white font-bold">{graphData?.repository_name}</span> to simulate code modifications and view upstream breaking changes.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={selectedNodeId}
                    onChange={(e) => setSelectedNodeId(e.target.value)}
                    className="px-3.5 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-indigo-500 max-w-[280px] truncate"
                  >
                    {graphData?.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.category})
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => fetchImpactAnalysis(selectedNodeId)}
                    disabled={impactLoading}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${impactLoading ? "animate-spin" : ""}`} />
                    <span>Recalculate</span>
                  </button>
                </div>
              </div>

              {/* Impact Breakdown Cards */}
              {impactData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Risk Score & AI Safety Recommendation */}
                  <div className="space-y-4">
                    {/* Risk Level Meter */}
                    <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-white/5">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Blast Radius Severity
                        </span>
                        {impactData.risk_level === "CRITICAL" || impactData.risk_level === "HIGH" ? (
                          <ShieldAlert className="w-5 h-5 text-red-400" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>

                      <div className="text-center py-2 space-y-1">
                        <div
                          className={`text-4xl font-black ${
                            impactData.risk_level === "CRITICAL"
                              ? "text-red-400"
                              : impactData.risk_level === "HIGH"
                              ? "text-amber-400"
                              : impactData.risk_level === "MEDIUM"
                              ? "text-yellow-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {impactData.risk_score}
                          <span className="text-base text-gray-500 font-normal"> / 100</span>
                        </div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-300">
                          Risk Level: {impactData.risk_level}
                        </div>
                      </div>

                      <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            impactData.risk_score > 75
                              ? "bg-gradient-to-r from-amber-500 to-red-500"
                              : impactData.risk_score > 40
                              ? "bg-gradient-to-r from-blue-500 to-amber-500"
                              : "bg-gradient-to-r from-emerald-500 to-teal-500"
                          }`}
                          style={{ width: `${impactData.risk_score}%` }}
                        />
                      </div>

                      {/* AI Recommendation Alert */}
                      <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Architectural Guardrail</span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed">
                          {impactData.ai_recommendation}
                        </p>
                      </div>

                      {onSendToChat && (
                        <button
                          onClick={() => {
                            const directDeps = impactData.direct_dependents.join(", ") || "None";
                            const indirectDeps = impactData.indirect_dependents.join(", ") || "None";
                            const epSummary =
                              impactData.impacted_endpoints
                                .map((e) => `${e.method} ${e.path} (${e.handler})`)
                                .join("; ") || "None";

                            onSendToChat(
                              `Generate a comprehensive blast radius impact mitigation and regression testing plan for modifying '${impactData.target_file}' in repository '${graphData?.repository_name}'.\n\nImpact Assessment:\n- Risk Score: ${impactData.risk_score}/100 (${impactData.risk_level})\n- Direct Dependents: ${directDeps}\n- Indirect Ripple Dependents: ${indirectDeps}\n- Impacted Endpoints: ${epSummary}\n- Safety Guardrail: ${impactData.ai_recommendation}\n\nOutline the specific regression test suites, unit tests, and API integration checks required before merging changes.`
                            );
                          }}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs hover:from-indigo-500 hover:to-purple-500 transition shadow-md flex items-center justify-center gap-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Generate Impact Mitigation Plan</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Middle & Right Columns: Dependents & Impacted API Routes */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Direct & Indirect Dependents */}
                    <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-purple-400" />
                          <h3 className="text-sm font-bold text-white">Upstream Dependents (Direct & Indirect)</h3>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-400">
                          {impactData.direct_dependents.length + impactData.indirect_dependents.length} files affected
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Direct Dependents */}
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span>Direct Consumers ({impactData.direct_dependents.length})</span>
                          </div>
                          {impactData.direct_dependents.length > 0 ? (
                            <ul className="space-y-1.5 text-xs">
                              {impactData.direct_dependents.map((dep, idx) => (
                                <li
                                  key={idx}
                                  onClick={() => setSelectedNodeId(dep)}
                                  className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-gray-200 cursor-pointer transition flex items-center justify-between group font-mono text-[11px]"
                                >
                                  <span className="truncate">{dep}</span>
                                  <ArrowRight className="w-3 h-3 text-gray-500 group-hover:text-indigo-400 transition flex-shrink-0" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-[11px] text-gray-500 py-2">No direct upstream callers.</div>
                          )}
                        </div>

                        {/* Indirect Dependents */}
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
                            <span className="w-2 h-2 rounded-full bg-indigo-400" />
                            <span>Indirect Consumers ({impactData.indirect_dependents.length})</span>
                          </div>
                          {impactData.indirect_dependents.length > 0 ? (
                            <ul className="space-y-1.5 text-xs">
                              {impactData.indirect_dependents.map((dep, idx) => (
                                <li
                                  key={idx}
                                  onClick={() => setSelectedNodeId(dep)}
                                  className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-gray-200 cursor-pointer transition flex items-center justify-between group font-mono text-[11px]"
                                >
                                  <span className="truncate">{dep}</span>
                                  <ArrowRight className="w-3 h-3 text-gray-500 group-hover:text-indigo-400 transition flex-shrink-0" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-[11px] text-gray-500 py-2">No secondary ripple effects detected.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Impacted HTTP API Endpoints */}
                    <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-emerald-400" />
                          <h3 className="text-sm font-bold text-white">Impacted HTTP API Endpoints</h3>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-400">
                          {impactData.impacted_endpoints.length} routes at risk
                        </span>
                      </div>

                      {impactData.impacted_endpoints.length > 0 ? (
                        <div className="space-y-2">
                          {impactData.impacted_endpoints.map((ep, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-white/15 transition"
                            >
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    ep.method === "POST"
                                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                                      : ep.method === "GET"
                                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                      : ep.method === "PUT"
                                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                                  }`}
                                >
                                  {ep.method}
                                </span>
                                <span className="text-xs font-bold text-white font-mono">{ep.path}</span>
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
                                <span>{ep.handler}()</span>
                                <span className="text-gray-600">|</span>
                                <span className="text-gray-500">{ep.file_path}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 text-center text-xs text-gray-500">
                          No external HTTP endpoints directly depend on this module.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: DATABASE SCHEMA EXPLORER (ERD) */}
          {activeView === "schema" && schemaData && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Tables Navigation List */}
              <div className="space-y-4">
                <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Tables ({schemaData.total_tables})
                      </h3>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search tables or columns..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-black/50 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1 max-h-[480px] overflow-y-auto">
                    {filteredTables.map((tbl) => {
                      const isSelected = selectedTable === tbl.name;
                      return (
                        <button
                          key={tbl.name}
                          onClick={() => setSelectedTable(tbl.name)}
                          className={`w-full text-left p-2.5 rounded-xl text-xs transition flex items-center justify-between group ${
                            isSelected
                              ? "bg-emerald-950/60 border border-emerald-500/40 text-white shadow-sm"
                              : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Database className={`w-3.5 h-3.5 ${isSelected ? "text-emerald-400" : "text-gray-500"}`} />
                            <span className="font-bold truncate">{tbl.name}</span>
                          </div>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {tbl.columns.length} cols
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ERD Table Cards & Column Inspector */}
              <div className="lg:col-span-3 space-y-4">
                {/* Active Table Details Card */}
                {selectedTableObj && (
                  <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-black text-white">{selectedTableObj.name}</h2>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-500/30">
                              SQLAlchemy ORM
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            {selectedTableObj.columns.length} attributes · {selectedTableObj.primary_keys.length} Primary Keys · {selectedTableObj.foreign_keys.length} Foreign Keys
                          </p>
                        </div>
                      </div>

                      {onSendToChat && (
                        <button
                          onClick={() => {
                            const colSummary = selectedTableObj.columns
                              .map(
                                (c) =>
                                  `${c.name} (${c.type}${c.primary_key ? ", PK" : ""}${
                                    c.foreign_key ? `, FK -> ${c.foreign_key}` : ""
                                  }${c.unique ? ", UNIQUE" : ""}${c.nullable ? "" : ", NOT NULL"})`
                              )
                              .join(", ");
                            const relSummary = schemaData?.relationships
                              .filter(
                                (r) =>
                                  r.from_table === selectedTableObj.name ||
                                  r.to_table === selectedTableObj.name
                              )
                              .map((r) => `${r.from_table}.${r.from_column} -> ${r.to_table}.${r.to_column}`)
                              .join("; ");

                            onSendToChat(
                              `Analyze and explain the database table '${selectedTableObj.name}' in repository '${graphData?.repository_name}'.\n\nSchema Details:\n- Columns: ${colSummary}\n- Primary Keys: ${selectedTableObj.primary_keys.join(", ") || "None"}\n- Foreign Keys: ${selectedTableObj.foreign_keys.join(", ") || "None"}\n- Relationships: ${relSummary || "None"}\n\nProvide an architectural overview, indexing recommendations, foreign key query optimization tips, and potential schema evolution suggestions.`
                            );
                          }}
                          className="px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 hover:bg-white/10 text-gray-200 text-xs font-semibold transition flex items-center gap-2 self-start sm:self-auto"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Explain Table with AI</span>
                        </button>
                      )}
                    </div>

                    {/* Columns Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                            <th className="pb-3 font-semibold">Column Name</th>
                            <th className="pb-3 font-semibold">Data Type</th>
                            <th className="pb-3 font-semibold">Constraints</th>
                            <th className="pb-3 font-semibold">Foreign Key Target</th>
                            <th className="pb-3 font-semibold text-right">Nullable</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {selectedTableObj.columns.map((col, idx) => (
                            <tr key={idx} className="hover:bg-white/[0.02] transition">
                              <td className="py-2.5 font-mono font-bold text-white flex items-center gap-2">
                                {col.primary_key ? (
                                  <span title="Primary Key">
                                    <Key className="w-3.5 h-3.5 text-amber-400" />
                                  </span>
                                ) : col.foreign_key ? (
                                  <span title="Foreign Key">
                                    <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
                                  </span>
                                ) : (
                                  <span className="w-3.5" />
                                )}
                                <span>{col.name}</span>
                              </td>
                              <td className="py-2.5 text-purple-400 font-mono text-[11px]">{col.type}</td>
                              <td className="py-2.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {col.primary_key && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                      PK
                                    </span>
                                  )}
                                  {col.foreign_key && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                      FK
                                    </span>
                                  )}
                                  {col.unique && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                      UNIQUE
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 font-mono text-[11px] text-gray-300">
                                {col.foreign_key ? (
                                  <button
                                    onClick={() => {
                                      const targetTbl = col.foreign_key?.split(".")[0];
                                      if (targetTbl) setSelectedTable(targetTbl);
                                    }}
                                    className="text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                                  >
                                    <span>→ {col.foreign_key}</span>
                                  </button>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                              <td className="py-2.5 text-right font-mono text-[11px]">
                                {col.nullable ? (
                                  <span className="text-gray-400">NULL</span>
                                ) : (
                                  <span className="text-amber-400 font-bold">NOT NULL</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Database Relationships Summary */}
                <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-bold text-white">
                        Entity-Relationship Foreign Key Links ({schemaData.total_relationships})
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {schemaData.relationships.map((rel, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs hover:border-white/15 transition"
                      >
                        <div className="flex items-center gap-2 font-mono">
                          <button
                            onClick={() => setSelectedTable(rel.from_table)}
                            className="font-bold text-white hover:text-indigo-400 underline"
                          >
                            {rel.from_table}
                          </button>
                          <span className="text-gray-500">({rel.from_column})</span>
                        </div>

                        <div className="flex items-center gap-2 text-indigo-400">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>

                        <div className="flex items-center gap-2 font-mono">
                          <button
                            onClick={() => setSelectedTable(rel.to_table)}
                            className="font-bold text-emerald-400 hover:text-emerald-300 underline"
                          >
                            {rel.to_table}
                          </button>
                          <span className="text-gray-500">({rel.to_column})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
