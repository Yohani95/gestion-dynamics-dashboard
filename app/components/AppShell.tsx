"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, ArrowRightLeft, Menu, X, ChevronRight } from "lucide-react";
import { InstanceProvider } from "./InstanceContext";
import InstanceSelector from "./InstanceSelector";
import PwaInstallPrompt from "./PwaInstallPrompt";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);

    const navItems = [
        { name: "Ventas (Dynamics)", href: "/", icon: LayoutDashboard },
        { name: "Transferencias", href: "/transferencias", icon: ArrowRightLeft },
    ];

    const SidebarContent = () => (
        <div className="flex h-full flex-col bg-zinc-950 text-white">
            <div className="flex h-20 shrink-0 border-b border-zinc-800 items-center justify-between px-6">
                <AnimatePresence mode="wait">
                    {!isDesktopCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            className="flex items-center gap-3 overflow-hidden origin-left whitespace-nowrap"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                                <span className="text-zinc-950 font-bold text-sm">TL</span>
                            </div>
                            <span className="font-semibold tracking-wide">TheLineGroup</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {isDesktopCollapsed && (
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                        <span className="text-zinc-950 font-bold text-sm">TL</span>
                    </div>
                )}
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-4 scrollbar-hide">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileOpen(false)}
                            className={`group flex items-center rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300 relative overflow-hidden ${isActive
                                ? "bg-zinc-800/80 text-white shadow-sm"
                                : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-50"
                                }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="active-nav-indicator"
                                    className="absolute left-0 top-0 h-full w-1 bg-white rounded-r-full"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            <item.icon
                                className={`flex-shrink-0 h-5 w-5 transition-colors ${isActive ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                                    } ${isDesktopCollapsed ? "mx-auto" : "mr-3"}`}
                                aria-hidden="true"
                            />
                            <AnimatePresence mode="wait">
                                {!isDesktopCollapsed && (
                                    <motion.span
                                        initial={{ opacity: 0, width: 0 }}
                                        animate={{ opacity: 1, width: "auto" }}
                                        exit={{ opacity: 0, width: 0 }}
                                        className="overflow-hidden whitespace-nowrap"
                                    >
                                        {item.name}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-zinc-800">
                <div
                    className={`flex items-center gap-3 rounded-xl p-3 bg-zinc-900/50 border border-zinc-800/50 ${isDesktopCollapsed ? "justify-center" : ""
                        }`}
                >
                    <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center text-xs font-bold ring-2 ring-zinc-800">
                        YE
                    </div>
                    <AnimatePresence mode="wait">
                        {!isDesktopCollapsed && (
                            <motion.div
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                exit={{ opacity: 0, width: 0 }}
                                className="flex flex-col overflow-hidden whitespace-nowrap"
                            >
                                <span className="text-sm font-medium text-zinc-200">Yohani Espinoza</span>
                                <span className="text-xs text-zinc-500">Administrador</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );

    return (
        <InstanceProvider>
            <div className="bg-zinc-50 min-h-screen font-sans selection:bg-zinc-900 selection:text-white">

                {/* Mobile Sidebar Navigation */}
                <AnimatePresence>
                    {isMobileOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsMobileOpen(false)}
                                className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm lg:hidden"
                            />
                            <motion.div
                                initial={{ x: "-100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "-100%" }}
                                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                                className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden shadow-2xl"
                            >
                                <SidebarContent />
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Desktop Sidebar */}
                <motion.div
                    animate={{ width: isDesktopCollapsed ? "5rem" : "18rem" }}
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                    className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] border-r border-zinc-200/50 isolate"
                >
                    <SidebarContent />

                    {/* Collapse Toggle Button */}
                    <button
                        onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
                        className="absolute -right-3.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white border border-zinc-200 shadow-sm text-zinc-400 hover:text-zinc-900 transition-colors z-[60]"
                    >
                        <motion.div animate={{ rotate: isDesktopCollapsed ? 180 : 0 }}>
                            <ChevronRight className="h-4 w-4" />
                        </motion.div>
                    </button>
                </motion.div>

                {/* Main Content Area */}
                <motion.div
                    animate={{ paddingLeft: isDesktopCollapsed ? "5rem" : "18rem" }}
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                    className="flex flex-col flex-1 w-full lg:min-h-screen transition-all"
                >
                    {/* Top Header for Mobile & Breadcrumbs for Desktop */}
                    <div className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-x-4 border-b border-zinc-200/50 bg-white/80 backdrop-blur-md px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
                        <button
                            type="button"
                            className="-m-2.5 p-2.5 text-zinc-700 lg:hidden hover:bg-zinc-100 rounded-lg transition-colors"
                            onClick={() => setIsMobileOpen(true)}
                        >
                            <span className="sr-only">Open sidebar</span>
                            <Menu className="h-6 w-6" aria-hidden="true" />
                        </button>

                        {/* Separator */}
                        <div className="h-6 w-px bg-zinc-200 lg:hidden" aria-hidden="true" />

                        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6 items-center">
                            <h1 className="text-sm font-semibold text-zinc-800 tracking-tight">
                                {pathname === "/" ? "Diagnóstico Integración Dynamics" : "Gestión de Transferencias"}
                            </h1>
                            <div className="flex items-center gap-x-4 ml-auto lg:gap-x-6">
                                <InstanceSelector />
                            </div>
                        </div>
                    </div>

                    <main className="flex-1 pb-10">
                        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {children}
                        </div>
                    </main>
                </motion.div>

                <PwaInstallPrompt />
            </div>
        </InstanceProvider>
    );
}

