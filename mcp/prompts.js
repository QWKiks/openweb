export const PROMPTS = [
  {
    name: "extract_and_summarize",
    description: "Extract page content as markdown and produce a structured summary",
    arguments: [
      { name: "detail", description: "Summary detail level: 'brief', 'normal', 'detailed'", required: false },
    ],
  },
  {
    name: "fill_form_and_submit",
    description: "Complete a multi-field form and submit it — use when the user asks to fill a form with multiple fields",
    arguments: [
      { name: "formDescription", description: "What the form is for (e.g. 'login', 'registration', 'search')", required: true },
    ],
  },
  {
    name: "check_accessibility",
    description: "Run an accessibility audit and report findings for the current page",
    arguments: [
      { name: "severity", description: "Minimum severity to report: 'error', 'warning', 'notice'", required: false },
    ],
  },
  {
    name: "extract_data",
    description: "Extract structured data from the current page (tables, lists, key-value pairs)",
    arguments: [
      { name: "target", description: "What to extract: 'tables', 'lists', 'all'", required: false },
    ],
  },
  {
    name: "analyze_form",
    description: "Analyze forms on the current page and suggest fill values",
    arguments: [],
  },
];
