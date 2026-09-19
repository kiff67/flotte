import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Intervention } from "../types";
import { TopBar } from "../components/TopBar";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../auth/AuthContext";

export function InterventionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [loading, setLoading] = useState(true);
  const [valeur, setValeur] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    if (!id) return;
    api
      .get<Intervention>(`/interventions/${id}`)
      .then((data) => {
        setIntervention(data);
        setValeur(data.valeur !== null ? String(data.valeur) : "");
        setCommentaire(data.commentaire_validation ?? "");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  const piecesTotal = intervention?.pieces.reduce((sum, p) => sum + (p.prix_unitaire ?? 0) * p.quantite, 0) ?? 0;

  async function handleValider() {
    if (!id) return;
    const v = Number(valeur);
    if (Number.isNaN(v) || v < 0) {
      setError("Merci d'indiquer un montant valide");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/interventions/${id}/valider`, { valeur: v, commentaire_validation: commentaire || undefined });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la validation");
    } finally {
      setSaving(false);
    }
  }

  async function handleRejeter() {
    if (!id) return;
    if (!commentaire.trim()) {
      setError("Merci d'indiquer le motif du refus dans le commentaire");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/interventions/${id}/rejeter`, { commentaire_validation: commentaire });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors du refus");
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

  if (!intervention) {
    return (
      <div className="screen">
        <TopBar title="Intervention" back={() => navigate(-1)} />
        <div className="screen-content">
          <p className="muted">Intervention introuvable.</p>
        </div>
      </div>
    );
  }

  const canEdit = user?.role === "technicien" && intervention.technician_id === user.id && intervention.statut === "en_attente";
  const canValidate = user?.role === "admin" && intervention.statut === "en_attente";

  return (
    <div className="screen">
      <TopBar title={intervention.boat_name} back={() => navigate(-1)} />
      <div className="screen-content">
        <div className="detail-header">
          <StatusBadge statut={intervention.statut} />
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => navigate(`/intervention/${intervention.id}/modifier`)}>
              Modifier
            </button>
          )}
        </div>

        <dl className="detail-list">
          <dt>Date</dt>
          <dd>{new Date(intervention.date_intervention).toLocaleDateString("fr-FR")}</dd>
          <dt>Heures moteur</dt>
          <dd>{intervention.heures_moteur} h</dd>
          <dt>Technicien</dt>
          <dd>{intervention.technician_name}</dd>
          <dt>Description</dt>
          <dd className="pre-wrap">{intervention.description}</dd>
        </dl>

        <h3>Pièces utilisées</h3>
        {intervention.pieces.length === 0 && <p className="muted">Aucune pièce renseignée.</p>}
        {intervention.pieces.length > 0 && (
          <table className="parts-table">
            <thead>
              <tr>
                <th>Pièce</th>
                <th>Qté</th>
                <th>Prix unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {intervention.pieces.map((p, i) => (
                <tr key={i}>
                  <td>{p.nom}</td>
                  <td>{p.quantite}</td>
                  <td>{p.prix_unitaire != null ? `${p.prix_unitaire.toFixed(2)} €` : "-"}</td>
                  <td>{p.prix_unitaire != null ? `${(p.prix_unitaire * p.quantite).toFixed(2)} €` : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total pièces (indicatif)</td>
                <td>{piecesTotal.toFixed(2)} €</td>
              </tr>
            </tfoot>
          </table>
        )}

        {intervention.statut !== "en_attente" && (
          <div className="validation-summary">
            <h3>{intervention.statut === "validee" ? "Validation" : "Refus"}</h3>
            {intervention.valeur != null && <p>Valeur : <strong>{intervention.valeur.toFixed(2)} €</strong></p>}
            {intervention.commentaire_validation && <p className="muted">{intervention.commentaire_validation}</p>}
            <p className="muted">
              Par {intervention.validated_by_name} le{" "}
              {intervention.validated_at && new Date(intervention.validated_at).toLocaleDateString("fr-FR")}
            </p>
          </div>
        )}

        {canValidate && (
          <div className="validation-form">
            <h3>Validation & valorisation</h3>
            <div className="field">
              <label>Valeur de l'intervention (€)</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={valeur}
                onChange={(e) => setValeur(e.target.value)}
                placeholder={piecesTotal > 0 ? `Suggestion (pièces) : ${piecesTotal.toFixed(2)}` : ""}
              />
            </div>
            <div className="field">
              <label>Commentaire (optionnel pour validation, obligatoire pour refus)</label>
              <textarea className="input" rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="button-row">
              <button className="btn btn-danger" onClick={handleRejeter} disabled={saving}>
                Refuser
              </button>
              <button className="btn btn-primary" onClick={handleValider} disabled={saving}>
                Valider
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
