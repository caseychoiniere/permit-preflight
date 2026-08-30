import type { HTMLAttributes } from "react";
import { cx } from "./cx.js";

/** A plain bordered/rounded surface - the one recurring visual container this app needs
 * (confirmation panels, result summaries, form sections). Forwards every native <div> prop. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)} {...props} />;
}
