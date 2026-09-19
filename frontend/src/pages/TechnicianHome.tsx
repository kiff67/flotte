import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Boat } from "../types";
import { TopBar } from "../components/TopBar";

export function TechnicianHome() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<Boat[]>("/boats")
      .then((data) => setBoats(data.filter((b) => b.actif)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => boats.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())),
    [boats, query]
  );

  return (
    <div className="screen">
      <TopBar title="Choisir un bateau" />
      <div className="screen-content">
        <input
          className="input search-input"
          placeholder="Rechercher un bateau..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <p className="muted">Chargement...</p>}
        <ul className="boat-list">
          {filtered.map((boat) => (
            <li key={boat.id}>
              <button className="boat-card" onClick={() => navigate(`/intervention/nouvelle/${boat.id}`)}>
                <div>
                  <div className="boat-name">{boat.name}</div>
                  <div className="muted">
                    {boat.model ?? "Modèle non renseigné"} · {boat.heures_moteur_actuelles} h moteur
                  </div>
                </div>
                <span className="chevron">›</span>
              </button>
            </li>
          ))}
        </ul>
        {!loading && filtered.length === 0 && <p className="muted">Aucun bateau trouvé.</p>}
      </div>
    </div>
  );
}
