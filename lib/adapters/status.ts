import "server-only";

import { isLocalBackend } from "@/lib/supabase/config";
import {
  adapterStatusLabel,
  notificationStatusLabel,
  resendUsesSharedTestSender,
  type StatusLabel,
} from "./config";
import { getApiSetuMode, getDigiLockerMode } from "./identity";

export type IntegrationStatusRow = {
  name: string;
  status: StatusLabel;
  detail: string;
};

function supabaseStatus(): StatusLabel {
  if (isLocalBackend()) return "NOT CONNECTED";
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
    return "LIVE";
  return "NOT CONNECTED";
}

function openaiStatus(): StatusLabel {
  return process.env.OPENAI_API_KEY?.trim() ? "LIVE" : "NOT CONFIGURED";
}

function identityStatus(mode: "disabled" | "sandbox" | "live"): StatusLabel {
  if (mode === "live") return "LIVE";
  if (mode === "sandbox") return "SANDBOX";
  return "NOT CONNECTED";
}

export function getIntegrationStatusRows(): IntegrationStatusRow[] {
  const supabase = supabaseStatus();
  return [
    {
      name: "Supabase Auth",
      status: supabase,
      detail:
        supabase === "LIVE"
          ? "Email OTP and session cookies are served by this project."
          : "Supabase is not the active backend in this environment.",
    },
    {
      name: "Supabase DB",
      status: supabase,
      detail:
        supabase === "LIVE"
          ? "Case records persist in hosted Postgres."
          : "Local SQLite is in use, or Supabase is not configured.",
    },
    {
      name: "Supabase Storage",
      status: supabase,
      detail:
        supabase === "LIVE"
          ? "Evidence objects use the private case-evidence bucket."
          : "Local disk uploads only.",
    },
    {
      name: "Supabase Realtime",
      status: supabase,
      detail:
        supabase === "LIVE"
          ? "Committed case events stream to signed-in clients."
          : "Polling only.",
    },
    {
      name: "OpenAI",
      status: openaiStatus(),
      detail:
        openaiStatus() === "LIVE"
          ? "Case intelligence uses the configured model. Advisory only."
          : "OPENAI_API_KEY is not set.",
    },
    {
      name: "Email",
      status: notificationStatusLabel(),
      detail:
        notificationStatusLabel() === "LIVE"
          ? resendUsesSharedTestSender()
            ? "Resend is live, but the shared test sender only delivers to the Resend account owner. Set RESEND_FROM to an address on a verified domain to email the citizen who filed the case."
            : "Resend sends transactional case emails to the citizen sign-in address."
          : notificationStatusLabel() === "SANDBOX"
            ? "Notification HTTP sandbox is bound. No live inbox."
            : notificationStatusLabel() === "NOT CONFIGURED"
              ? "RESEND_API_KEY is not set. Vercel Resend Marketplace injects this key."
              : "In-process simulated adapter. No live inbox.",
    },
    {
      name: "Bank adapter",
      status: adapterStatusLabel("bank"),
      detail:
        adapterStatusLabel("bank") === "SANDBOX"
          ? "Authenticated HTTP sandbox. Not a live bank or CFCFRMS connection."
          : "In-process simulated freeze and lookup.",
    },
    {
      name: "Police adapter",
      status: adapterStatusLabel("police"),
      detail:
        adapterStatusLabel("police") === "SANDBOX"
          ? "Authenticated HTTP sandbox. Not a live FIR system."
          : "In-process simulated police actions.",
    },
    {
      name: "Reporting adapter",
      status: adapterStatusLabel("reporting"),
      detail:
        adapterStatusLabel("reporting") === "SANDBOX"
          ? "Authenticated HTTP sandbox. Not an official NCRP filing API."
          : "In-process simulated complaint references.",
    },
    {
      name: "DigiLocker",
      status: identityStatus(getDigiLockerMode()),
      detail:
        getDigiLockerMode() === "disabled"
          ? "Requires DigiLocker requester onboarding. Credentials are not configured."
          : getDigiLockerMode() === "live"
            ? "Official DigiLocker OAuth against meripehchaan.gov.in. Citizens authorize, then choose a document to attach."
            : "Official DigiLocker OAuth with partner/sandbox credentials. Not a fake locker.",
    },
    {
      name: "API Setu",
      status: identityStatus(getApiSetuMode()),
      detail:
        getApiSetuMode() === "disabled"
          ? "No usable API Setu client credentials are configured."
          : "API Setu client credentials are present and can supply DigiLocker requester OAuth if DIGILOCKER_* is unset.",
    },
  ];
}
