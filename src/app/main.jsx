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
  // After Auth0 handles ?code=&state=, clean up the URL
  window.history.replaceState(
    {},
    document.title,
    appState?.returnTo || "/create-committee"
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin + "/create-committee",
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
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
