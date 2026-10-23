"use client";
import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";

const Ctx = createContext({ dicas: true, setDicas: () => {} });
const CHAVE = "vagabs-dicas";

// Preferências da pessoa, guardadas neste navegador (localStorage): valem toda vez que o sistema abrir.
export function ConfigProvider({ children }) {
  const [dicas, setDicasEstado] = useState(true);
  useEffect(() => { try { const v = localStorage.getItem(CHAVE); if (v !== null) setDicasEstado(v === "1"); } catch {} }, []);
  const setDicas = useCallback((v) => { setDicasEstado(v); try { localStorage.setItem(CHAVE, v ? "1" : "0"); } catch {} }, []);
  return createElement(Ctx.Provider, { value: { dicas, setDicas } }, children);
}
export const useConfig = () => useContext(Ctx);
