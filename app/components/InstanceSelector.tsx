"use client";

import { motion } from "framer-motion";
import { useInstance, InstanceId } from "./InstanceContext";
import { Building2, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function InstanceSelector() {
    const { instance, setInstance, instanceName } = useInstance();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const options: { id: InstanceId; name: string; desc: string }[] = [
        { id: "default", name: "TL Group", desc: "Instancia Principal (Transferencias)" },
        { id: "andpac", name: "AndPac", desc: "Instancia de Propiedades / Segunda DV" },
    ];

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 px-4 py-2.5 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all shadow-sm active:scale-95"
            >
                <div className="p-1.5 bg-indigo-50 rounded-lg">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-left hidden sm:block">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider leading-none">Empresa / Instancia</p>
                    <p className="text-sm font-bold text-zinc-900 leading-tight">{instanceName}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 5, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full z-50 w-64 bg-white border border-zinc-200 rounded-2xl shadow-xl p-2"
                >
                    {options.map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => {
                                setInstance(opt.id);
                                setIsOpen(false);
                            }}
                            className={`w-full flex flex-col items-start p-3 rounded-xl transition-all ${instance === opt.id
                                    ? "bg-indigo-50/50 ring-1 ring-indigo-500/20"
                                    : "hover:bg-zinc-50"
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <p className={`text-sm font-bold ${instance === opt.id ? "text-indigo-600" : "text-zinc-900"}`}>
                                    {opt.name}
                                </p>
                                {instance === opt.id && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                )}
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                        </button>
                    ))}
                </motion.div>
            )}
        </div>
    );
}
