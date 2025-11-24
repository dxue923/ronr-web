import { Routes, Route, useLocation, Navigate, Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Chat from "../pages/Chat";
import EditProfile from "../pages/EditProfile";
import CreateCommittee from "../pages/CreateCommittee";
import SignIn from "../pages/SignIn";
import SignUp from "../pages/SignUp";
import Home from "../pages/Home";
import RequireAuth from "../components/RequireAuth";
import NotFound from "../pages/NotFound";

export default function App() {
  // Layout that includes the navbar and renders nested routes via Outlet.
  function MainLayout() {
    return (
      <>
        <Navbar />
        <main className="main-content">
          <Outlet />
        </main>
      </>
    );
  }

  return (
    <Routes>
      {/* Routes wrapped by MainLayout will show the Navbar */}
      <Route element={<MainLayout />}>
        {/* Protected: discussion and committee chat require login */}
        <Route
          path="/discussion"
          element={<RequireAuth><Chat /></RequireAuth>}
        />
        <Route
          path="/committees/:id/chat"
          element={<RequireAuth><Chat /></RequireAuth>}
        />

        {/* Creating committees and editing profile require login */}
        <Route
          path="/create-committee"
          element={<RequireAuth><CreateCommittee /></RequireAuth>}
        />

        <Route
          path="/edit-profile"
          element={<RequireAuth><EditProfile /></RequireAuth>}
        />
      </Route>

  {/* Public routes (no navbar) */}
  <Route path="/" element={<Home />} />
  <Route path="/signin" element={<SignIn />} />
  <Route path="/signup" element={<SignUp />} />

      {/* Catch-all 404 for unknown routes (renders without navbar) */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
