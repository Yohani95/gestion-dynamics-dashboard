"use client";

import { AlertTriangle, HelpCircle, Play, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";

export default function AyudaJobsAdvanced() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-10 text-zinc-700">
      <div className="flex items-center gap-3 border-b border-zinc-100 pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
          <HelpCircle className="h-6 w-6 text-zinc-700" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Guia de Jobs Avanzados</h2>
          <p className="text-zinc-500">Monitoreo y acciones seguras sobre SQL Agent Jobs</p>
        </div>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <article className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-zinc-600">
            Estados
          </h3>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-semibold text-sky-700">Corriendo:</span> El job tiene ejecucion
              activa.
            </li>
            <li>
              <span className="font-semibold text-amber-700">Largo:</span> Corre sobre el umbral en
              minutos configurado en la vista.
            </li>
            <li>
              <span className="font-semibold text-rose-700">Fallido:</span> La ultima ejecucion de
              historial quedo con error.
            </li>
            <li>
              <span className="font-semibold text-zinc-700">Deshabilitado:</span> El job no iniciara
              en su programacion hasta habilitarse.
            </li>
          </ul>
        </article>

        <article className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-zinc-600">
            Menu de acciones (...)
          </h3>
          <div className="space-y-3 text-sm">
            <p className="inline-flex items-center gap-2">
              <Play className="h-4 w-4 text-emerald-600" /> Iniciar / Reintentar
            </p>
            <p className="inline-flex items-center gap-2">
              <ToggleRight className="h-4 w-4 text-sky-600" /> Habilitar
            </p>
            <p className="inline-flex items-center gap-2">
              <ToggleLeft className="h-4 w-4 text-zinc-700" /> Deshabilitar
            </p>
            <p className="text-zinc-500">
              Las opciones se habilitan segun whitelist y estado actual del job.
            </p>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="inline-flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" /> Buenas practicas operativas
        </p>
        <p className="mt-2">
          Usa motivo en cada accion para trazabilidad. Evita deshabilitar jobs de integracion sin una
          ventana de mantenimiento acordada.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        <p className="inline-flex items-center gap-2 font-semibold text-zinc-900">
          <ShieldCheck className="h-4 w-4" /> Seguridad
        </p>
        <p className="mt-2">
          Todas las acciones se auditan en <code>Ges_AdvancedAudit</code>. Si una accion no aparece,
          valida whitelist en <code>Ges_AdvancedWhitelist</code> para la instancia activa.
        </p>
      </section>
    </div>
  );
}
