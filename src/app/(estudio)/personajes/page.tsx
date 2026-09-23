import type { Metadata } from "next";
import { Proximamente } from "@/components/proximamente";
import { Encabezado } from "@/components/ui";

export const metadata: Metadata = { title: "Personajes" };

export default function Personajes() {
  return (
    <>
      <Encabezado titulo="Personajes" />
      <Proximamente fase={4} titulo="Personajes consistentes">
        Fichas con rasgos, proporciones, paleta y vestuario base, más imágenes de referencia que el motor adjunta solo al generar con el caso de uso de personaje consistente.
      </Proximamente>
    </>
  );
}
