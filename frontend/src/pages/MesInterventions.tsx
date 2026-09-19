import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Intervention } from "../types";
import { TopBar } from "../components/TopBar";
import { StatusBadge } from "../components/StatusBadge";

export function MesInterventions() {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<Intervention[]>("/interventions?mine=1")
      .then(setInterventions)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="screen">
      <TopBar title="Mes interventions" />
      <div className="screen-content">
        {loading && <p className="muted">Chargement...</p>}
        <ul className="intervention-list">
          {interventions.map((i) => (
            <li key={i.id}>
              <button className="intervention-card" onClick={() => navigate(`/intervention/${i.id}`)}>
                <div>
                  <div className="boat-name">{i.boat_name}</div>
                  <div className="muted">
                    {new Date(i.date_intervention).toLocaleDateString("fr-FR")} · {i.heures_moteur} h
                  </div>
                  <div className="muted truncate">{i.description}</div>
                </div>
                <StatusBadge statut={i.statut} />
              </button>
            </li>
          ))}
        </ul>
        {!loading && interventions.length === 0 && <p className="muted">Aucune intervention enregistrée pour le moment.</p>}
      </div>
    </div>
  );
}
