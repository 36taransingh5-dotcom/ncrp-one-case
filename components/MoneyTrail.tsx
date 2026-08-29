"use client";

import type { FundFlowNode } from "@/lib/domain/fund-graph";
import type { MovementStatus } from "@/lib/types";

const rupee = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const statusLabel: Record<MovementStatus, string> = {
  secured: "Secured",
  tracing: "Tracing",
  moved: "Moved on",
  unrecovered: "Unrecovered",
  withdrawn: "Unrecovered",
};

const statusMeaning: Record<MovementStatus, string> = {
  secured: "Held in place and cannot be moved",
  tracing: "Located and being followed",
  moved: "Pushed on to another account",
  unrecovered: "Taken out before it could be held",
  withdrawn: "Taken out before it could be held",
};

/** Groups statuses into the three colours the citizen has already been shown. */
const tone: Record<MovementStatus, "secured" | "tracing" | "unrecovered"> = {
  secured: "secured",
  tracing: "tracing",
  moved: "tracing",
  unrecovered: "unrecovered",
  withdrawn: "unrecovered",
};

type Tone = "secured" | "tracing" | "unrecovered" | "mixed" | "pass";

/** Mirrors the --green / --amber / --red / --blue tokens in globals.css.
 * Hardcoded rather than var()'d, since SVG presentation attributes don't
 * reliably resolve custom properties everywhere, and these are the app's
 * only brand accents. */
const TONE_COLOR: Record<Tone, string> = {
  secured: "#16794a",
  tracing: "#ad6500",
  unrecovered: "#b42318",
  mixed: "#0b5cab",
  pass: "#93aec5",
};

const cleanInstitution = (name: string | null) =>
  name ? name.replace(/\s*\(simulated\)/i, "").replace(/\s*—.*$/, "") : null;

/** True when every rupee that stopped here was gone before a hold could land. */
function isCashOut(node: FundFlowNode) {
  return (
    node.children.length === 0 &&
    node.dispositions.length > 0 &&
    node.dispositions.every((item) => tone[item.status] === "unrecovered")
  );
}

/** The phrase on the edge into a node, taken from what happened to that money. */
function edgeVerb(node: FundFlowNode) {
  if (node.depth === 1) return "transferred to";
  if (isCashOut(node)) return "taken out via";
  const statuses = new Set(node.dispositions.map((item) => tone[item.status]));
  if (node.children.length || statuses.size > 1) return "moved on to";
  if (statuses.has("secured")) return "held at";
  return "traced to";
}

/** A node's colour comes from the money resting on it, not its descendants. */
function nodeTone(node: FundFlowNode): Tone {
  const tones = new Set(node.dispositions.map((item) => tone[item.status]));
  if (tones.size === 1) return [...tones][0];
  if (tones.size > 1) return "mixed";
  return "pass";
}

function roleLabel(node: FundFlowNode) {
  if (node.depth === 0) return "Your account";
  if (node.depth === 1) return "Received the money";
  if (isCashOut(node)) return "Left the banking system";
  return "Money moved here next";
}

// --- Layout -----------------------------------------------------------
// This renders as a real node-link tree: every card position below is
// computed from the flow data, then drawn once as SVG with bezier edges.
// Card height is estimated from content instead of measured off the DOM, so
// layout is correct on the very first paint — no measure-then-reflow flash,
// and server-rendered markup matches the client exactly.

const CARD_W = 252;
const H_GAP = 108;
const V_GAP = 26;
const MARGIN = 22;
const HEADER_H = 96;
const TOTAL_ROW_H = 40;
const DISP_CAPTION_H = 26;
const DISP_ROW_H = 62;
const BOTTOM_PAD = 16;

function cardHeight(node: FundFlowNode) {
  let h = HEADER_H + TOTAL_ROW_H + BOTTOM_PAD;
  if (node.dispositions.length > 0) {
    h += node.children.length > 0 ? DISP_CAPTION_H : 8;
    h += node.dispositions.length * DISP_ROW_H;
  }
  return h;
}

type Placed = { node: FundFlowNode; x: number; yTop: number; h: number };

/** Classic tidy-tree placement: a parent centres on the midpoint of its
 * first and last child, so multi-branch subtrees stay visually balanced. */
function layout(root: FundFlowNode) {
  const placed = new Map<FundFlowNode, Placed>();
  let cursor = MARGIN;

  const place = (node: FundFlowNode, depth: number): number => {
    const x = MARGIN + depth * (CARD_W + H_GAP);
    const h = cardHeight(node);
    if (node.children.length === 0) {
      const yTop = cursor;
      placed.set(node, { node, x, yTop, h });
      cursor = yTop + h + V_GAP;
      return yTop + h / 2;
    }
    const childCentres = node.children.map((child) => place(child, depth + 1));
    const centreY =
      (childCentres[0] + childCentres[childCentres.length - 1]) / 2;
    const yTop = centreY - h / 2;
    placed.set(node, { node, x, yTop, h });
    cursor = Math.max(cursor, yTop + h + V_GAP);
    return centreY;
  };

  place(root, 0);
  const all = [...placed.values()];
  return {
    placed,
    width: Math.max(...all.map((p) => p.x + CARD_W)) + MARGIN,
    height: Math.max(...all.map((p) => p.yTop + p.h)) + MARGIN - V_GAP,
  };
}

function flattenEdges(root: FundFlowNode): [FundFlowNode, FundFlowNode][] {
  return root.children.flatMap((child) => [
    [root, child] as [FundFlowNode, FundFlowNode],
    ...flattenEdges(child),
  ]);
}

const estimatePillWidth = (text: string) =>
  Math.max(46, Math.round(text.length * 6.2 + 20));

function Card({
  node,
  highlighted,
}: {
  node: FundFlowNode;
  highlighted: Set<string>;
}) {
  const institution = cleanInstitution(node.institution);
  const isHighlighted = node.dispositions.some((item) =>
    highlighted.has(item.id),
  );
  return (
    <div
      className={`flow-card tone-${nodeTone(node)}${
        isHighlighted ? " flow-card-updated" : ""
      }`}
    >
      <div className="flow-card-head">
        <span className="flow-role">{roleLabel(node)}</span>
        <strong className="flow-account">{node.account}</strong>
        {institution && <span className="flow-bank">{institution}</span>}
      </div>
      <div className="flow-total">
        <span>{node.depth === 0 ? "Sent" : "Received"}</span>
        <b>{rupee(node.total)}</b>
      </div>
      {node.dispositions.length > 0 && (
        <>
          {node.children.length > 0 && (
            <span className="flow-rest-caption">Stayed at this account</span>
          )}
          <ul className="flow-dispositions">
            {node.dispositions.map((item) => (
              <li key={item.id} className={`tone-${tone[item.status]}`}>
                <span className="flow-chip">{statusLabel[item.status]}</span>
                <b>{rupee(item.amount)}</b>
                <small>{statusMeaning[item.status]}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Draws every node-to-node edge as a real bezier path with a tone-coloured
 * arrowhead and an amount label, instead of approximating a connection with
 * bordered <div> pseudo-elements. */
function Edges({
  edges,
  placed,
}: {
  edges: [FundFlowNode, FundFlowNode][];
  placed: Map<FundFlowNode, Placed>;
}) {
  return (
    <g className="flow-edges">
      {edges.map(([parent, child]) => {
        const from = placed.get(parent)!;
        const to = placed.get(child)!;
        const startX = from.x + CARD_W;
        const startY = from.yTop + from.h / 2;
        const endX = to.x;
        const endY = to.yTop + to.h / 2;
        const midX = startX + (endX - startX) / 2;
        const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX - 8} ${endY}`;
        const childTone = nodeTone(child);
        const label = `${rupee(child.total)} ${edgeVerb(child)}`;
        const pillW = estimatePillWidth(label);
        const labelX = midX;
        const labelY = (startY + endY) / 2;
        return (
          <g key={child.account}>
            <path
              d={path}
              fill="none"
              stroke={TONE_COLOR[childTone]}
              strokeWidth={2.5}
              markerEnd={`url(#flow-arrow-${childTone})`}
            />
            <rect
              x={labelX - pillW / 2}
              y={labelY - 11}
              width={pillW}
              height={22}
              rx={11}
              className="flow-edge-pill"
            />
            <text
              x={labelX}
              y={labelY + 4}
              textAnchor="middle"
              className="flow-edge-text"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function MoneyTrail({
  root,
  highlighted,
}: {
  root: FundFlowNode | null;
  /** Movement ids that changed on the last live update, briefly emphasised. */
  highlighted?: Set<string>;
}) {
  if (!root)
    return (
      <div className="empty">
        The money trail will appear here once the first transfer is traced.
      </div>
    );

  const { placed, width, height } = layout(root);
  const edges = flattenEdges(root);
  const changed = highlighted ?? new Set<string>();
  const summary = [...placed.values()]
    .map((p) => `${p.node.account}: ${rupee(p.node.total)}`)
    .join(". ");

  return (
    <div className="money-trail">
      <svg
        className="flow-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Money flow diagram. ${summary}.`}
      >
        <defs>
          {(Object.keys(TONE_COLOR) as Tone[]).map((key) => (
            <marker
              key={key}
              id={`flow-arrow-${key}`}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={TONE_COLOR[key]} />
            </marker>
          ))}
        </defs>

        <Edges edges={edges} placed={placed} />

        <g className="flow-nodes">
          {[...placed.values()].map((p) => (
            <foreignObject
              key={p.node.account}
              x={p.x}
              y={p.yTop}
              width={CARD_W}
              height={p.h}
            >
              <Card node={p.node} highlighted={changed} />
            </foreignObject>
          ))}
        </g>
      </svg>
    </div>
  );
}
