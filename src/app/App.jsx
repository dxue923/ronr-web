import { Routes, Route } from "react-router-dom";
import Navbar from "../components/Navbar";
import Chat from "../pages/Chat";
import EditProfile from "../pages/EditProfile";
import SignIn from "../pages/SignIn";
import CreateAccount from "../pages/CreateAccount";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/edit-profile" element={<EditProfile />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/create-account" element={<CreateAccount />} />
        {/* <Route path="/create-committee" element={<CreateCommittee />} /> */}
      </Routes>
    </>
  );
}
