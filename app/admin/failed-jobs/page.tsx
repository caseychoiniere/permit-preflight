"use client";

/** FailedJobDetail (ADM-4, frontend-components.md). Read-only - no action control of any kind,
 * not even a disabled-looking button. No FAILED-job retry mechanism exists anywhere in this
 * codebase. Corrected 2026-08-25: shows retryAttempts/timestamps and links directly to the
 * affected Order for a VERIFIED_PAYMENT job; an INTERNAL_PROTOTYPE job truthfully shows it has no
 * customer Order rather than inventing one. */

import { useEffect, useState } from "react";

interface FailedJob {
  id: string;
  screeningRequestId: string;
  failureReasons: string[] | null;
  retryAttempts: number;
  createdAt: string;
  updatedAt: string;
  authorizationType: "INTERNAL_PROTOTYPE" | "VERIFIED_PAYMENT";
  orderId?: string;
}

export default function AdminFailedJobsPage() {
  const [jobs, setJobs] = useState<FailedJob[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/failed-jobs")
      .then((res) => res.json())
      .then((data: { jobs: FailedJob[] }) => setJobs(data.jobs));
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <p>
        <a href="/admin">&larr; Admin home</a>
      </p>
      <h1>Failed Report Jobs</h1>
      <p style={{ color: "#555" }}>Read-only. There is no retry action for a FAILED job.</p>
      {!jobs && <p>Loading...</p>}
      {jobs && jobs.length === 0 && <p>None.</p>}
      {jobs && jobs.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Job ID</th>
                <th style={{ padding: 8 }}>Retry Attempts</th>
                <th style={{ padding: 8 }}>Failure Reasons</th>
                <th style={{ padding: 8 }}>Created</th>
                <th style={{ padding: 8 }}>Updated</th>
                <th style={{ padding: 8 }}>Affected Order</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{job.id}</td>
                  <td style={{ padding: 8 }}>{job.retryAttempts}</td>
                  <td style={{ padding: 8 }}>{(job.failureReasons ?? []).join("; ") || "—"}</td>
                  <td style={{ padding: 8 }}>{job.createdAt}</td>
                  <td style={{ padding: 8 }}>{job.updatedAt}</td>
                  <td style={{ padding: 8 }}>
                    {job.orderId ? <a href={`/admin/orders/${job.orderId}`}>{job.orderId}</a> : "No customer order (INTERNAL_PROTOTYPE)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
