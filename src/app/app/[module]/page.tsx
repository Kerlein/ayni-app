import { Construction } from "@/components/construction";
import { notFound } from "next/navigation";
const names: Record<string, string> = {
  evaluacion: "Evaluación crediticia",
  compras: "Gestión de compras",
  pagos: "Gestión de pagos",
  comercios: "Gestión de comercios",
  financiamiento: "Gestión de financiamiento",
};
export default async function Page({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  if (!names[module]) notFound();
  return <Construction module={names[module]} />;
}
