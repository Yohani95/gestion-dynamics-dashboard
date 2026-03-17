export type InstanceId = "default" | "andpac" | "tecnobuy" | "dwhdev2";
export type InstanceScope = "full" | "jobs_only";

export type InstanceCatalogItem = {
  id: InstanceId;
  name: string;
  desc: string;
  envSuffix: string;
  scope: InstanceScope;
  supportsTransferencias: boolean;
};

export const DEFAULT_INSTANCE_ID: InstanceId = "default";

export const INSTANCE_OPTIONS: InstanceCatalogItem[] = [
  {
    id: "default",
    name: "TL Group",
    desc: "Instancia Principal (Transferencias)",
    envSuffix: "",
    scope: "full",
    supportsTransferencias: true,
  },
  {
    id: "andpac",
    name: "AndPac",
    desc: "Instancia de Propiedades / Segunda DV",
    envSuffix: "_andpac",
    scope: "full",
    supportsTransferencias: true,
  },
  {
    id: "tecnobuy",
    name: "TecnoBuy",
    desc: "Instancia Operativa TecnoBuy",
    envSuffix: "_tecnobuy",
    scope: "full",
    supportsTransferencias: false,
  },
  {
    id: "dwhdev2",
    name: "Data Warehouse Dev2",
    desc: "Instancia solo para monitoreo/control de Jobs",
    envSuffix: "_dwhdev2",
    scope: "jobs_only",
    supportsTransferencias: false,
  },
];

const INSTANCE_ID_SET = new Set<string>(INSTANCE_OPTIONS.map((option) => option.id));

const INSTANCE_MAP = INSTANCE_OPTIONS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<InstanceId, InstanceCatalogItem>,
);

export function isInstanceId(value: string | null | undefined): value is InstanceId {
  if (!value) return false;
  return INSTANCE_ID_SET.has(value);
}

export function resolveInstanceId(value: string | null | undefined): InstanceId {
  return isInstanceId(value) ? value : DEFAULT_INSTANCE_ID;
}

export function getInstanceMeta(instanceId: InstanceId): InstanceCatalogItem {
  return INSTANCE_MAP[instanceId];
}
