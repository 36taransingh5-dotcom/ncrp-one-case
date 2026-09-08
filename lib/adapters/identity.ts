export type DigiLockerMode = "disabled" | "sandbox" | "live";
export type ApiSetuMode = "disabled" | "sandbox" | "live";

export interface DigiLockerAdapter {
  isEnabled(): boolean;
  authorizationUrl(state: string): string | null;
}

export interface ApiSetuAdapter {
  isEnabled(): boolean;
}

export const disabledDigiLockerAdapter: DigiLockerAdapter = {
  isEnabled() {
    return false;
  },
  authorizationUrl() {
    return null;
  },
};

export const disabledApiSetuAdapter: ApiSetuAdapter = {
  isEnabled() {
    return false;
  },
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function getDigiLockerMode(): DigiLockerMode {
  const mode = env("DIGILOCKER_MODE").toLowerCase();
  if (mode === "sandbox" || mode === "live") {
    if (env("DIGILOCKER_CLIENT_ID") && env("DIGILOCKER_CLIENT_SECRET"))
      return mode;
  }
  return "disabled";
}

export function getApiSetuMode(): ApiSetuMode {
  const mode = env("API_SETU_MODE").toLowerCase();
  if (mode === "sandbox" || mode === "live") {
    if (env("API_SETU_CLIENT_ID") && env("API_SETU_CLIENT_SECRET")) return mode;
  }
  return "disabled";
}

export function getDigiLockerAdapter(): DigiLockerAdapter {
  return disabledDigiLockerAdapter;
}

export function getApiSetuAdapter(): ApiSetuAdapter {
  return disabledApiSetuAdapter;
}
