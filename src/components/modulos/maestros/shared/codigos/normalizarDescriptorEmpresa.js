// Quita tildes de vocales (a/e/i/o/u), preserva la ñ/Ñ (su tilde ~ es una
// marca Unicode distinta a la del acento agudo), quita comas, colapsa
// espacios y pasa todo a mayúsculas.
// Ej: "Balón, 10x50" -> "BALON 10X50"
export const normalizarDescriptorEmpresa = (texto) => {
  if (!texto) return '';

  return texto
    .normalize('NFD')
    .replace(/́/g, '') // combining acute accent (á é í ó ú) — no toca ̃ (~) de la ñ
    .normalize('NFC')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};
