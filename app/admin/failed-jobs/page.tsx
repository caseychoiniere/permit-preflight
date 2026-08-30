"use client";

/** FailedJobDetail (ADM-4, frontend-components.md). Read-only - no action control of any kind,
 * not even a disabled-looking button. No FAILED-job retry mechanism exists anywhere in this
 * codebase. Corrected 2026-08-25: shows retryAttempts/timestamps and links directly to the
 * affected Order for a VERIFIED_PAYMENT job; an INTERNAL_PROTOTYPE job truthfully shows it has no
 * customer Order rather than inventing one. */

import { useEffect, useState } from "react";
import { WideContainer } from "../../components/ui/Container.js";

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
    <WideContainer>
      <a href="/admin" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Admin home
      </a>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Failed Report Jobs</h1>
      <p className="mt-1 text-sm text-slate-500">Read-only. There is no retry action for a FAILED job.</p>
      {!jobs && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
      {jobs && jobs.length === 0 && <p className="mt-4 text-sm text-slate-500">None.</p>}
      {jobs && jobs.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Job ID</th>
                <th className="px-4 py-3">Retry Attempts</th>
                <th className="px-4 py-3">Failure Reasons</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Affected Order</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{job.id}</td>
                  <td className="px-4 py-3 text-slate-700">{job.retryAttempts}</td>
                  <td className="px-4 py-3 text-slate-700">{(job.failureReasons ?? []).join("; ") || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{job.createdAt}</td>
                  <td className="px-4 py-3 text-slate-500">{job.updatedAt}</td>
                  <td className="px-4 py-3">
                    {job.orderId ? (
                      <a href={`/admin/orders/${job.orderId}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                        {job.orderId}
                      </a>
                    ) : (
                      <span className="text-slate-500">No customer order (INTERNAL_PROTOTYPE)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WideContainer>
  );
}
