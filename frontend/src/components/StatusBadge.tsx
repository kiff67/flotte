import type { InterventionStatus } from "../types";

const LABELS: Record<InterventionStatus, string> = {
  en_attente: "En attente",
  validee: "Validée",
  rejetee: "Refusée",
};

export function StatusBadge({ statut }: { statut: InterventionStatus }) {
  return <span className={`badge badge-${statut}`}>{LABELS[statut]}</span>;
}
