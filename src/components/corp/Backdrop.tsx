export function Backdrop({ intensidade = "media" }: { intensidade?: "baixa" | "media" | "alta" }) {
  const escala =
    intensidade === "alta" ? "h-[70vh]" : intensidade === "baixa" ? "h-[30vh]" : "h-[50vh]";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="grid-overlay absolute inset-0" />
      <div
        className={`glow-orange absolute -top-40 left-1/2 w-[900px] -translate-x-1/2 ${escala}`}
      />
      <div className="vinheta absolute inset-0" />
    </div>
  );
}
