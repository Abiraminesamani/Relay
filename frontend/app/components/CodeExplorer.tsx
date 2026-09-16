"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Search,
  Zap,
  Sparkles,
  Copy,
  Check,
  Play,
  ShieldAlert,
  Layers,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  Code2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MessageSquare,
  X,
  FileCheck,
  FolderGit2,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type FileTreeNode = {
  path: string;
  name: string;
  type: string;
  size?: number;
  extension?: string;
};

type Repository = {
  id: number;
  name: string;
  repo_url: string;
};

type InlineAssistResult = {
  action: string;
  file_path: string;
  language: string;
  summary: string;
  explanation: string;
  suggested_code?: string;
  unit_tests?: string;
  security_risks?: string[];
};

type CodeExplorerProps = {
  token: string;
  initialRepoId?: number | null;
  onSendToChat?: (query: string) => void;
};

export default function CodeExplorer({ token, initialRepoId, onSendToChat }: CodeExplorerProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(initialRepoId || null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilePath, setActiveFilePath] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [fileMetadata, setFileMetadata] = useState<{ lines: number; size: number; language: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Inline AI Assistant State
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState<string>("explain");
  const [aiResult, setAiResult] = useState<InlineAssistResult | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // 1. Fetch repositories
  useEffect(() => {
    fetch(`${API_BASE}/repositories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Repository[]) => {
        setRepositories(data);
        if (data.length > 0 && !selectedRepoId) {
          setSelectedRepoId(data[0].id);
        }
      })
      .catch(() => {});
  }, [token]);

  // 2. Fetch File Tree when selected repo changes
  useEffect(() => {
    if (!token || !selectedRepoId) return;
    setLoadingTree(true);
    fetch(`${API_BASE}/repositories/${selectedRepoId}/tree`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.tree)) {
          setTree(data.tree);
          // Find first code file
          const firstFile = data.tree.find((n: FileTreeNode) => n.type === "blob");
          if (firstFile) {
            loadFile(firstFile.path);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTree(false));
  }, [token, selectedRepoId]);

  // 3. Load File Content
  async function loadFile(filePath: string) {
    if (!token || !selectedRepoId || !filePath) return;
    setActiveFilePath(filePath);
    setLoadingFile(true);
    setSelectedText("");

    try {
      const res = await fetch(
        `${API_BASE}/repositories/${selectedRepoId}/file-content?path=${encodeURIComponent(filePath)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
        setFileMetadata({
          lines: data.lines,
          size: data.size,
          language: data.language,
        });
      }
    } catch {
      setFileContent(`// Error reading ${filePath}`);
    } finally {
      setLoadingFile(false);
    }
  }

  // 4. Trigger Inline AI Assistant
  async function runInlineAssist(actionType: string) {
    if (!activeFilePath) return;
    const codeToAnalyze = selectedText.trim() || fileContent;
    if (!codeToAnalyze) return;

    setAiAction(actionType);
    setIsAiPanelOpen(true);
    setAiLoading(true);
    setAiResult(null);

    try {
      const res = await fetch(`${API_BASE}/code/inline-assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repository_id: selectedRepoId,
          file_path: activeFilePath,
          code_snippet: codeToAnalyze.slice(0, 4000),
          full_file_context: fileContent.slice(0, 3000),
          action: actionType,
          custom_prompt: customPrompt || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiResult(data);
      }
    } catch {
      setAiResult({
        action: actionType,
        file_path: activeFilePath,
        language: fileMetadata?.language || "code",
        summary: `Analysis for ${activeFilePath}`,
        explanation: "Unable to connect to AI engine. Please verify your backend and LLM provider.",
      });
    } finally {
      setAiLoading(false);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleFolder(folderPath: string) {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  }

  // Filtered files based on search
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    return tree.filter((n) => n.path.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [tree, searchQuery]);

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId);

  return (
    <div className="flex h-[calc(100vh-90px)] flex-col rounded-xl bg-[#0C0D0F] shadow-xl overflow-hidden border border-[#24262A]">
      {/* Top Header Bar */}
      <div className="border-b border-[#24262A] bg-[#0C0D0F] px-5 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#111214] border border-[#24262A] text-[#6366F1] text-xs">
            <Code2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-[#F5F5F5]">Code Explorer & Inline AI</h2>
            <p className="text-[10px] text-[#8B8F98]">Live AST parsing & code comprehension</p>
          </div>
        </div>

        {/* Top Controls: Repository Picker & AI Assistant Action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-[#111214] px-2.5 py-1.5 border border-[#24262A] text-xs">
            <FolderGit2 className="w-3.5 h-3.5 text-[#8B8F98]" />
            <select
              value={selectedRepoId || ""}
              onChange={(e) => setSelectedRepoId(Number(e.target.value))}
              className="bg-transparent text-[#F5F5F5] outline-none cursor-pointer text-xs font-medium max-w-[160px] truncate"
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.id} className="bg-[#111214] text-[#F5F5F5]">
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => runInlineAssist("explain")}
            className="rounded-md bg-[#6366F1] hover:bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-[#F5F5F5] flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Code Assistant</span>
          </button>
        </div>
      </div>

      {/* Main 3-Pane Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: File Tree Explorer (Width 280px) */}
        <aside className="w-72 flex-shrink-0 border-r border-[#24262A] bg-[#0C0D0F] p-3 flex flex-col space-y-3">
          {/* File Search Filter */}
          <div className="flex items-center gap-2 rounded-lg bg-[#111214] border border-[#24262A] px-3 py-1.5 text-xs">
            <Search className="w-3.5 h-3.5 text-[#5C6068]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files in repo..."
              className="bg-transparent text-[#F5F5F5] placeholder-[#5C6068] outline-none w-full text-xs"
            />
          </div>

          {/* File Tree List */}
          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
            {loadingTree ? (
              <div className="py-8 text-center text-xs text-[#8B8F98] flex flex-col items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
                <span>Reading repository tree...</span>
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8B8F98]">No matching files found.</div>
            ) : (
              filteredTree.map((node) => {
                const isSelected = node.path === activeFilePath;
                const isDir = node.type === "tree";

                return (
                  <button
                    key={node.path}
                    onClick={() => {
                      if (isDir) {
                        toggleFolder(node.path);
                      } else {
                        loadFile(node.path);
                      }
                    }}
                    className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition flex items-center justify-between group ${
                      isSelected
                        ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A] font-medium"
                        : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {isDir ? (
                        <Folder className="w-3.5 h-3.5 text-[#8B8F98] flex-shrink-0" />
                      ) : (
                        <FileCode className="w-3.5 h-3.5 text-[#8B8F98] flex-shrink-0" />
                      )}
                      <span className="truncate">{node.path}</span>
                    </div>

                    {node.size ? (
                      <span className="text-[9px] text-[#5C6068] font-mono flex-shrink-0 ml-1">
                        {node.size > 1024 ? `${Math.round(node.size / 1024)}k` : `${node.size}b`}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Center Pane: Code Viewer */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#08090A] overflow-hidden">
          {/* File Header Bar */}
          <div className="border-b border-[#24262A] bg-[#0C0D0F] px-4 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode className="w-3.5 h-3.5 text-[#8B8F98] flex-shrink-0" />
              <span className="font-mono font-medium text-[#F5F5F5] truncate">{activeFilePath || "No file selected"}</span>
              {fileMetadata && (
                <span className="text-[10px] text-[#5C6068] font-mono">
                  ({fileMetadata.lines} lines • {fileMetadata.language})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(fileContent)}
                className="rounded-md bg-[#111214] hover:bg-[#17181B] border border-[#24262A] px-2.5 py-1 text-[11px] font-medium text-[#8B8F98] hover:text-[#F5F5F5] transition flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3 text-[#22C55E]" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "Copied" : "Copy File"}</span>
              </button>
            </div>
          </div>

          {/* Floating Contextual Toolbar when code is highlighted */}
          {selectedText.length > 5 && (
            <div className="bg-[#111214] border-b border-[#24262A] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#F5F5F5]">
                <Sparkles className="w-3.5 h-3.5 text-[#6366F1]" />
                <span className="font-medium">
                  {selectedText.split("\n").length} lines selected
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => runInlineAssist("explain")}
                  className="rounded-md bg-[#6366F1] hover:bg-[#4F46E5] px-2.5 py-1 text-[11px] font-medium text-[#F5F5F5] transition flex items-center gap-1"
                >
                  <Layers className="w-3 h-3" />
                  <span>Explain</span>
                </button>
                <button
                  onClick={() => runInlineAssist("refactor")}
                  className="rounded-md bg-[#17181B] hover:bg-[#24262A] border border-[#24262A] px-2.5 py-1 text-[11px] font-medium text-[#F5F5F5] transition flex items-center gap-1"
                >
                  <Zap className="w-3 h-3 text-[#8B8F98]" />
                  <span>Refactor</span>
                </button>
                <button
                  onClick={() => runInlineAssist("generate_tests")}
                  className="rounded-md bg-[#17181B] hover:bg-[#24262A] border border-[#24262A] px-2.5 py-1 text-[11px] font-medium text-[#F5F5F5] transition flex items-center gap-1"
                >
                  <Play className="w-3 h-3 text-[#8B8F98]" />
                  <span>Generate Tests</span>
                </button>
                <button
                  onClick={() => runInlineAssist("security_scan")}
                  className="rounded-md bg-[#17181B] hover:bg-[#24262A] border border-[#24262A] px-2.5 py-1 text-[11px] font-medium text-[#F5F5F5] transition flex items-center gap-1"
                >
                  <ShieldAlert className="w-3 h-3 text-[#8B8F98]" />
                  <span>Security Audit</span>
                </button>
              </div>
            </div>
          )}

          {/* Code Viewer Canvas */}
          <div
            className="flex-1 overflow-auto p-4 font-mono text-xs text-[#F5F5F5] leading-relaxed select-text"
            onMouseUp={() => {
              const sel = window.getSelection()?.toString() || "";
              if (sel.trim().length > 3) {
                setSelectedText(sel);
              }
            }}
          >
            {loadingFile ? (
              <div className="py-16 text-center text-xs text-[#8B8F98] flex flex-col items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
                <span>Loading source code...</span>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {fileContent.split("\n").map((line, idx) => (
                    <tr key={idx} className="hover:bg-[#17181B] transition-colors">
                      <td className="w-10 pr-4 text-right select-none text-[#5C6068] font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="whitespace-pre overflow-x-auto text-[#F5F5F5] font-mono text-[12px]">
                        {line || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* Right Pane: Inline AI Assistant Response Drawer */}
        {isAiPanelOpen && (
          <aside className="w-96 flex-shrink-0 border-l border-[#24262A] bg-[#0C0D0F] p-4 flex flex-col justify-between shadow-xl">
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="flex items-center justify-between pb-2 border-b border-[#24262A]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#6366F1]" />
                  <h3 className="text-xs font-semibold text-[#F5F5F5] uppercase tracking-wider">
                    Inline AI Assistant
                  </h3>
                </div>
                <button
                  onClick={() => setIsAiPanelOpen(false)}
                  className="text-[#8B8F98] hover:text-[#F5F5F5] p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <button
                  onClick={() => runInlineAssist("explain")}
                  className={`rounded-md p-2 font-medium transition flex items-center justify-center gap-1.5 ${
                    aiAction === "explain"
                      ? "bg-[#6366F1] text-[#F5F5F5]"
                      : "bg-[#111214] border border-[#24262A] text-[#8B8F98] hover:text-[#F5F5F5] hover:bg-[#17181B]"
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Explain</span>
                </button>
                <button
                  onClick={() => runInlineAssist("refactor")}
                  className={`rounded-md p-2 font-medium transition flex items-center justify-center gap-1.5 ${
                    aiAction === "refactor"
                      ? "bg-[#6366F1] text-[#F5F5F5]"
                      : "bg-[#111214] border border-[#24262A] text-[#8B8F98] hover:text-[#F5F5F5] hover:bg-[#17181B]"
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  <span>Refactor</span>
                </button>
                <button
                  onClick={() => runInlineAssist("generate_tests")}
                  className={`rounded-md p-2 font-medium transition flex items-center justify-center gap-1.5 ${
                    aiAction === "generate_tests"
                      ? "bg-[#6366F1] text-[#F5F5F5]"
                      : "bg-[#111214] border border-[#24262A] text-[#8B8F98] hover:text-[#F5F5F5] hover:bg-[#17181B]"
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>Unit Tests</span>
                </button>
                <button
                  onClick={() => runInlineAssist("security_scan")}
                  className={`rounded-md p-2 font-medium transition flex items-center justify-center gap-1.5 ${
                    aiAction === "security_scan"
                      ? "bg-[#6366F1] text-[#F5F5F5]"
                      : "bg-[#111214] border border-[#24262A] text-[#8B8F98] hover:text-[#F5F5F5] hover:bg-[#17181B]"
                  }`}
                >
                  <ShieldAlert className="w-3 h-3" />
                  <span>Security Audit</span>
                </button>
              </div>

              {/* AI Response Output */}
              {aiLoading ? (
                <div className="py-12 text-center text-xs text-[#8B8F98] flex flex-col items-center gap-2">
                  <div className="h-5 w-5 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
                  <span className="font-medium text-[#F5F5F5]">Synthesizing code intelligence...</span>
                </div>
              ) : aiResult ? (
                <div className="space-y-3 text-xs leading-relaxed">
                  <div className="rounded-lg bg-[#111214] border border-[#24262A] p-3 text-[#F5F5F5] whitespace-pre-wrap">
                    {aiResult.explanation}
                  </div>

                  {aiResult.suggested_code && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-[#8B8F98]">
                        <span className="font-semibold text-[#F5F5F5]">Suggested Refactor:</span>
                        <button
                          onClick={() => handleCopy(aiResult.suggested_code || "")}
                          className="text-[#6366F1] hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="rounded-lg bg-[#08090A] border border-[#24262A] p-3 text-[11px] font-mono text-[#F5F5F5] overflow-x-auto">
                        {aiResult.suggested_code}
                      </pre>
                    </div>
                  )}

                  {aiResult.unit_tests && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-[#8B8F98]">
                        <span className="font-semibold text-[#F5F5F5]">Generated Unit Tests:</span>
                        <button
                          onClick={() => handleCopy(aiResult.unit_tests || "")}
                          className="text-[#6366F1] hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="rounded-lg bg-[#08090A] border border-[#24262A] p-3 text-[11px] font-mono text-[#F5F5F5] overflow-x-auto">
                        {aiResult.unit_tests}
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Send to Main Chat Action */}
            {onSendToChat && aiResult && (
              <div className="pt-3 border-t border-[#24262A]">
                <button
                  onClick={() => {
                    onSendToChat(
                      `Regarding file \`${activeFilePath}\`:\n${aiResult.explanation.slice(0, 300)}...`
                    );
                  }}
                  className="w-full rounded-md bg-[#111214] hover:bg-[#17181B] border border-[#24262A] py-2 text-xs font-medium text-[#F5F5F5] transition flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#8B8F98]" />
                  <span>Continue in AI Copilot Chat</span>
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
