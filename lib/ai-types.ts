export type AIInvestigation = {
  summary: string;
  hypotheses: { cause: string; evidenceLines: number[]; check: string }[];
  missingInformation: string[];
  verification: string[];
  at: string;
  model: string;
};
