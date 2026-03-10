import Image from "next/image";
import DashboardContent from "./components/DashboardContent";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="bg-black py-6 px-4 sm:px-6">
        <div className="mx-auto max-w-3xl flex flex-col items-center gap-4">
          <Image
            src="/logo.png"
            alt="TheLineGroup - living retail"
            width={280}
            height={80}
            className="object-contain"
            priority
          />
          <p className="text-zinc-400 text-sm tracking-wide uppercase">
            Diagnóstico integración Dynamics
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <DashboardContent />
      </main>

      <footer className="border-t border-zinc-200 bg-white py-4 px-4 text-center text-zinc-500 text-sm flex flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-2">
          <span className="font-semibold">TheLineGroup · Gestión</span>
        </div>
        <div className="text-xs text-zinc-400 flex flex-col sm:flex-row sm:gap-2 items-center">
          <span>
            Creado por Yohani Espinoza <span aria-label="smile" role="img">😊</span>
          </span>
          <span className="hidden sm:inline">&middot;</span>
          <span>Marzo 2026</span>
        </div>
      </footer>
    </div>
  );
}
