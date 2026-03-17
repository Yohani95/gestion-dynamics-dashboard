import AdvancedSpRunningPanel from "@/app/components/AdvancedSpRunningPanel";

export default function AdvancedSpRunningPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Avanzados
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">SP Activos</h2>
        <p className="max-w-3xl text-sm text-zinc-500">
          Vista de procedimientos almacenados en ejecucion para detectar operaciones largas o
          bloqueos de forma temprana.
        </p>
      </header>

      <AdvancedSpRunningPanel />
    </div>
  );
}
