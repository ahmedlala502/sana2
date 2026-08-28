"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Toast } from "@/lib/types";

const ICON = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
} as const;

const TONE = {
  info: "border-white/[0.1] text-white/80",
  success: "border-emerald-400/30 text-emerald-200/90",
  error: "border-red-400/30 text-red-200/90",
} as const;

/**
 * Transient notices.
 *
 * These used to have nowhere to go: an oversized attachment or a failed model
 * fetch wrote into the same `connection` slot that only ever rendered inside
 * the Settings tab, so unless you happened to be looking at Settings the error
 * simply vanished. Anything the user needs to know about now lands here.
 */
export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 safe-b"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-black/90 p-3 shadow-lift backdrop-blur-xl",
                TONE[t.kind]
              )}
              // errors interrupt, everything else waits its turn
              role={t.kind === "error" ? "alert" : "status"}
              aria-live={t.kind === "error" ? "assertive" : "polite"}
            >
              <Icon className="mt-px h-4 w-4 flex-none" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-[12.5px] leading-relaxed">
                  {t.message}
                </p>
                {t.action ? (
                  <button
                    onClick={() => {
                      t.action!.run();
                      onDismiss(t.id);
                    }}
                    className="mt-1.5 text-[11.5px] font-medium text-accentc hover:underline"
                  >
                    {t.action.label}
                  </button>
                ) : null}
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss"
                className="-m-1 flex-none rounded p-1 text-white/35 transition-colors hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
