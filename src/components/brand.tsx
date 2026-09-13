import { ChartNoAxesCombined } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <span className="brand-mark">
        <ChartNoAxesCombined size={23} strokeWidth={3} />
      </span>
      <span>
        AYNI<span className="green">.</span>
      </span>
    </span>
  );
}
