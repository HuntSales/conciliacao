import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hojeIso, inicioMesIso, inicioSemanaIso } from "@/lib/format";

export type Periodo = { dataInicio: string; dataFim: string; toleranciaDias: number };

const atalhos: Array<{ rotulo: string; aplicar: () => { dataInicio: string; dataFim: string } }> = [
  { rotulo: "Hoje", aplicar: () => ({ dataInicio: hojeIso(), dataFim: hojeIso() }) },
  { rotulo: "Esta semana", aplicar: () => ({ dataInicio: inicioSemanaIso(), dataFim: hojeIso() }) },
  { rotulo: "Este mês", aplicar: () => ({ dataInicio: inicioMesIso(), dataFim: hojeIso() }) },
];

export function FiltroPeriodo({
  periodo,
  onMudar,
  onBuscar,
  buscando,
}: {
  periodo: Periodo;
  onMudar: (p: Periodo) => void;
  onBuscar: () => void;
  buscando: boolean;
}) {
  return (
    <div className="corp-card fade-up flex flex-wrap items-end gap-4 p-5">
      <div className="flex flex-wrap gap-2">
        {atalhos.map((a) => (
          <Button
            key={a.rotulo}
            type="button"
            variant="corpOutline"
            size="sm"
            onClick={() => onMudar({ ...periodo, ...a.aplicar() })}
          >
            {a.rotulo}
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="lbl">De</Label>
          <Input
            type="date"
            value={periodo.dataInicio}
            onChange={(e) => onMudar({ ...periodo, dataInicio: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="lbl">Até</Label>
          <Input
            type="date"
            value={periodo.dataFim}
            onChange={(e) => onMudar({ ...periodo, dataFim: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="lbl">Tolerância (dias)</Label>
          <Input
            type="number"
            min={0}
            max={3}
            className="w-20"
            value={periodo.toleranciaDias}
            onChange={(e) => onMudar({ ...periodo, toleranciaDias: Number(e.target.value) })}
          />
        </div>
      </div>
      <Button variant="corp" onClick={onBuscar} disabled={buscando} className="ml-auto">
        {buscando ? "Buscando" : "Buscar lançamentos"}
      </Button>
    </div>
  );
}
