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

/** The phrase on the arrow into a node, taken from what happened to that money. */
function edgeVerb(node: FundFlowNode) {
  if (node.depth === 1) return "transferred to";
  if (isCashOut(node)) return "taken out via";
  const statuses = new Set(node.dispositions.map((item) => tone[item.status]));
  if (node.children.length || statuses.size > 1) return "moved on to";
  if (statuses.has("secured")) return "held at";
  return "traced to";
}

/** A node's colour comes from the money resting on it, not its descendants. */
function nodeTone(node: FundFlowNode) {
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

function FlowNode({
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
      className="flow-node"
      style={{ "--branches": node.children.length } as React.CSSProperties}
    >
      {node.depth > 0 && (
        <div className="flow-edge" aria-hidden>
          <span className="flow-edge-label">
            {rupee(node.total)} {edgeVerb(node)}
          </span>
        </div>
      )}
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
      {node.children.length > 0 && (
        <div className="flow-children">
          {node.children.map((child) => (
            <FlowNode
              key={child.account}
              node={child}
              highlighted={highlighted}
            />
          ))}
        </div>
      )}
    </div>
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
  return (
    <div className="money-trail">
      <FlowNode node={root} highlighted={highlighted ?? new Set()} />
    </div>
  );
}
