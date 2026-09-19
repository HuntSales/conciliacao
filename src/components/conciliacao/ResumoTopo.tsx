import { formatarMoeda } from "@/lib/format";

function Tile({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: "primario" | "gold" | undefined;
}) {
  return (
    <div className="corp-card p-4">
      <p className="lbl">{rotulo}</p>
      <p
        className={`heading mt-1 text-lg ${
          destaque === "primario" ? "text-primary" : destaque === "gold" ? "text-gold" : ""
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

export function ResumoTopo({
  totalAsaas,
  totalGranatum,
  conciliadosAsaas,
  conciliadosGranatum,
  pendentesAsaas,
  pendentesGranatum,
  saldoAsaas,
  saldoGranatum,
  saldoGranatumProjetado,
}: {
  totalAsaas: number;
  totalGranatum: number;
  conciliadosAsaas: number;
  conciliadosGranatum: number;
  pendentesAsaas: number;
  pendentesGranatum: number;
  saldoAsaas: number | null;
  saldoGranatum: number | null;
  saldoGranatumProjetado: number | null;
}) {
  const diferenca = totalAsaas - totalGranatum;
  const faltaConciliar =
    saldoGranatum !== null &&
    saldoGranatumProjetado !== null &&
    Math.abs(saldoGranatumProjetado - saldoGranatum) > 0.005;

  return (
    <div className="space-y-3">
      <div className="fade-up grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile rotulo="Total Asaas" valor={formatarMoeda(totalAsaas)} />
        <Tile rotulo="Total Granatum" valor={formatarMoeda(totalGranatum)} />
        <Tile
          rotulo="Diferença"
          valor={formatarMoeda(diferenca)}
          destaque={Math.abs(diferenca) > 0.005 ? "primario" : undefined}
        />
        <Tile rotulo="Conciliados" valor={`${conciliadosAsaas} / ${conciliadosGranatum}`} />
        <Tile rotulo="Pendentes" valor={`${pendentesAsaas} / ${pendentesGranatum}`} />
      </div>
      <div className="fade-up grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile
          rotulo="Saldo no Asaas"
          valor={saldoAsaas === null ? "—" : formatarMoeda(saldoAsaas)}
        />
        <Tile
          rotulo="Saldo no Granatum"
          valor={saldoGranatum === null ? "—" : formatarMoeda(saldoGranatum)}
        />
        <Tile
          rotulo="Saldo no Granatum após conciliar"
          valor={saldoGranatumProjetado === null ? "—" : formatarMoeda(saldoGranatumProjetado)}
          destaque={faltaConciliar ? "gold" : undefined}
        />
      </div>
    </div>
  );
}
