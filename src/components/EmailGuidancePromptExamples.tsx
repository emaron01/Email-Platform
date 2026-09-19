const EXAMPLES = [
  "Focus on the feature that removes the most manual work.",
  "Emphasize faster decisions as the main outcome.",
  "Lead with the upcoming deadline.",
  "Highlight the newest capability.",
  "Leave out pricing and implementation details.",
  "Use a more direct tone and ask for a reply instead of a meeting.",
] as const;

export function EmailGuidancePromptExamples() {
  return (
    <details className="mt-1 text-xs text-slate-500">
      <summary className="w-fit cursor-pointer font-medium text-slate-600">
        Prompt examples
      </summary>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {EXAMPLES.map((example) => (
          <li key={example}>“{example}”</li>
        ))}
      </ul>
    </details>
  );
}
