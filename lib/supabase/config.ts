export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return { url, publishableKey };
}

export function isLocalBackend() {
  if (process.env.NCRP_BACKEND) return process.env.NCRP_BACKEND === "local";
  if (process.env.NODE_ENV === "production") return false;
  return !isSupabaseConfigured();
}

export function isDemoAccessEnabled() {
  return isLocalBackend() || process.env.NCRP_DEMO_ACCESS_ENABLED === "true";
}

export function isShowcaseDemoConfigured() {
  return Boolean(
    !isLocalBackend() &&
    process.env.NCRP_SHOWCASE_CITIZEN_EMAIL &&
    process.env.NCRP_SHOWCASE_CITIZEN_PASSWORD,
  );
}
