import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { TechnicianHome } from "./pages/TechnicianHome";
import { InterventionForm } from "./pages/InterventionForm";
import { MesInterventions } from "./pages/MesInterventions";
import { InterventionDetail } from "./pages/InterventionDetail";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminBoats } from "./pages/AdminBoats";
import { AdminUsers } from "./pages/AdminUsers";
import { BottomNav } from "./components/BottomNav";

function PrivateArea({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <div className="app-body">{children}</div>
      <BottomNav />
    </>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      {user?.role === "admin" ? (
        <>
          <Route path="/admin" element={<PrivateArea><AdminDashboard /></PrivateArea>} />
          <Route path="/admin/bateaux" element={<PrivateArea><AdminBoats /></PrivateArea>} />
          <Route path="/admin/comptes" element={<PrivateArea><AdminUsers /></PrivateArea>} />
          <Route path="/intervention/:id" element={<PrivateArea><InterventionDetail /></PrivateArea>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<PrivateArea><TechnicianHome /></PrivateArea>} />
          <Route path="/historique" element={<PrivateArea><MesInterventions /></PrivateArea>} />
          <Route path="/intervention/nouvelle/:boatId" element={<PrivateArea><InterventionForm /></PrivateArea>} />
          <Route path="/intervention/:id/modifier" element={<PrivateArea><InterventionForm /></PrivateArea>} />
          <Route path="/intervention/:id" element={<PrivateArea><InterventionDetail /></PrivateArea>} />
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
        </>
      )}
    </Routes>
  );
}
