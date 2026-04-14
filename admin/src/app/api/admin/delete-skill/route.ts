import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const CF_URL = "https://europe-west1-zelos-prod.cloudfunctions.net/adminDeleteUserSkill";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const { skillId, userId } = await request.json();
    if (
      typeof skillId !== "string" ||
      typeof userId !== "string" ||
      !skillId ||
      !userId ||
      skillId.length > 128 ||
      userId.length > 128
    ) {
      return NextResponse.json({ error: "Invalid skillId or userId" }, { status: 400 });
    }

    // Look up discipline from the skill doc
    const skillDoc = await getAdminDb().collection("skills").doc(skillId).get();
    if (!skillDoc.exists) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    const discipline = skillDoc.data()?.discipline;
    if (!discipline) {
      return NextResponse.json({ error: "Skill has no discipline field" }, { status: 400 });
    }

    // Get an ID token with admin claim
    const customToken = await getAdminAuth().createCustomToken("admin-cli", { admin: true });
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
    );
    if (!signInRes.ok) throw new Error(`Auth failed: ${await signInRes.text()}`);
    const { idToken } = await signInRes.json();

    // Call the Cloud Function
    const res = await fetch(CF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { userId, skillId, discipline: String(discipline).toLowerCase() } }),
    });
    if (!res.ok) throw new Error(`Cloud Function error: ${await res.text()}`);

    console.info(
      JSON.stringify({
        event: "admin_delete_skill",
        admin: auth.admin.email,
        skillId,
        userId,
        at: new Date().toISOString(),
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete skill error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
