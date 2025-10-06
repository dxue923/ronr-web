import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="navbar">
      <ul>
        <li>
          <Link to="/">Chat</Link>
        </li>
        <li>
          <Link to="/edit-profile">Edit Profile</Link>
        </li>
        <li>
          <Link to="/signin">Sign In</Link>
        </li>
      </ul>
    </nav>
  );
}
