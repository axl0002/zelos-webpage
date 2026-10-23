// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const client = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
}));
vi.mock("../src/lib/supabase/server", () => ({ serverClient: async () => client }));

import { GET } from "../src/app/admin/api/safety/route";
import { POST as preview } from "../src/app/admin/api/safety/preview/route";
import { POST as decide } from "../src/app/admin/api/safety/decision/route";

function request(path: string, body: unknown, origin = "http://localhost:3004") {
  return new NextRequest(`http://localhost:3004/admin/api/safety/${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const uploadId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const privateUrl = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/zelos-supabase-staging/clip?X-Amz-Signature=fixture";

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.ADMIN_ORIGIN;
});

describe("upload safety review routes", () => {
  it("rejects unauthenticated queue reads and previews before accessing media", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET()).status).toBe(401);
    expect((await preview(request("preview", { upload_id: uploadId }))).status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejects non-admin users before issuing a signed preview", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "athlete" } }, error: null });
    client.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "admin_required" } });
    expect((await preview(request("preview", { upload_id: uploadId }))).status).toBe(403);
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it("blocks cross-site review mutations before identity checks", async () => {
    expect((await preview(request("preview", { upload_id: uploadId }, "https://other.test"))).status).toBe(403);
    expect((await decide(request("decision", { upload_id: uploadId, approve: true, review_note: "" }, "https://other.test"))).status).toBe(403);
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("returns only an admin-authorized short-lived private preview", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "admin" } }, error: null });
    client.rpc.mockResolvedValue({ data: { boards: [] }, error: null });
    client.functions.invoke.mockResolvedValue({ data: { url: privateUrl, expires_in: 120 }, error: null });
    const response = await preview(request("preview", { upload_id: uploadId, ignored: "forged" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(client.functions.invoke).toHaveBeenCalledWith("review-upload-media", { body: { upload_id: uploadId } });
    expect(await response.json()).toEqual({ url: privateUrl, expires_in: 120 });
  });

  it.each([
    {url: "https://attacker.test/clip", expires_in: 120},
    {url: privateUrl.replace("https:", "http:"), expires_in: 120},
    {url: privateUrl, expires_in: 3600},
    {url: privateUrl, expires_in: 0},
    {url: privateUrl.replace("https://", "https://user:password@"), expires_in: 120},
  ])("rejects unsafe private preview responses: %j", async data => {
    client.auth.getUser.mockResolvedValue({data: {user: {id: "admin"}}, error: null});
    client.rpc.mockResolvedValue({data: {boards: []}, error: null});
    client.functions.invoke.mockResolvedValue({data, error: null});
    const response = await preview(request("preview", {upload_id: uploadId}));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(data.url);
  });

  it("validates decisions and forwards only the intended fields", async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "admin" } }, error: null });
    client.rpc.mockResolvedValue({ data: { boards: [] }, error: null });
    expect((await decide(request("decision", { upload_id: uploadId, approve: false, review_note: "  " }))).status).toBe(400);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    const response = await decide(request("decision", {
      upload_id: uploadId, approve: false, review_note: "Explicit content", owner_id: "forged",
    }));
    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenLastCalledWith("resolve_upload_review", {
      upload_id: uploadId, approve: false, review_note: "Explicit content",
    });
  });
});
