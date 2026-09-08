"use client";

import { useId, useState } from "react";

export const DIGILOCKER_COMING_SOON =
  "DigiLocker will be available soon. Official requester access is not approved yet, so this app will not start a DigiLocker login or invent locker documents.";

export function DigiLockerComingSoonButton({
  label = "Continue with DigiLocker",
}: {
  label?: string;
}) {
  const statusId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="digilocker-coming-soon">
      <button
        type="button"
        className="btn secondary"
        aria-expanded={open}
        aria-controls={open ? statusId : undefined}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <p id={statusId} className="digilocker-coming-soon-note" role="status">
          {DIGILOCKER_COMING_SOON}
        </p>
      ) : null}
    </div>
  );
}
