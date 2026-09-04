import { seedDemo } from "@/lib/seed";
export function ensureDemoData() {
  seedDemo(false);
}
