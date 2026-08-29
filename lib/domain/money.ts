import type { MovementStatus } from "@/lib/types";

export type MovementAmount = {
  movement_status: MovementStatus;
  amount: number;
};
export function reconcileMovements(movements: MovementAmount[]) {
  return movements.reduce(
    (totals, movement) => {
      if (movement.movement_status === "secured")
        totals.secured += movement.amount;
      else if (
        movement.movement_status === "tracing" ||
        movement.movement_status === "moved"
      )
        totals.tracing += movement.amount;
      else totals.unrecovered += movement.amount;
      return totals;
    },
    { secured: 0, tracing: 0, unrecovered: 0 },
  );
}
