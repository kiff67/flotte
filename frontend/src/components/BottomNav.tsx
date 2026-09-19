import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;

  const links =
    user.role === "admin"
      ? [
          { to: "/admin", label: "Validation", icon: "✅" },
          { to: "/admin/bateaux", label: "Bateaux", icon: "⛵" },
          { to: "/admin/comptes", label: "Comptes", icon: "👤" },
        ]
      : [
          { to: "/", label: "Bateaux", icon: "⛵" },
          { to: "/historique", label: "Historique", icon: "🕘" },
        ];

  return (
    <nav className="bottom-nav">
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} end className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
          <span className="nav-icon">{l.icon}</span>
          <span>{l.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
