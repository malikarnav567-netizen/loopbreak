/**
 * LoopBreak — Interactive Cognitive Graph (Neubrutalist)
 *
 * Renders a force-directed graph of the cognitive structure using React Flow.
 * Nodes are styled as bold white cards with thick black borders.
 * Supports drag, click-to-inspect, node deletion ("break the loop"), and
 * cycle detection to highlight rumination loops.
 */

"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  AlertTriangle,
  Trash2,
  Zap,
} from "lucide-react";
import type {
  CognitiveGraph as CognitiveGraphType,
  CognitiveNode,
  CognitiveEdge,
} from "@/lib/types";

// ── Node Type Styling (Neubrutalist) ────────

const NODE_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  claim: {
    bg: "#FFFFFF",
    border: "#000000",
    icon: "💭",
    label: "Claim",
  },
  distortion: {
    bg: "#8B4049",
    border: "#000000",
    icon: "🔴",
    label: "Distortion",
  },
  emotion: {
    bg: "#FFDE4D",
    border: "#000000",
    icon: "⚡",
    label: "Emotion",
  },
  evidence: {
    bg: "#FFFFFF",
    border: "#2C3E6B",
    icon: "📋",
    label: "Evidence",
  },
  counter: {
    bg: "#3B5998",
    border: "#000000",
    icon: "✨",
    label: "Counter",
  },
};

// ── Custom Node Component ────────────────────

function CognitiveNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as {
    type: string;
    label: string;
    fullText?: string;
    confidence?: number;
    isLoop?: boolean;
    onClick?: (id: string) => void;
    onDelete?: (id: string) => void;
  };

  const style = NODE_STYLES[nodeData.type] || NODE_STYLES.claim;

  return (
    <div
      onClick={() => nodeData.onClick?.(data.id as string)}
      className={`group relative cursor-pointer transition-all duration-100 ${
        selected ? "ring-4 ring-[var(--color-teal)] ring-offset-2 ring-offset-[var(--color-bg)]" : ""
      } ${nodeData.isLoop ? "ring-4 ring-[var(--color-coral)] ring-offset-2 ring-offset-[var(--color-bg)]" : ""}`}
      style={{
        background: style.bg,
        border: `4px solid ${style.border}`,
        boxShadow: selected ? `6px 6px 0px 0px ${style.border}` : `4px 4px 0px 0px #000000`,
        minWidth: 140,
        maxWidth: 200,
        borderRadius: 0,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-black !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-black !border-2 !border-white"
      />

      <div className="flex items-start gap-2 px-4 py-3">
        <span className="text-sm flex-shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-bold text-black truncate uppercase tracking-wider leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {nodeData.label}
          </p>
          {nodeData.confidence !== undefined && (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 w-14 bg-gray-200 overflow-hidden">
                <div
                  className="h-full bg-black"
                  style={{ width: `${(nodeData.confidence || 0) * 100}%` }}
                />
              </div>
              <span className="text-[9px] text-black font-bold" style={{ fontFamily: "var(--font-mono)" }}>
                {Math.round((nodeData.confidence || 0) * 100)}%
              </span>
            </div>
          )}
        </div>

        {nodeData.type !== "claim" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onDelete?.(data.id as string);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-[var(--color-coral)]"
          >
            <Trash2 className="h-3 w-3 text-white" />
          </button>
        )}
      </div>

      {nodeData.isLoop && (
        <div className="absolute -top-3 -right-3 bg-[var(--color-coral)] border-3 border-black p-1">
          <Zap className="h-3 w-3 text-white" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

// ── Edge Styling ──────────────────────────────

const EDGE_COLORS: Record<string, string> = {
  supports: "#3B5998",
  leads_to: "#8B4049",
  amplifies: "#FFDE4D",
  contradicts: "#2C3E6B",
};

// ── Cycle Detection ──────────────────────────

function detectCycles(nodes: CognitiveNode[], edges: CognitiveEdge[]): Set<string> {
  const loopNodes = new Set<string>();
  const adj = new Map<string, string[]>();

  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        for (let i = cycleStart; i < path.length; i++) {
          loopNodes.add(path[i]);
        }
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    path.push(node);
    for (const next of adj.get(node) || []) {
      dfs(next, path);
    }
    path.pop();
    inStack.delete(node);
  }

  for (const n of nodes) {
    dfs(n.id, []);
  }

  return loopNodes;
}

// ── Detail Panel ─────────────────────────────

function NodeDetailPanel({
  node,
  onClose,
}: {
  node: CognitiveNode & { isLoop?: boolean };
  onClose: () => void;
}) {
  const style = NODE_STYLES[node.type] || NODE_STYLES.claim;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-4 right-4 z-30 w-72 nb-card p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{style.icon}</span>
          <h3
            className="text-sm font-bold text-black uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {node.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="nb-card-sm p-1 hover:bg-[var(--color-coral)] hover:text-white transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold" style={{ fontFamily: "var(--font-mono)" }}>
            Type
          </span>
          <p className="text-xs text-black font-semibold capitalize">{node.type}</p>
        </div>

        {node.fullText && (
          <div>
            <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold" style={{ fontFamily: "var(--font-mono)" }}>
              Full Text
            </span>
            <p className="text-xs text-black italic mt-0.5">&ldquo;{node.fullText}&rdquo;</p>
          </div>
        )}

        {node.confidence !== undefined && (
          <div>
            <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] font-bold" style={{ fontFamily: "var(--font-mono)" }}>
              Confidence
            </span>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-2 flex-1 bg-gray-200 overflow-hidden">
                <div
                  className="h-full bg-black"
                  style={{ width: `${(node.confidence || 0) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-black" style={{ fontFamily: "var(--font-mono)" }}>
                {Math.round((node.confidence || 0) * 100)}%
              </span>
            </div>
          </div>
        )}

        {node.isLoop && (
          <div className="bg-[var(--color-coral)] border-3 border-black p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3 w-3 text-white" strokeWidth={3} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-white" style={{ fontFamily: "var(--font-mono)" }}>
                Rumination Loop
              </span>
            </div>
            <p className="text-[10px] text-white/80">
              This node is part of a cognitive cycle — a recurring thought pattern.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ───────────────────────────

interface CognitiveGraphProps {
  graph: CognitiveGraphType | null;
  onNodeDelete?: (nodeId: string) => void;
}

export default function CognitiveGraphView({ graph, onNodeDelete }: CognitiveGraphProps) {
  const [selectedNode, setSelectedNode] = useState<(CognitiveNode & { isLoop?: boolean }) | null>(null);
  const [loopNodes, setLoopNodes] = useState<Set<string>>(new Set());

  const initialNodes: Node[] = useMemo(() => {
    if (!graph) return [];
    const cycles = detectCycles(graph.nodes, graph.edges);
    setLoopNodes(cycles);

    const count = graph.nodes.length;
    const centerX = 420;
    const centerY = 280;
    const radius = Math.min(280, 120 + count * 28);

    return graph.nodes.map((n, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const pos = n.position || {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };

      return {
        id: n.id,
        position: { x: pos.x, y: pos.y },
        data: {
          type: n.type,
          label: n.label,
          fullText: n.fullText,
          confidence: n.confidence,
          isLoop: cycles.has(n.id),
          onClick: (id: string) => {
            const found = graph.nodes.find((gn) => gn.id === id);
            if (found) setSelectedNode({ ...found, isLoop: cycles.has(id) });
          },
          onDelete: onNodeDelete,
        },
        type: "cognitiveNode",
      };
    });
  }, [graph, onNodeDelete]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!graph) return [];
    return graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.type === "amplifies" || e.type === "leads_to",
      style: {
        stroke: EDGE_COLORS[e.type] || "#000000",
        strokeWidth: Math.max(3, (e.strength || 0.5) * 5),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: EDGE_COLORS[e.type] || "#000000",
        width: 20,
        height: 20,
      },
      label: e.type.replace(/_/g, " "),
      labelStyle: {
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        fill: "#000000",
        fontWeight: 700 as const,
      },
    }));
  }, [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const nodeTypes: NodeTypes = useMemo(() => ({
    cognitiveNode: CognitiveNodeComponent,
  }), []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    onNodeDelete?.(nodeId);
  }, [setNodes, setEdges, onNodeDelete]);

  if (!graph || initialNodes.length === 0) return null;

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 bg-black" />
          <span
            className="text-[10px] uppercase tracking-widest text-black font-bold"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Cognitive Map — {graph.nodes.length} nodes · {graph.edges.length} edges
          </span>
        </div>
        {loopNodes.size > 0 && (
          <div className="flex items-center gap-1.5 bg-[var(--color-coral)] border-3 border-black px-3 py-1">
            <AlertTriangle className="h-3 w-3 text-white" strokeWidth={3} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-white" style={{ fontFamily: "var(--font-mono)" }}>
              {loopNodes.size} loop{loopNodes.size !== 1 ? "s" : ""} detected
            </span>
          </div>
        )}
      </div>

      {/* Graph container — spacious neubrutalist card */}
      <div className="border-4 border-black bg-white overflow-hidden" style={{ height: 560, boxShadow: "6px 6px 0px 0px #000000" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.5 }}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: "smoothstep",
          }}
          style={{ background: "#F4F0EA" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.5}
            color="#00000015"
          />
          <Controls
            className="!bg-white !border-4 !border-black !rounded-0 !shadow-[4px_4px_0px_0px_#000000]"
          />
          <MiniMap
            nodeColor={(node) => {
              const t = (node.data as any)?.type || "claim";
              const s = NODE_STYLES[t];
              return s?.bg || "#FFFFFF";
            }}
            className="!bg-[var(--color-bg)] !border-4 !border-black !rounded-0"
            maskColor="rgba(0, 0, 0, 0.3)"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(NODE_STYLES).map(([type, s]) => (
          <div key={type} className="flex items-center gap-1.5 bg-white border-2 border-black px-2 py-0.5">
            <div className="h-3 w-3" style={{ background: s.bg, border: `2px solid ${s.border}` }} />
            <span className="text-[9px] uppercase tracking-wider text-black font-bold" style={{ fontFamily: "var(--font-mono)" }}>
              {type}
            </span>
          </div>
        ))}
      </div>

      {/* How to Use — 4-step guide */}
      <div className="mt-4 border-4 border-black bg-white p-5" style={{ boxShadow: "4px 4px 0px 0px #000000" }}>
        <p
          className="text-[10px] uppercase tracking-widest text-black font-bold mb-3"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          How to Read This Map
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-2">
            <span className="text-[var(--color-yellow)] font-bold text-sm" style={{ fontFamily: "var(--font-mono)" }}>01</span>
            <p className="text-xs text-black leading-relaxed">
              <strong>Hover</strong> any node to see its full thought, type, and confidence level.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[var(--color-coral)] font-bold text-sm" style={{ fontFamily: "var(--font-mono)" }}>02</span>
            <p className="text-xs text-black leading-relaxed">
              <strong>Red nodes</strong> are cognitive distortions — irrational patterns your mind uses.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[var(--color-coral)] font-bold text-sm" style={{ fontFamily: "var(--font-mono)" }}>03</span>
            <p className="text-xs text-black leading-relaxed">
              <strong>Loops</strong> (⚡ icon) are rumination cycles — the same thought feeding itself.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#3B5998] font-bold text-sm" style={{ fontFamily: "var(--font-mono)" }}>04</span>
            <p className="text-xs text-black leading-relaxed">
              <strong>Delete</strong> any distortion node to break the loop and reframe the thought.
            </p>
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
