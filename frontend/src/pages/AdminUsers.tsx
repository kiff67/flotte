import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { Role, User } from "../types";
import { TopBar } from "../components/TopBar";

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("technicien");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<User[]>("/users").then(setUsers);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.post("/users", { name, email, password, role });
      setSuccess(`Compte créé pour ${name}`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("technicien");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la création du compte");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title="Comptes utilisateurs" />
      <div className="screen-content">
        <h3>Nouveau compte</h3>
        <form onSubmit={handleSubmit} className="intervention-form">
          <div className="field">
            <label>Nom</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Mot de passe temporaire</label>
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="field">
            <label>Rôle</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="technicien">Technicien</option>
              <option value="admin">Gérant / Admin</option>
            </select>
          </div>
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            Créer le compte
          </button>
        </form>

        <h3>Comptes existants</h3>
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id} className="user-item">
              <div>
                <strong>{u.name}</strong>
                <div className="muted">{u.email}</div>
              </div>
              <span className={`badge badge-${u.role === "admin" ? "validee" : "en_attente"}`}>
                {u.role === "admin" ? "Admin" : "Technicien"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
