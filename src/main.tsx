import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { Buffer } from 'buffer';

// Providencia o polyfill do Buffer para compatibilidade com bibliotecas Node.js no navegador
window.Buffer = Buffer;

createRoot(document.getElementById("root")!).render(<App />);