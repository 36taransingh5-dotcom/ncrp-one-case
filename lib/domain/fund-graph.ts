import type { MovementStatus } from "@/lib/types";
import { reconcileMovements } from "@/lib/domain/money";

/**
 * Turns the flat list of recorded fund movements into the branching account
 * tree the citizen sees.
 *
 * Each movement is a slice of the reported amount that came to rest somewhere.
 * The transaction attached to a movement records the immediate sender and the
 * receiving account, so chaining those hops recovers the real structure:
 * the reported account pays one beneficiary, and some of that money is pushed
 * onward to further accounts before it can be held.
 *
 * Nothing here is invented — every node, amount and status is read from the
 * movement rows. The amount shown on a node is the money resting there plus
 * everything that passed through it on the way to an account below.
 */

export type FundMovementRow = {
  id: string;
  amount: number;
  movement_status: MovementStatus;
  from_account?: string | null;
  to_account?: string | null;
  to_institution?: string | null;
  origin_account?: string | null;
};

export type FundDisposition = {
  id: string;
  amount: number;
  status: MovementStatus;
};

export type FundFlowNode = {
  /** Masked account label, which is also the node's identity in the tree. */
  account: string;
  institution: string | null;
  /** Money resting at this account plus everything below it. */
  total: number;
  /** Money that came to rest at this exact account. */
  dispositions: FundDisposition[];
  children: FundFlowNode[];
  depth: number;
};

export type FundFlow = {
  root: FundFlowNode | null;
  totals: { secured: number; tracing: number; unrecovered: number };
  reported: number;
  /** True when every rupee reported is accounted for by a movement. */
  reconciled: boolean;
};

const UNKNOWN_SOURCE = "Reported account";
const UNKNOWN_DESTINATION = "Account being identified";

/** Statuses that mean "this money left the recoverable perimeter". */
export function isSettledStatus(status: MovementStatus) {
  return status === "unrecovered" || status === "withdrawn";
}

export function buildFundFlow(input: {
  reportedAmount: number;
  movements: FundMovementRow[];
}): FundFlow {
  const { reportedAmount, movements } = input;
  const totals = reconcileMovements(
    movements.map((movement) => ({
      movement_status: movement.movement_status,
      amount: Number(movement.amount) || 0,
    })),
  );
  const settled = totals.secured + totals.tracing + totals.unrecovered;
  const flow: FundFlow = {
    root: null,
    totals,
    reported: reportedAmount,
    reconciled: settled === reportedAmount,
  };
  if (!movements.length) return flow;

  const originAccount =
    movements.find((movement) => movement.origin_account)?.origin_account ||
    UNKNOWN_SOURCE;

  // An account's parent is whoever sent it the first slice we recorded.
  const parentOf = new Map<string, string>();
  const institutionOf = new Map<string, string | null>();
  const restingAt = new Map<string, FundDisposition[]>();

  for (const movement of movements) {
    const from = movement.from_account || originAccount;
    const to = movement.to_account || UNKNOWN_DESTINATION;
    institutionOf.set(to, movement.to_institution ?? null);
    if (to !== from && !parentOf.has(to)) parentOf.set(to, from);
    const list = restingAt.get(to) ?? [];
    list.push({
      id: String(movement.id),
      amount: Number(movement.amount) || 0,
      status: movement.movement_status,
    });
    restingAt.set(to, list);
  }

  // Anything whose sender we never saw receiving money hangs off the origin.
  const accounts = new Set<string>([
    originAccount,
    ...restingAt.keys(),
    ...parentOf.values(),
  ]);
  const childrenOf = new Map<string, string[]>();
  for (const account of accounts) {
    if (account === originAccount) continue;
    let parent = parentOf.get(account) ?? originAccount;
    if (parent === account) parent = originAccount;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), account]);
  }

  const seen = new Set<string>();
  const build = (account: string, depth: number): FundFlowNode => {
    seen.add(account);
    const children = (childrenOf.get(account) ?? [])
      .filter((child) => !seen.has(child))
      .map((child) => build(child, depth + 1));
    const dispositions = restingAt.get(account) ?? [];
    const total =
      dispositions.reduce((sum, item) => sum + item.amount, 0) +
      children.reduce((sum, child) => sum + child.total, 0);
    return {
      account,
      institution: institutionOf.get(account) ?? null,
      total,
      dispositions,
      children,
      depth,
    };
  };

  flow.root = build(originAccount, 0);
  // The reported account is a pass-through, so it carries the full amount even
  // before any movement has been traced out of it.
  flow.root.total = Math.max(flow.root.total, reportedAmount);
  return flow;
}

/** Every node in the tree, parents before children. */
export function flattenFlow(node: FundFlowNode | null): FundFlowNode[] {
  if (!node) return [];
  return [node, ...node.children.flatMap((child) => flattenFlow(child))];
}
