import { formatarMoeda } from "@/lib/format";

export function ResumoTopo({
  totalAsaas,
  totalGranatum,
  conciliadosAsaas,
  conciliadosGranatum,
  pendentesAsaas,
  pendentesGranatum,
}: {
  totalAsaas: number;
  totalGranatum: number;
  conciliadosAsaas: number;
  conciliadosGranatum: number;
  pendentesAsaas: number;
  pendentesGranatum: number;
}) {
  const diferenca = totalAsaas - totalGranatum;
  const itens = [
    { rotulo: "Total Asaas", valor: formatarMoeda(totalAsaas) },
    { rotulo: "Total Granatum", valor: formatarMoeda(totalGranatum) },
    {
      rotulo: "Diferença",
      valor: formatarMoeda(diferenca),
      destaque: Math.abs(diferenca) > 0.005,
    },
    { rotulo: "Conciliados", valor: `${conciliadosAsaas} / ${conciliadosGranatum}` },
    { rotulo: "Pendentes", valor: `${pendentesAsaas} / ${pendentesGranatum}` },
  ];

  return (
    <div className="fade-up grid grid-cols-2 gap-3 md:grid-cols-5">
      {itens.map((i) => (
        <div key={i.rotulo} className="corp-card p-4">
          <p className="lbl">{i.rotulo}</p>
          <p className={`heading mt-1 text-lg ${i.destaque ? "text-primary" : ""}`}>{i.valor}</p>
        </div>
      ))}
    </div>
  );
}
