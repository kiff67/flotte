import { useAuth } from "../auth/AuthContext";

export function TopBar({ title, back }: { title: string; back?: () => void }) {
  const { user, logout } = useAuth();
  return (
    <header className="top-bar">
      {back ? (
        <button className="icon-btn" onClick={back} aria-label="Retour">
          ←
        </button>
      ) : (
        <div className="icon-btn-placeholder" />
      )}
      <h1>{title}</h1>
      <button className="icon-btn" onClick={logout} aria-label="Déconnexion" title={user?.name}>
        ⎋
      </button>
    </header>
  );
}
