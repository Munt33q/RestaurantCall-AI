import { cookies } from "next/headers";
export function staffAuthorized() { return cookies().get("staff_session")?.value === "demo"; }
