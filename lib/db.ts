import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const globalDb = globalThis as unknown as { ncrpDb?: DatabaseSync };
function getDatabase() {
  if (
    process.env.NCRP_BACKEND === "supabase" ||
    (process.env.NODE_ENV === "production" &&
      process.env.NCRP_BACKEND !== "local")
  ) {
    throw new Error(
      "SQLite is disabled in production. Configure NCRP_BACKEND=supabase and use the Supabase repository.",
    );
  }
  if (!globalDb.ncrpDb) {
    const dataPath =
      process.env.NCRP_DATABASE_PATH ||
      path.join(process.cwd(), "data", "ncrp-one-case.db");
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    globalDb.ncrpDb = new DatabaseSync(dataPath);
    globalDb.ncrpDb.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;",
    );
  }
  return globalDb.ncrpDb;
}

export const db = new Proxy({} as DatabaseSync, {
  get(_target, property) {
    const value = Reflect.get(getDatabase(), property);
    return typeof value === "function" ? value.bind(getDatabase()) : value;
  },
});

export function initializeDatabase() {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('citizen','operator')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS citizens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), full_name TEXT NOT NULL, phone_masked TEXT, city TEXT, state TEXT, preferred_language TEXT DEFAULT 'en', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS institutions (id TEXT PRIMARY KEY, name TEXT NOT NULL, institution_type TEXT NOT NULL, short_code TEXT, city TEXT, state TEXT, simulated INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, public_case_id TEXT UNIQUE NOT NULL, citizen_id TEXT NOT NULL REFERENCES citizens(id), case_type TEXT NOT NULL, case_status TEXT NOT NULL, priority TEXT NOT NULL, reported_amount INTEGER NOT NULL, secured_amount INTEGER NOT NULL DEFAULT 0, tracing_amount INTEGER NOT NULL DEFAULT 0, unrecovered_amount INTEGER NOT NULL DEFAULT 0, current_owner_type TEXT, current_owner_name TEXT, current_stage TEXT NOT NULL, opened_at TEXT NOT NULL, last_activity_at TEXT NOT NULL, closed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, case_id TEXT NOT NULL UNIQUE REFERENCES cases(id), raw_description TEXT NOT NULL, structured_summary TEXT, fraud_type TEXT, fraud_mechanism TEXT, impersonated_entity TEXT, payment_channel TEXT, incident_at TEXT, first_reported_at TEXT, location_text TEXT, confidence_score REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), parent_transaction_id TEXT, transaction_ref TEXT NOT NULL, institution_id TEXT REFERENCES institutions(id), direction TEXT, amount INTEGER NOT NULL, transaction_type TEXT, transaction_status TEXT, occurred_at TEXT, destination_identifier_masked TEXT, source_identifier_masked TEXT, metadata_json TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fund_movements (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), source_transaction_id TEXT REFERENCES transactions(id), destination_transaction_id TEXT REFERENCES transactions(id), amount INTEGER NOT NULL, movement_status TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), uploaded_by_user_id TEXT NOT NULL REFERENCES users(id), evidence_type TEXT NOT NULL, title TEXT NOT NULL, storage_path TEXT NOT NULL, mime_type TEXT NOT NULL, file_size INTEGER NOT NULL, sha256 TEXT NOT NULL, extracted_metadata_json TEXT, uploaded_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS evidence_requests (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), requested_by TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, required_evidence_type TEXT NOT NULL, due_at TEXT, status TEXT NOT NULL, submitted_evidence_id TEXT REFERENCES evidence(id), created_at TEXT NOT NULL, resolved_at TEXT);
    CREATE TABLE IF NOT EXISTS agency_assignments (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), institution_id TEXT NOT NULL REFERENCES institutions(id), assignment_type TEXT NOT NULL, status TEXT NOT NULL, assigned_at TEXT NOT NULL, acknowledged_at TEXT, completed_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fir_records (id TEXT PRIMARY KEY, case_id TEXT NOT NULL UNIQUE REFERENCES cases(id), fir_status TEXT NOT NULL, fir_number TEXT, police_station TEXT, registered_at TEXT, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS case_events (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), event_type TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT, institution_id TEXT REFERENCES institutions(id), payload_json TEXT NOT NULL, previous_state_json TEXT NOT NULL, new_state_json TEXT NOT NULL, citizen_visible INTEGER NOT NULL DEFAULT 1, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), case_id TEXT NOT NULL REFERENCES cases(id), notification_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
}
