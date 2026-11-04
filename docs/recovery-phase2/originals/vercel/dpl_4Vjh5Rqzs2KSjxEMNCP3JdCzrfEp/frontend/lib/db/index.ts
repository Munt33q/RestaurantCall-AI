import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
export function database() { const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL is required; persistent database access is not configured"); return drizzle(postgres(url, { max: 1, prepare: false }), { schema }); }
