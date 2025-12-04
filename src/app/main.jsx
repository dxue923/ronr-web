import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Auth0Provider } from "@auth0/auth0-react";

import App from "./App";
import "../assets/styles/index.css";
import ErrorBoundary from "../components/ErrorBoundary.jsx";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

const onRedirectCallback = (appState) => {
  // After Auth0 handles ?code=&state=, hard-redirect to target to ensure Router renders the right page
  const target = appState?.returnTo || "/create-committee";
  window.location.replace(target);
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        // Use site root for callback so SDK can process then route via appState
        redirect_uri: window.location.origin,
      }}
      cacheLocation="localstorage"
      onRedirectCallback={onRedirectCallback}
    >
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </Auth0Provider>
  </React.StrictMode>
);
