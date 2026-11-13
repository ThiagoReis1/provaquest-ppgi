export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
