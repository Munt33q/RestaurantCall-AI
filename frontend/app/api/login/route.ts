import {NextResponse} from "next/server";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await request.json() : Object.fromEntries((await request.formData()).entries());
  const username = process.env.DEMO_STAFF_USERNAME || "staff";
  const password = process.env.DEMO_STAFF_PASSWORD || "securepassword";
  if (body.username !== username || body.password !== password) {
    return new NextResponse("Invalid credentials", {status: 401});
  }
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set("staff_session", "demo", {httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8});
  return response;
}
