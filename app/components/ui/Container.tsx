import type { HTMLAttributes } from "react";
import { cx } from "./cx.js";

/** The one shared max-width/centering rule every page's content sits inside, so the app has a
 * single consistent horizontal rhythm instead of each page picking its own. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8", className)} {...props} />;
}

/** A wider variant for admin table/list pages, which need more horizontal room than the
 * customer-facing step-by-step flow. */
export function WideContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8", className)} {...props} />;
}
