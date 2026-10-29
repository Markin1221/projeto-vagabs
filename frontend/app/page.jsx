import { redirect } from "next/navigation";

// A raiz abre a primeira ferramenta.
export default function Inicio() {
  redirect("/folha");
}
