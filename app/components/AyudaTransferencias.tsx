"use client";

import React from "react";
import { HelpCircle, Play, Check, Clock, AlertCircle, Info } from "lucide-react";

export default function AyudaTransferencias() {
    return (
        <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-10 text-zinc-700">
            <div className="flex items-center gap-3 border-b border-zinc-100 pb-6">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                    <HelpCircle className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-zinc-900">Guía de Gestión de Transferencias</h2>
                    <p className="text-zinc-500">Entiende el flujo de integración con Business Central</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-zinc-900">
                        <Info className="w-5 h-5 text-indigo-500" />
                        <h3>Flujo Automático</h3>
                    </div>
                    <p className="text-sm leading-relaxed">
                        El sistema procesa las transferencias de forma **asincrónica**. Si una transferencia falla por falta de stock o bloqueos temporales, el sistema intentará auto-recuperarla durante las primeras 72 horas.
                    </p>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800">
                        <strong>Nota Importante:</strong> Si el error persiste después de 3 días, la transferencia quedará en estado ERROR permanentemente a menos que se intervenga manualmente.
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-zinc-900">
                        <Check className="w-5 h-5 text-emerald-500" />
                        <h3>Significado de Acciones</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            <div className="mt-1 bg-indigo-100 p-1.5 rounded-lg h-fit text-indigo-700">
                                <Play className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold">Reintentar</h4>
                                <p className="text-xs text-zinc-500">Cambia el estado a <span className="font-semibold">PENDIENTE</span>. Úsalo cuando ya corregiste el stock o el bloqueo desapareció.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="mt-1 bg-zinc-100 p-1.5 rounded-lg h-fit text-zinc-700">
                                <Check className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold">Cerrar / Finalizar</h4>
                                <p className="text-xs text-zinc-500">Marca como <span className="font-semibold text-indigo-600">TERMINADO</span>. El sistema dejará de intentar procesarla. Úsalo si ya la gestionaste manualmente en BC.</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section className="bg-zinc-50 rounded-2xl p-6 border border-zinc-100">
                <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-zinc-400" />
                    Estados del Proceso
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        { label: 'PENDIENTE', desc: 'En cola de envío', color: 'bg-zinc-200' },
                        { label: 'ENVIANDO', desc: 'En proceso activo', color: 'bg-blue-400' },
                        { label: 'ERROR', desc: 'Falló en el API', color: 'bg-red-400' },
                        { label: 'OK', desc: 'Recibido por BC', color: 'bg-emerald-400' },
                        { label: 'TERMINADO', desc: 'Ignorado (Manual)', color: 'bg-indigo-400' },
                    ].map(e => (
                        <div key={e.label} className="bg-white p-3 rounded-xl border border-zinc-200">
                            <div className={`w-2 h-2 rounded-full ${e.color} mb-2`}></div>
                            <div className="text-[10px] font-bold text-zinc-900">{e.label}</div>
                            <div className="text-[9px] text-zinc-500 leading-tight">{e.desc}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                    ¿Cuándo cerrar manualmente?
                </h3>
                <p className="text-sm">
                    Si ves un error en el <strong>Historial General</strong> que indica que el traspaso ya existe o ya fue posteado en Business Central, presiona "Cerrar" para que el dashboard deje de marcarlo como pendiente o erróneo.
                </p>
            </section>
        </div>
    );
}
