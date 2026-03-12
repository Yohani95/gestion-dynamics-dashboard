import ExecutiveDashboard from "./components/ExecutiveDashboard";

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Inicio
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
          Dashboard principal
        </h2>
        <p className="max-w-3xl text-sm text-zinc-500">
          Visualiza rapidamente el estado de ventas y transferencias en un solo
          lugar para priorizar acciones del dia.
        </p>
      </header>

      <ExecutiveDashboard />
    </div>
  );
}
