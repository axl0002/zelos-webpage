import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

const MAX_IDS = 50;
const MAX_ID_LENGTH = 128;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const { commentIds } = await request.json();

    if (!Array.isArray(commentIds) || commentIds.length === 0) {
      return NextResponse.json({ comments: {} });
    }
    if (commentIds.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Too many IDs (max ${MAX_IDS})` },
        { status: 400 }
      );
    }
    if (
      !commentIds.every(
        (id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH
      )
    ) {
      return NextResponse.json({ error: "Invalid comment IDs" }, { status: 400 });
    }

    const db = getAdminDb();
    const result: Record<string, { text: string }> = {};

    // Admin SDK bypasses rules; we scan collectionGroup since we don't know the
    // parent skillId per comment. Callers must pre-validate IDs; size is capped
    // above to bound work.
    const idsToFind = new Set<string>(commentIds);
    const snap = await db.collectionGroup("comments").get();

    for (const d of snap.docs) {
      if (idsToFind.has(d.id)) {
        result[d.id] = { text: d.data().text || "" };
        idsToFind.delete(d.id);
        if (idsToFind.size === 0) break;
      }
    }

    return NextResponse.json({ comments: result });
  } catch (error) {
    console.error("Lookup comments error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
