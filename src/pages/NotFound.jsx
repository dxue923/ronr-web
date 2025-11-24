import { Link } from "react-router-dom";
import "../assets/styles/index.css";

// Use the site's home styling (background/typography) but center the
// minimal 404 message in the middle of the viewport.
export default function NotFound() {
  return (
    <div className="home-page not-found-page">
        <header className="home-header">
            <h1 className="home-title">e-motions</h1>
        </header>
      <main className="notfound-main">
        <div className="home-hero">
          <h1 className="home-description">Uh-oh, the page you're looking for is not found, please check the URL and try again!</h1>
          <div style={{ marginTop: 30 }}>
            <Link to="/" className="btn btn-primary">
              Go home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
