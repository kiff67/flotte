import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Boat, Intervention, InterventionPart, PartSuggestion } from "../types";
import { TopBar } from "../components/TopBar";
import { AutocompleteInput } from "../components/AutocompleteInput";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface DraftState {
  date_intervention: string;
  heures_moteur: string;
  duree_heures: string;
  description: string;
  pieces: InterventionPart[];
}

function draftKey(boatId: string) {
  return `flotte_draft_${boatId}`;
}

export function InterventionForm() {
  const { boatId, id } = useParams<{ boatId?: string; id?: string }>();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [boat, setBoat] = useState<Boat | null>(null);
  const [effectiveBoatId, setEffectiveBoatId] = useState<string | undefined>(boatId);
  const [date, setDate] = useState(todayISO());
  const [heures, setHeures] = useState("");
  const [duree, setDuree] = useState("");
  const [description, setDescription] = useState("");
  const [pieces, setPieces] = useState<InterventionPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (editing && id) {
        const intervention = await api.get<Intervention>(`/interventions/${id}`);
        setEffectiveBoatId(intervention.boat_id);
        setDate(intervention.date_intervention.slice(0, 10));
        setHeures(String(intervention.heures_moteur));
        setDuree(String(intervention.duree_heures));
        setDescription(intervention.description);
        setPieces(intervention.pieces.map((p) => ({ ...p })));
        const b = await api.get<Boat>(`/boats/${intervention.boat_id}`);
        setBoat(b);
      } else if (boatId) {
        const b = await api.get<Boat>(`/boats/${boatId}`);
        setBoat(b);
        const draftRaw = localStorage.getItem(draftKey(boatId));
        if (draftRaw) {
          const draft: DraftState = JSON.parse(draftRaw);
          setDate(draft.date_intervention);
          setHeures(draft.heures_moteur);
          setDuree(draft.duree_heures ?? "");
          setDescription(draft.description);
          setPieces(draft.pieces);
        } else {
          setHeures(String(b.heures_moteur_actuelles ?? ""));
        }
      }
      setLoading(false);
    }
    load();
  }, [boatId, id, editing]);

  useEffect(() => {
    if (editing || !boatId || loading) return;
    const draft: DraftState = { date_intervention: date, heures_moteur: heures, duree_heures: duree, description, pieces };
    localStorage.setItem(draftKey(boatId), JSON.stringify(draft));
  }, [date, heures, duree, description, pieces, boatId, editing, loading]);

  function addPiece() {
    setPieces((prev) => [...prev, { nom: "", quantite: 1 }]);
  }

  function updatePiece(index: number, patch: Partial<InterventionPart>) {
    setPieces((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePiece(index: number) {
    setPieces((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!effectiveBoatId) return;
    const heuresNum = Number(heures);
    if (Number.isNaN(heuresNum) || heuresNum < 0) {
      setError("Merci d'indiquer un nombre d'heures moteur valide");
      return;
    }
    const dureeNum = Number(duree);
    if (Number.isNaN(dureeNum) || dureeNum < 0) {
      setError("Merci d'indiquer une durée d'intervention valide");
      return;
    }
    if (!description.trim()) {
      setError("Merci de décrire l'intervention");
      return;
    }
    const validPieces = pieces
      .filter((p) => p.nom.trim())
      .map((p) => ({
        nom: p.nom.trim(),
        reference: p.reference || undefined,
        quantite: Number(p.quantite) || 1,
        prix_unitaire: p.prix_unitaire !== undefined && p.prix_unitaire !== null ? Number(p.prix_unitaire) : undefined,
      }));

    setSaving(true);
    try {
      const payload = {
        boat_id: effectiveBoatId,
        date_intervention: date,
        heures_moteur: heuresNum,
        duree_heures: dureeNum,
        description: description.trim(),
        pieces: validPieces,
      };
      if (editing && id) {
        await api.patch(`/interventions/${id}`, payload);
      } else {
        await api.post("/interventions", payload);
        if (boatId) localStorage.removeItem(draftKey(boatId));
      }
      navigate("/historique", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer l'intervention");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <TopBar title="Intervention" back={() => navigate(-1)} />
        <div className="screen-content">
          <p className="muted">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title={editing ? "Modifier l'intervention" : "Nouvelle intervention"} back={() => navigate(-1)} />
      <div className="screen-content">
        {boat && (
          <div className="boat-banner">
            <strong>{boat.name}</strong>
            <span className="muted"> · dernier relevé {boat.heures_moteur_actuelles} h</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="intervention-form">
          <div className="field">
            <label>Date d'intervention</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="field">
            <label>Heures moteur au moment de l'intervention</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={heures}
              onChange={(e) => setHeures(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>Durée de l'intervention (heures)</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              placeholder="Ex : 1.5"
              value={duree}
              onChange={(e) => setDuree(e.target.value)}
              required
            />
          </div>

          <AutocompleteInput
            label="Description de l'intervention"
            value={description}
            onChange={setDescription}
            textarea
            placeholder="Ex : Vidange moteur, remplacement anode..."
            fetchSuggestions={(q) => api.get<string[]>(`/interventions/suggestions/descriptions?q=${encodeURIComponent(q)}`)}
            getLabel={(s) => s}
            onSelect={(s) => setDescription(s)}
          />

          <div className="field">
            <label>Pièces utilisées</label>
            {pieces.map((piece, index) => (
              <div className="part-row" key={index}>
                <AutocompleteInput
                  value={piece.nom}
                  onChange={(v) => updatePiece(index, { nom: v })}
                  placeholder="Nom de la pièce"
                  fetchSuggestions={(q) => api.get<PartSuggestion[]>(`/interventions/suggestions/pieces?q=${encodeURIComponent(q)}`)}
                  getLabel={(s) => s.nom}
                  renderItem={(s) => (
                    <span>
                      {s.nom} {s.reference ? <span className="muted">({s.reference})</span> : null}
                    </span>
                  )}
                  onSelect={(s) =>
                    updatePiece(index, {
                      nom: s.nom,
                      reference: s.reference ?? undefined,
                      prix_unitaire: s.prix_unitaire_defaut ?? undefined,
                    })
                  }
                />
                <input
                  className="input part-qty"
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="Qté"
                  value={piece.quantite}
                  onChange={(e) => updatePiece(index, { quantite: Number(e.target.value) })}
                />
                <button type="button" className="icon-btn danger" onClick={() => removePiece(index)} aria-label="Retirer">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-block" onClick={addPiece}>
              + Ajouter une pièce
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            {saving ? "Enregistrement..." : editing ? "Enregistrer les modifications" : "Envoyer pour validation"}
          </button>
        </form>
      </div>
    </div>
  );
}
