import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Chat from "../pages/Chat";
import EditProfile from "../pages/EditProfile";
import CreateCommittee from "../pages/CreateCommittee";
import SignIn from "../pages/SignIn";
import CreateAccount from "../pages/CreateAccount";
import Home from "../pages/Home";

export default function App() {
  const location = useLocation();
  const hideNavbarOn = ["/"];
  const showNavbar = !hideNavbarOn.includes(location.pathname);

  return (
    <>
      {showNavbar && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/discussion" element={<Chat />} />
        <Route path="/committees/:id/chat" element={<Chat />} />
        <Route path="/create-committee" element={<CreateCommittee />} />

        <Route path="/edit-profile" element={<EditProfile />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/create-account" element={<CreateAccount />} />
      </Routes>
    </>
  );
}
