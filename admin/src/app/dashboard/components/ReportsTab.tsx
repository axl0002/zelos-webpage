"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase-client";

type SkillContent = {
  name: string;
  thumbnailUrl: string | null;
  discipline: string;
};

type CommentContent = {
  text: string;
};

type Report = {
  id: string;
  contentId: string | null;
  createdAt: Timestamp | null;
  firstActionAt: Timestamp | null;
  notes: string | null;
  offenderUid: string;
  offenderUsername?: string;
  reason: string;
  reporterUid: string;
  reporterUsername?: string;
  resolution: string | null;
  resolvedAt: Timestamp | null;
  slaDeadlineAt: Timestamp | null;
  status: string;
  type: string;
  skillContent?: SkillContent | null;
  commentContent?: CommentContent | null;
};

export default function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const allColumns = [
    "Date", "Status", "Type", "Reason", "Offender",
    "Reporter", "Content ID", "Content", "Resolution", "Actions",
  ] as const;
  type Column = (typeof allColumns)[number];
  const [visibleColumns, setVisibleColumns] = useState<Set<Column>>(new Set(allColumns));

  const toggleColumn = (col: Column) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) {
        next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  };

  const show = (col: Column) => visibleColumns.has(col);

  const filteredReports = reports.filter((r) => {
    if (filter === "open") return r.status === "open";
    if (filter === "resolved") return r.status === "resolved";
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredReports.map((r) => r.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const handleBulkDismiss = async () => {
    const selected = reports.filter(
      (r) => selectedIds.has(r.id) && r.status === "open"
    );
    if (selected.length === 0) {
      alert("No open reports selected.");
      return;
    }
    if (!confirm(`Dismiss ${selected.length} selected report(s)?`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        selected.map((r) =>
          updateDoc(doc(db, "reports", r.id), {
            status: "resolved",
            resolution: "dismissed",
            resolvedAt: Timestamp.now(),
          })
        )
      );
      setReports((prev) =>
        prev.map((r) =>
          selectedIds.has(r.id) && r.status === "open"
            ? { ...r, status: "resolved", resolution: "dismissed", resolvedAt: Timestamp.now() }
            : r
        )
      );
      setSelectedIds(new Set());
    } catch (err) {
      alert("Failed to dismiss: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setBulkLoading(false);
  };

  const removeReport = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRemoveContent = async (report: Report) => {
    if (!report.contentId) {
      alert("No content ID on this report.");
      return;
    }
    if (!confirm(`Delete skill ${report.contentId} for user ${report.offenderUsername || report.offenderUid}?`)) return;
    setActionLoading(report.id);
    try {
      const res = await fetch("/api/admin/delete-skill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: report.contentId, userId: report.offenderUid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete skill");

      await updateDoc(doc(db, "reports", report.id), {
        status: "resolved",
        resolution: "content_removed",
        resolvedAt: Timestamp.now(),
      });
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? { ...r, status: "resolved", resolution: "content_removed", resolvedAt: Timestamp.now() }
            : r
        )
      );
    } catch (err) {
      alert("Failed to remove content: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setActionLoading(null);
  };

  const handleResolve = async (report: Report, resolution: string) => {
    if (!confirm(`Mark this report as resolved (${resolution})?`)) return;
    setActionLoading(report.id);
    try {
      await updateDoc(doc(db, "reports", report.id), {
        status: "resolved",
        resolution,
        resolvedAt: Timestamp.now(),
      });
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? { ...r, status: "resolved", resolution, resolvedAt: Timestamp.now() }
            : r
        )
      );
    } catch (err) {
      alert("Failed to resolve report: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setActionLoading(null);
  };

  const handleBanUser = async (report: Report) => {
    if (!confirm(`Ban user ${report.offenderUsername || report.offenderUid}?`)) return;
    setActionLoading(report.id);
    try {
      await updateDoc(doc(db, "users", report.offenderUid), {
        isBanned: true,
      });
      await updateDoc(doc(db, "reports", report.id), {
        status: "resolved",
        resolution: "user_banned",
        resolvedAt: Timestamp.now(),
      });
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? { ...r, status: "resolved", resolution: "user_banned", resolvedAt: Timestamp.now() }
            : r
        )
      );
      alert("User banned.");
    } catch (err) {
      alert("Failed to ban user: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setActionLoading(null);
  };

  const handleDelete = async (report: Report) => {
    if (!confirm("Delete this report permanently?")) return;
    setActionLoading(report.id);
    try {
      await deleteDoc(doc(db, "reports", report.id));
      removeReport(report.id);
    } catch (err) {
      alert("Failed to delete report: " + (err instanceof Error ? err.message : "Unknown error"));
    }
    setActionLoading(null);
  };

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      setError(null);

      try {
        const reportsCol = collection(db, "reports");
        const q = query(reportsCol, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const rawReports = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Report[];

        // Collect unique user IDs to look up usernames
        const userIds = new Set<string>();
        rawReports.forEach((r) => {
          if (r.offenderUid) userIds.add(r.offenderUid);
          if (r.reporterUid) userIds.add(r.reporterUid);
        });

        const usernameMap: Record<string, string> = {};
        await Promise.all(
          Array.from(userIds).map(async (uid) => {
            try {
              const userDoc = await getDoc(doc(db, "users", uid));
              if (userDoc.exists()) {
                usernameMap[uid] = userDoc.data().username || uid;
              } else {
                usernameMap[uid] = "DELETED";
              }
            } catch {
              usernameMap[uid] = "DELETED";
            }
          })
        );

        // Look up content for each report with a contentId
        const contentMap: Record<string, { skill?: SkillContent; comment?: CommentContent }> = {};

        // Fetch skills (top-level collection)
        const videoReports = rawReports.filter((r) => r.contentId && r.type === "video");
        await Promise.all(
          videoReports.map(async (r) => {
            try {
              const skillDoc = await getDoc(doc(db, "skills", r.contentId!));
              if (skillDoc.exists()) {
                const d = skillDoc.data();
                contentMap[r.contentId!] = {
                  skill: {
                    name: d.name || "",
                    thumbnailUrl: d.thumbnailUrl || null,
                    discipline: d.discipline || "",
                  },
                };
              }
            } catch {
              // ignore
            }
          })
        );

        // Fetch comments via server-side API (Admin SDK bypasses security rules)
        const commentReports = rawReports.filter((r) => r.contentId && r.type === "comment");
        if (commentReports.length > 0) {
          try {
            const res = await fetch("/api/admin/lookup-comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                commentIds: commentReports.map((r) => r.contentId),
              }),
            });
            if (res.ok) {
              const { comments } = await res.json();
              for (const [id, data] of Object.entries(comments)) {
                contentMap[id] = { comment: data as CommentContent };
              }
            }
          } catch {
            // ignore
          }
        }

        const data = rawReports.map((r) => ({
          ...r,
          offenderUsername: usernameMap[r.offenderUid] || r.offenderUid,
          reporterUsername: usernameMap[r.reporterUid] || r.reporterUid,
          skillContent: r.contentId ? contentMap[r.contentId]?.skill || null : null,
          commentContent: r.contentId ? contentMap[r.contentId]?.comment || null : null,
        }));

        setReports(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }

      setLoading(false);
    };

    fetchReports();
  }, []);

  const openCount = reports.filter((r) => r.status === "open").length;
  const resolvedCount = reports.filter((r) => r.status === "resolved").length;

  function formatTimestamp(ts: Timestamp | null): string {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function truncate(str: string | null, maxLen: number): string {
    if (!str) return "—";
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "\u2026";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error loading reports: {error}
      </div>
    );
  }


  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500 mt-1">
            {reports.length} total &middot; {openCount} open &middot;{" "}
            {resolvedCount} resolved
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-md">
            {(["all", "open", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
                  filter === f
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative">
            <button
              onClick={() => setColumnsOpen((prev) => !prev)}
              className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Columns
            </button>
            {columnsOpen && (
              <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-40">
                {allColumns.map((col) => (
                  <label
                    key={col}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(col)}
                      onChange={() => toggleColumn(col)}
                      className="rounded border-gray-300"
                    />
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-3">
          <span className="text-sm text-blue-800 font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkDismiss}
            disabled={bulkLoading}
            className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {bulkLoading ? "Dismissing..." : "Dismiss Selected"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: "auto" }}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 w-px">
                <input
                  type="checkbox"
                  checked={filteredReports.length > 0 && filteredReports.every((r) => selectedIds.has(r.id))}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              {allColumns.map((col) =>
                show(col) ? (
                  <th key={col} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ) : null
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredReports.length === 0 && (
              <tr>
                <td colSpan={allColumns.length + 1} className="px-6 py-8 text-center text-gray-500">
                  No {filter !== "all" ? filter : ""} reports found.
                </td>
              </tr>
            )}
            {filteredReports.map((report) => (
              <tr key={report.id} className={`hover:bg-gray-50 ${selectedIds.has(report.id) ? "bg-blue-50" : ""}`}>
                <td className="px-3 py-3 w-px">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(report.id)}
                    onChange={() => toggleSelect(report.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                {show("Date") && (
                  <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatTimestamp(report.createdAt)}
                  </td>
                )}
                {show("Status") && (
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        report.status === "open"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {report.status}
                    </span>
                  </td>
                )}
                {show("Type") && (
                  <td className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {report.type}
                  </td>
                )}
                {show("Reason") && (
                  <td className="px-3 py-3 text-sm text-gray-900 max-w-xs">
                    {report.reason}
                  </td>
                )}
                {show("Offender") && (
                  <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {report.offenderUsername || truncate(report.offenderUid, 12)}
                  </td>
                )}
                {show("Reporter") && (
                  <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {report.reporterUsername || truncate(report.reporterUid, 12)}
                  </td>
                )}
                {show("Content ID") && (
                  <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap font-mono text-xs">
                    {truncate(report.contentId, 12)}
                  </td>
                )}
                {show("Content") && (
                  <td className="px-3 py-3 text-sm text-gray-500">
                    {report.skillContent ? (
                      <div className="flex items-center gap-2">
                        {report.skillContent.thumbnailUrl && (
                          <img
                            src={report.skillContent.thumbnailUrl}
                            alt={report.skillContent.name}
                            className="w-10 h-10 object-cover rounded"
                          />
                        )}
                        <div>
                          <div className="text-gray-900 text-sm">{report.skillContent.name}</div>
                          <div className="text-xs text-gray-400">{report.skillContent.discipline}</div>
                        </div>
                      </div>
                    ) : report.commentContent ? (
                      <div className="max-w-xs text-sm">{truncate(report.commentContent.text, 80)}</div>
                    ) : (
                      <span className="text-gray-300">&mdash;</span>
                    )}
                  </td>
                )}
                {show("Resolution") && (
                  <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {report.resolution || <span className="text-gray-300">&mdash;</span>}
                  </td>
                )}
                {show("Actions") && (
                  <td className="px-3 py-3 text-sm whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {report.status === "open" && (
                        <>
                          <button
                            onClick={() => handleRemoveContent(report)}
                            disabled={actionLoading === report.id}
                            className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                          >
                            Remove Content
                          </button>
                          <button
                            onClick={() => handleBanUser(report)}
                            disabled={actionLoading === report.id}
                            className="px-2 py-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100 disabled:opacity-50"
                          >
                            Ban User
                          </button>
                          <button
                            onClick={() => handleResolve(report, "dismissed")}
                            disabled={actionLoading === report.id}
                            className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(report)}
                        disabled={actionLoading === report.id}
                        className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                      >
                        Delete Report
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
