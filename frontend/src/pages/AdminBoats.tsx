import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Boat } from "../types";
import { TopBar } from "../components/TopBar";

export function AdminBoats() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Boat>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api
      .get<Boat[]>("/boats")
      .then(setBoats)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startEdit(boat: Boat) {
    setEditingId(boat.id);
    setForm({ ...boat });
    setError(null);
  }

  async function save() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/boats/${editingId}`, {
        name: form.name,
        model: form.model || undefined,
        immatriculation: form.immatriculation || undefined,
        port_attache: form.port_attache || undefined,
        heures_moteur_actuelles: form.heures_moteur_actuelles !== undefined ? Number(form.heures_moteur_actuelles) : undefined,
        actif: Boolean(form.actif),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title="Gestion des bateaux" />
      <div className="screen-content">
        {loading && <p className="muted">Chargement...</p>}
        <ul className="boat-admin-list">
          {boats.map((boat) => (
            <li key={boat.id} className="boat-admin-item">
              {editingId === boat.id ? (
                <div className="boat-edit-form">
                  <div className="field">
                    <label>Nom</label>
                    <input className="input" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Modèle</label>
                    <input className="input" value={form.model ?? ""} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Immatriculation</label>
                    <input
                      className="input"
                      value={form.immatriculation ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, immatriculation: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Port d'attache</label>
                    <input
                      className="input"
                      value={form.port_attache ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, port_attache: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Heures moteur actuelles</label>
                    <input
                      className="input"
                      type="number"
                      value={form.heures_moteur_actuelles ?? 0}
                      onChange={(e) => setForm((f) => ({ ...f, heures_moteur_actuelles: Number(e.target.value) }))}
                    />
                  </div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={Boolean(form.actif)}
                      onChange={(e) => setForm((f) => ({ ...f, actif: e.target.checked ? 1 : 0 }))}
                    />
                    Bateau actif
                  </label>
                  {error && <p className="error-text">{error}</p>}
                  <div className="button-row">
                    <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                      Annuler
                    </button>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <button className="boat-card" onClick={() => startEdit(boat)}>
                  <div>
                    <div className="boat-name">
                      {boat.name} {!boat.actif && <span className="muted">(inactif)</span>}
                    </div>
                    <div className="muted">
                      {boat.model ?? "Modèle non renseigné"} · {boat.heures_moteur_actuelles} h
                      {Boolean(boat.interventions_en_attente) && (
                        <span className="pill-warning"> · {boat.interventions_en_attente} en attente</span>
                      )}
                    </div>
                  </div>
                  <span className="chevron">✎</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
