export function apenasDigitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

export function mascaraCnpj(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function validarCnpj(valor: string): boolean {
  const cnpj = apenasDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string, pesoInicial: number) => {
    let peso = pesoInicial;
    let soma = 0;
    for (const char of base) {
      soma += Number(char) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = calc(cnpj.slice(0, 12), 5);
  if (dv1 !== Number(cnpj[12])) return false;
  const dv2 = calc(cnpj.slice(0, 13), 6);
  return dv2 === Number(cnpj[13]);
}
