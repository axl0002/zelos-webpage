import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "./firebase-admin";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type AdminSession = {
  uid: string;
  email: string;
};

export async function requireAdmin(
  request: NextRequest
): Promise<{ admin: AdminSession } | { response: NextResponse }> {
  const cookie = request.cookies.get("__session")?.value;
  if (!cookie) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    const email = decoded.email?.toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { admin: { uid: decoded.uid, email } };
  } catch {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}
