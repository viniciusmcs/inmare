import {StrictMode, useEffect} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {BrowserRouter, useLocation} from "react-router-dom";
import App from "./App";
import "./styles.css";
const client=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30_000}}});

function ScrollToTop() {
  const {pathname, search} = useLocation();
  useEffect(() => {
    window.scrollTo({top: 0, left: 0, behavior: "auto"});
  }, [pathname, search]);
  return null;
}

createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><ScrollToTop/><App/></BrowserRouter></QueryClientProvider></StrictMode>);
