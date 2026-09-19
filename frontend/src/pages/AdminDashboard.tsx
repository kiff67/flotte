import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Intervention, InterventionStatus } from "../types";
import { TopBar } from "../components/TopBar";
import { StatusBadge } from "../components/StatusBadge";

const TABS: { key: InterventionStatus | "toutes"; label: string }[] = [
  { key: "en_attente", label: "En attente" },
  { key: "validee", label: "Validées" },
  { key: "rejetee", label: "Refusées" },
  { key: "toutes", label: "Toutes" },
];

export function AdminDashboard() {
  const [tab, setTab] = useState<InterventionStatus | "toutes">("en_attente");
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const qs = tab === "toutes" ? "" : `?statut=${tab}`;
    api
      .get<Intervention[]>(`/interventions${qs}`)
      .then(setInterventions)
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="screen">
      <TopBar title="Interventions" />
      <div className="screen-content">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "tab active" : "tab"} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {loading && <p className="muted">Chargement...</p>}
        <ul className="intervention-list">
          {interventions.map((i) => (
            <li key={i.id}>
              <button className="intervention-card" onClick={() => navigate(`/intervention/${i.id}`)}>
                <div>
                  <div className="boat-name">
                    {i.boat_name} <span className="muted">· {i.technician_name}</span>
                  </div>
                  <div className="muted">
                    {new Date(i.date_intervention).toLocaleDateString("fr-FR")} · {i.heures_moteur} h moteur ·{" "}
                    {i.duree_heures} h de travail
                  </div>
                  <div className="muted truncate">{i.description}</div>
                </div>
                <StatusBadge statut={i.statut} />
              </button>
            </li>
          ))}
        </ul>
        {!loading && interventions.length === 0 && <p className="muted">Aucune intervention dans cette catégorie.</p>}
      </div>
    </div>
  );
}
