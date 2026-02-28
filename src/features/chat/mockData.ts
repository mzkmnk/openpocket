export type ChatQuickAction = {
  id: string;
  label: string;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  author: string;
  time: string;
  body: string;
  code?: {
    fileName: string;
    language: string;
    snippet: string;
  };
};

export const quickActions: ChatQuickAction[] = [
  { id: "explain", label: "Explain this code" },
  { id: "optimize", label: "Optimize performance" },
  { id: "tests", label: "Write test cases" },
];

export const mockMessages: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    author: "OpenClaw",
    time: "10:23 AM",
    body: "Hello! I'm ready to help you with your code. What are we working on today?",
  },
  {
    id: "user-1",
    role: "user",
    author: "You",
    time: "10:24 AM",
    body: "I need a Python script to sort a list of dictionaries by a specific key.",
  },
  {
    id: "assistant-2",
    role: "assistant",
    author: "OpenClaw",
    time: "10:25 AM",
    body:
      "Certainly. You can use the built-in sorted() function combined with a lambda key. " +
      "Here is a clear example:",
    code: {
      fileName: "python_sort.py",
      language: "python",
      snippet:
        'def sort_dictionaries(data, key):\n' +
        '    """Sorts a list of dicts by a key."""\n' +
        "    return sorted(data, key=lambda x: x[key])\n\n" +
        "# Example Usage\n" +
        "users = [\n" +
        '    {"name": "Alice", "age": 30},\n' +
        '    {"name": "Bob", "age": 25}\n' +
        "]\n\n" +
        'sorted_users = sort_dictionaries(users, "age")\n' +
        "print(sorted_users)",
    },
  },
];
