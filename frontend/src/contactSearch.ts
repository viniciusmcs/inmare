export type SearchableContact = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
};

export function normalizeContactSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/y/g, "i")
    .replace(/q/g, "k")
    .replace(/c(?=[aou])/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/(.)\1+/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let diagonal = previous[0];
    previous[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const above = previous[secondIndex];
      previous[secondIndex] = Math.min(
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + 1,
        diagonal + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[second.length];
}

function nameScore(name: string, query: string) {
  const normalizedName = normalizeContactSearch(name);
  if (!query) return 0;
  if (normalizedName === query) return 0;
  if (normalizedName.startsWith(query)) return 1;
  if (normalizedName.includes(query)) return 2;
  const queryTokens = query.split(" ");
  const nameTokens = normalizedName.split(" ");
  let score = 0;
  for (const queryToken of queryTokens) {
    const distances = nameTokens.map((nameToken) => editDistance(nameToken, queryToken));
    const best = Math.min(...distances);
    const tolerance = queryToken.length >= 7 ? 2 : queryToken.length >= 4 ? 1 : 0;
    if (best > tolerance) return Number.POSITIVE_INFINITY;
    score += 3 + best;
  }
  return score;
}

export function rankContactMatches<T extends SearchableContact>(contacts: T[], rawQuery: string) {
  const query = normalizeContactSearch(rawQuery);
  return contacts
    .map((contact) => {
      let score = nameScore(contact.name, query);
      if (query && !Number.isFinite(score)) {
        const details = normalizeContactSearch([contact.phone, contact.email, contact.city].filter(Boolean).join(" "));
        if (details.includes(query)) score = 8;
      }
      return { contact, score };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort((first, second) => first.score - second.score || first.contact.name.localeCompare(second.contact.name, "pt-BR"))
    .map(({ contact }) => contact);
}
