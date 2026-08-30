import type { HTMLAttributes } from "react";
import { cx } from "./cx.js";

export type BadgeTone = "success" | "danger" | "warning" | "info" | "neutral";

const TONES: Record<BadgeTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  info: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20",
  neutral: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-500/15",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** A small colored status pill - each page maps its own domain status vocabulary (PASS/FAIL,
 * order state, job state, ...) to one of these five tones; the mapping logic stays local to the
 * page, this component only renders the result consistently. */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}
      {...props}
    />
  );
}
