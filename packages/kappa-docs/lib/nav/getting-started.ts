import { NavSection } from "../types"

export const GettingStartedNav: NavSection[] = [
  {
    title: "Get Started",
    links: [
      { href: "/getting-started", children: "Overview" },
      { href: "/getting-started/installing", children: "Installation" },
      { href: "/getting-started/setup-authentication", children: "Authentication" },
      { href: "/getting-started/quickstart", children: "Your First Task" },
    ],
  },
  {
    title: "Configuration",
    links: [
      {
        href: "/getting-started/using-kappa-for-free",
        children: "Using Kappa for Free",
      },
      { href: "/getting-started/byok", children: "Bring Your Own Key (BYOK)" },
      { href: "/ai-providers", children: "AI Providers" },
      {
        href: "/getting-started/settings",
        children: "Settings",
        subLinks: [
          { href: "/getting-started/settings/auto-approving-actions", children: "Auto-Approving Actions" },
          { href: "/getting-started/settings/sandboxing", children: "Sandboxing" },
          { href: "/getting-started/settings/notifications", children: "Notifications" },
          { href: "/getting-started/settings/keep-awake", children: "Keep Awake" },
        ],
      },
      { href: "/getting-started/adding-credits", children: "Adding Credits" },
{
        href: "/getting-started/cost-controls-and-usage-safeguards",
        children: "Cost Controls and Usage Safeguards",
      },
      {
        href: "/getting-started/environment-variables",
        children: "Environment Variables",
      },
    ],
  },
  {
    title: "Help",
    links: [
      {
        href: "/getting-started/faq",
        children: "FAQ",
        subLinks: [
          { href: "/getting-started/faq/general", children: "General" },
          { href: "/getting-started/faq/setup-and-installation", children: "Setup and Installation" },
          { href: "/getting-started/faq/credits-and-billing", children: "Credits and Billing" },
          { href: "/getting-started/faq/account-and-integration", children: "Account and Integration" },
        ],
      },
      {
        href: "/getting-started/migrating",
        children: "Migrating from Cursor",
      },
      {
        href: "/getting-started/troubleshooting",
        children: "Troubleshooting",
        subLinks: [
          {
            href: "/getting-started/troubleshooting/troubleshooting-extension",
            children: "Extension Troubleshooting",
          },
          {
            href: "/getting-started/troubleshooting/session-database",
            children: "Session Database",
          },
        ],
      },
      {
        href: "/getting-started/using-docs-with-agents",
        children: "Using Docs with Agents",
      },
    ],
  },
]
