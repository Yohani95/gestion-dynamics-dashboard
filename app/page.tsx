import DashboardContent from "./components/DashboardContent";

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Análisis de Ventas e Integración</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Supervise el estado de boletas (BLE), facturas (FCV) y notas de crédito (NCV) enviadas al sistema Dynamics.
        </p>
      </header>

      <div className="bg-white ring-1 ring-zinc-200/50 rounded-2xl shadow-sm p-6 sm:p-8">
        <DashboardContent />
      </div>
    </div>
  );
}
