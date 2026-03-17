"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import AdvancedJobsPanel from "@/app/components/AdvancedJobsPanel";
import AyudaJobsAdvanced from "@/app/components/AyudaJobsAdvanced";

export default function AdvancedJobsPage() {
  const [activeTab, setActiveTab] = useState<"jobs" | "ayuda">("jobs");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Avanzados
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Control de Jobs</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Monitorea SQL Agent jobs en tiempo real y ejecuta acciones autorizadas con trazabilidad.
          </p>
        </div>

        <div className="flex rounded-lg bg-zinc-100 p-1">
          <button
            onClick={() => setActiveTab("jobs")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
              activeTab === "jobs"
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                : "text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700"
            }`}
          >
            Jobs
          </button>
          <button
            onClick={() => setActiveTab("ayuda")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
              activeTab === "ayuda"
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                : "text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700"
            }`}
          >
            Ayuda
          </button>
        </div>
      </header>

      {activeTab === "jobs" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <AdvancedJobsPanel />
        </motion.div>
      )}

      {activeTab === "ayuda" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/50 shadow-sm"
        >
          <AyudaJobsAdvanced />
        </motion.div>
      )}
    </div>
  );
}
