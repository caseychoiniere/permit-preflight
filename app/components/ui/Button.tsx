"use client";

import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx.js";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-4 py-2 " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500 shadow-sm",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-indigo-500 shadow-sm",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 shadow-sm",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:ring-indigo-500",
};

/** Thin wrapper - forwards every native <button> prop untouched (onClick, type, disabled,
 * aria-label, aria-pressed, ...), so every existing call site's behavior/accessibility contract is
 * preserved exactly; this only ever adds a className. */
export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(BASE, VARIANTS[variant], className)} {...props} />;
}
