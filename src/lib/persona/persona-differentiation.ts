import { tokenJaccard } from "@/lib/email-generation/personalization";

export const NEAR_DUPLICATE_JACCARD_THRESHOLD = 0.55;

export type PersonaDifferentiationInput = {
  id: string;
  name: string;
  painPoints: string[];
  messagingNotes: string[];
};

export function parsePersonaListField(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function messagingTokens(persona: PersonaDifferentiationInput): Set<string> {
  const tokens = new Set<string>();
  for (const line of [...persona.painPoints, ...persona.messagingNotes]) {
    for (const token of line
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3)) {
      tokens.add(token);
    }
  }
  return tokens;
}

export type NearDuplicatePersonaPair = {
  personaA: PersonaDifferentiationInput;
  personaB: PersonaDifferentiationInput;
  similarity: number;
};

export function findNearDuplicatePersonaPairs(
  personas: PersonaDifferentiationInput[],
  threshold = NEAR_DUPLICATE_JACCARD_THRESHOLD,
): NearDuplicatePersonaPair[] {
  const pairs: NearDuplicatePersonaPair[] = [];
  for (let i = 0; i < personas.length; i += 1) {
    const left = personas[i]!;
    const leftTokens = messagingTokens(left);
    if (leftTokens.size === 0) continue;
    for (let j = i + 1; j < personas.length; j += 1) {
      const right = personas[j]!;
      const rightTokens = messagingTokens(right);
      if (rightTokens.size === 0) continue;
      const similarity = tokenJaccard(leftTokens, rightTokens);
      if (similarity >= threshold) {
        pairs.push({
          personaA: left,
          personaB: right,
          similarity,
        });
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

export function formatNearDuplicateWarning(pair: NearDuplicatePersonaPair): string {
  const pct = Math.round(pair.similarity * 100);
  return `${pair.personaA.name} and ${pair.personaB.name} have very similar pain points and messaging notes (${pct}% overlap). Emails may read the same until you differentiate them.`;
}
