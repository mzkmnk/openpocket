export type ChatQuickAction = {
  id: string;
  label: string;
};

export const quickActions: ChatQuickAction[] = [
  { id: "explain", label: "Explain this code" },
  { id: "optimize", label: "Optimize performance" },
  { id: "tests", label: "Write test cases" },
];
