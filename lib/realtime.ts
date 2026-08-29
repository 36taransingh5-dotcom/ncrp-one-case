import { EventEmitter } from "node:events";
const globalEmitter = globalThis as unknown as { ncrpEvents?: EventEmitter };
export const events = globalEmitter.ncrpEvents ?? new EventEmitter();
globalEmitter.ncrpEvents = events;
export function publishCaseUpdate(caseId: string) { events.emit("case-update", { caseId, at: new Date().toISOString() }); }
