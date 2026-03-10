"use client";

import { motion } from "framer-motion";
import {
  Info, FileSearch, ListChecks, CalendarDays,
  Download, ShieldCheck, RefreshCw, Database
} from "lucide-react";

export default function AyudaContent() {
  const sections = [
    {
      title: "Rastreador de Documentos",
      icon: FileSearch,
      content: "Consulta un documento por su número (BLE, FCV o NCV). Verás el estado en SII, envío a Dynamics, número de líneas en Gestion, detalle por línea y errores registrados. El último log Dynamics indica el estado más reciente del documento por si ya fue corregido.",
      extra: "Si el documento está timbrado (SII), puedes usar 'Reprocesar' para volver a enviarlo. También puedes ejecutar 'Localizar' y 'Registrar' para el documento consultado directamente desde el panel de acciones."
    },
    {
      title: "Vista Ejecutiva por Estados",
      icon: ListChecks,
      content: "Agrupa documentos por empresa, fecha, tipo y estado de envío a Dynamics. Indica una fecha de inicio y marca los estados que representen tu interés (0 a 4).",
      list: [
        { id: "0", label: "Sin enviar" },
        { id: "1", label: "Enviada (pendiente localización)" },
        { id: "2", label: "Localización OK (pendiente registro)" },
        { id: "3", label: "Registrado en Dynamics" },
        { id: "4", label: "Medio de pago listo" }
      ]
    },
    {
      title: "Auditoría Histórica",
      icon: CalendarDays,
      content: "Lista todos los documentos de una fecha específica. Filtra por número, empresa o tipo. Usa 'Ver detalle' para inspeccionar profundamente una transacción sin perder tu posición en la lista.",
    },
    {
      title: "Reportería y Exportación",
      icon: Download,
      content: "Todas las vistas permiten exportar datos a Excel/CSV y generar impresiones optimizadas de las tablas de resultados.",
      extra: "Los archivos se generan en formato estándar compatible con Microsoft Excel y herramientas de BI externas."
    },
    {
      title: "Arquitectura de Errores",
      icon: Database,
      content: "Los logs de auditoría se sincronizan en tiempo real con Ges_Salida_Error_Dyn. El sistema detecta bloqueos temporales, errores de concurrencia y fallos de validación de negocio.",
    }
  ];

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-12">
      <div className="border-b border-zinc-100 pb-8">
        <h2 className="text-2xl font-black text-zinc-900 flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          Centro de Soporte Operacional
        </h2>
        <p className="text-zinc-500 mt-3 text-sm font-medium leading-relaxed max-w-2xl">
          Guía técnica para la gestión y auditoría de documentos en el ecosistema Dynamics / Gestión.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
        {sections.map((section, idx) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-600 group-hover:bg-indigo-50 transition-colors">
                <section.icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">{section.title}</h3>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed font-medium">
              {section.content}
            </p>

            {section.list && (
              <div className="grid grid-cols-1 gap-2 pt-2">
                {section.list.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/50">
                    <span className="w-5 h-5 rounded-md bg-zinc-900 text-white flex items-center justify-center text-[10px] font-black">{item.id}</span>
                    <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-tight">{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {section.extra && (
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50 flex gap-3 italic">
                <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-indigo-700 font-medium leading-normal">{section.extra}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="pt-10 border-t border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 opacity-50" />
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sincronización de Base de Datos: OK</span>
        </div>
        <span className="text-[10px] font-bold text-zinc-300">v2.4.0 — Premium Edition</span>
      </div>
    </div>
  );
}
