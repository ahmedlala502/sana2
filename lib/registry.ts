import type { Plugin, Skill } from "./types";

/**
 * Skills are prompt-level capabilities. A skill can contribute a system-prompt
 * fragment (always-on behaviour when enabled) and/or a slash command that loads
 * a template into the composer.
 */
export const SKILLS: Skill[] = [
  {
    id: "pmo-tracker",
    pluginId: "campaign-ops",
    name: "WhatsApp to PMO tracker",
    description: "Turn a raw chat thread into an owned, dated tracker.",
    command: "/tracker",
    icon: "ListChecks",
    template:
      "Below is a raw WhatsApp thread from a live campaign. Turn it into a PMO tracker.\n\nOutput a markdown table with: Item | Owner | Status | Due date | Blocker | Next action. After the table, list open decisions that still need a call, and flag anything with no clear owner.\n\n---\n[PASTE THE THREAD HERE]",
  },
  {
    id: "activation-plan",
    pluginId: "campaign-ops",
    name: "Campaign brief to client plan",
    description: "Rough brief in, client-ready activation plan out.",
    command: "/plan",
    icon: "Target",
    template:
      "Turn the brief below into a client-ready influencer activation plan.\n\nStructure: 1) Objective and success definition 2) Audience and market 3) Influencer tiers with counts and rationale 4) Content deliverables per tier 5) Timeline with milestones 6) KPIs with targets 7) Budget in [EGP/SAR/AED/KWD], state the scale 8) Risks and mitigations.\n\n---\n[PASTE THE BRIEF HERE]",
  },
  {
    id: "qa-checklist",
    pluginId: "campaign-ops",
    name: "Influencer QA checklist",
    description: "Pre-launch go / no-go checks with owners and cutoffs.",
    command: "/qa",
    icon: "ShieldCheck",
    template:
      "Build a pre-launch QA checklist for an influencer activation in [MARKET].\n\nCover: creator vetting, contract and usage rights, brief sign-off, content approval flow, disclosure and local ad rules, tracking links and UTM setup, payment terms, and go-live checks. For each item give the owner and the cutoff (days before launch). End with three hard stops that block go-live.",
  },
  {
    id: "weekly-report",
    pluginId: "campaign-ops",
    name: "Weekly performance report",
    description: "Numbers in, stakeholder-ready report out.",
    command: "/report",
    icon: "TrendingUp",
    template:
      "Write the weekly performance report from the data below.\n\nStructure: headline (2 lines, what a director needs to know), KPI table vs target, what moved and why, what is at risk with the mitigation and owner, and next week's focus with owners. Absolute values, not percentages, unless a percentage is the clearer read. Money in [CURRENCY], state the scale.\n\n---\n[PASTE THE DATA HERE]",
  },
  {
    id: "escalation",
    pluginId: "process-kit",
    name: "Escalation matrix",
    description: "S1-S4 severities, owners, response and resolution targets.",
    command: "/escalate",
    icon: "Siren",
    template:
      "Draft an escalation matrix for [PROCESS / CLIENT].\n\nSeverity levels S1 to S4 with a plain-language definition and a real example each. For every level: first responder, escalation owner, response time, resolution target, and communication channel. End with the three triggers that force an immediate S1 regardless of who spots it.",
  },
  {
    id: "sop",
    pluginId: "process-kit",
    name: "Onboarding SOP",
    description: "Repeatable process doc with quality gates.",
    command: "/sop",
    icon: "BookOpen",
    template:
      "Write an onboarding SOP for [ROLE / CLIENT / VENDOR].\n\nStructure: purpose, scope, roles involved, step-by-step process with owner and duration per step, required inputs and where they live, quality gates, common failure modes and how to catch them, and a day-1 / week-1 / day-30 checklist. Keep it usable by someone who has never done it before.",
  },
  {
    id: "actions",
    pluginId: "process-kit",
    name: "Meeting notes to actions",
    description: "Notes in, owners and dates out. Never invents an owner.",
    command: "/actions",
    icon: "CheckSquare",
    template:
      "Extract the action items from these meeting notes.\n\nOutput a table: Action | Owner | Due date | Dependency. Then list decisions made, and separately list questions raised that were never answered. If an owner or date was never stated, write UNASSIGNED rather than guessing.\n\n---\n[PASTE THE NOTES HERE]",
  },
  {
    id: "vision-read",
    pluginId: "campaign-ops",
    name: "Screenshot to data",
    description: "Read a dashboard image into a clean table. Vision models only.",
    command: "/read",
    icon: "ScanEye",
    template:
      "Read the attached screenshot and pull out every number you can see into a clean markdown table. Note the date range and the metric definitions if they are visible. Flag anything that looks inconsistent or that you had to guess at.",
  },
  {
    id: "ops-voice",
    pluginId: "core",
    name: "Ops voice",
    description:
      "Always-on: direct and structured, KPIs defined, owners and cadence attached, money labelled by currency.",
    icon: "Compass",
    system:
      "Be direct, structured and execution-focused. Define KPIs clearly. Every plan carries owners, cadence and next steps. Label money in EGP/SAR/AED/KWD and state the scale. Prefer absolute values unless a percentage is asked for. No filler, no hedging.",
  },
  {
    id: "visual-out",
    pluginId: "core",
    name: "Visual output",
    description:
      "Always-on: renders charts, diagrams and pages into the visual panel instead of describing them.",
    icon: "LayoutDashboard",
    system:
      "When a table, chart, diagram or page would communicate better than prose, output it as a fenced code block the canvas can render: ```html for a self-contained page or chart (inline all CSS/JS, no external requests), ```svg for a diagram, ```mermaid for a flow or sequence. Keep it self-contained and readable on a dark background.",
  },
  {
    id: "tool-use",
    pluginId: "core",
    name: "Tool discipline",
    description:
      "Always-on: use connected MCP tools when they can answer, and say which tool produced what.",
    icon: "Wrench",
    system:
      "You have access to tools from connected MCP servers. Use them when they can answer a question more reliably than your own knowledge. State which tool produced a result. Never invent tool output.",
  },
  {
    id: "ad-script",
    pluginId: "campaign-ops",
    name: "Ad script split",
    description: "One brief in, platform-ready ad copy variants out.",
    command: "/ad",
    icon: "Scissors",
    template:
      "Split the campaign brief below into short-form ad scripts for Meta, TikTok and YouTube Shorts. For each: hook (first 3s), body, CTA, and on-screen text. Keep them native to the platform tone.",
  },
  {
    id: "hooks",
    pluginId: "campaign-ops",
    name: "Hook variants",
    description: "Attention-first openers for reels, stories and UGC.",
    command: "/hooks",
    icon: "Zap",
    template:
      "Generate 12 hook variants for the product and audience below. Mix pain, curiosity and social proof. Keep each hook under 8 words so it works as a headline or a reel open.",
  },
  {
    id: "replies",
    pluginId: "campaign-ops",
    name: "Comment reply bank",
    description: "Pre-written, on-brand replies for common comments.",
    command: "/replies",
    icon: "MessageCircle",
    template:
      "Build a comment reply bank for the brand and campaign below. Cover: praise, price question, shipping question, complaint, DM request, negative comment. Tone should match the brand voice. Output in a table: Trigger | Reply.",
  },
  {
    id: "raci",
    pluginId: "process-kit",
    name: "RACI builder",
    description: "Clear ownership for any process or project.",
    command: "/raci",
    icon: "Users",
    template:
      "Build a RACI matrix for the process below. Columns: Activity | R (Accountable) | A (Approver) | C (Consulted) | I (Informed). Keep it tight enough to actually use.",
  },
  {
    id: "postmortem",
    pluginId: "process-kit",
    name: "Post-mortem",
    description: "Structured retrospective with root cause and fixes.",
    command: "/postmortem",
    icon: "FileWarning",
    template:
      "Write a post-mortem from the incident notes below. Structure: timeline, blast radius, root cause, what went well, what broke, remediation (immediate + preventive), and action items with owners and due dates.",
  },
  {
    id: "runbook",
    pluginId: "process-kit",
    name: "Runbook",
    description: "Step-by-step playbook with handoffs and rollback.",
    command: "/runbook",
    icon: "BookCheck",
    template:
      "Write a runbook for the task below. Include: pre-checks, step-by-step instructions, expected outputs, common failure modes, rollback steps, and escalation contact.",
  },
  {
    id: "brand-voice",
    pluginId: "brand-kit",
    name: "Brand voice checker",
    description: "Score copy against a brand voice profile.",
    command: "/voice",
    icon: "Megaphone",
    template:
      "Score the copy below against this brand voice profile: [tone adjectives], [do / avoid], [audience], [must-include phrases]. Return a 1-5 score per dimension, then a revised version that hits 5.",
  },
  {
    id: "tagline",
    pluginId: "brand-kit",
    name: "Tagline generator",
    description: "Short, ownable positioning lines.",
    command: "/tagline",
    icon: "Palette",
    template:
      "Generate 10 tagline options for the brand below. Mix functional and emotional angles. Keep each under 6 words. Avoid jargon and superlatives like 'best' or 'leading'.",
  },
  {
    id: "palette",
    pluginId: "brand-kit",
    name: "Color palette brief",
    description: "Cohesive palette with usage rules.",
    command: "/palette",
    icon: "Boxes",
    template:
      "Create a color palette brief for the brand below. Provide: primary, secondary, accent, neutral, and a 60-30-10 usage rule. Include accessibility notes (contrast ratios) and a 'do not mix' warning.",
  },
  {
    id: "pi-debrief",
    pluginId: "pi-studio",
    name: "Pi debrief",
    description: "Tight debrief from any raw input or call notes.",
    command: "/debrief",
    icon: "Bot",
    template:
      "Turn the raw input below into a tight debrief: context, objective, constraints, stakeholders, decision to make, and the 3 options with tradeoffs. Be direct.",
  },
  {
    id: "pi-memo",
    pluginId: "pi-studio",
    name: "Decision memo",
    description: "One-page memo with recommendation and rationale.",
    command: "/memo",
    icon: "ClipboardList",
    template:
      "Write a one-page decision memo. Sections: situation, options, recommendation, rationale, risks, next step with owner and date. No fluff.",
  },
  {
    id: "pi-brief",
    pluginId: "pi-studio",
    name: "Build brief",
    description: "Spec-ready brief from a rough idea.",
    command: "/brief",
    icon: "FileText",
    template:
      "Turn the rough idea below into a build brief: goal, user, success metric, scope, non-goals, dependencies, and acceptance criteria. Engineer-ready.",
  },
  {
    id: "pi-critique",
    pluginId: "pi-studio",
    name: "Critique my plan",
    description: "Adversarial review that finds the weak spots.",
    command: "/critique",
    icon: "Wand2",
    template:
      "Critique the plan below. Find the assumptions, the risks, the hidden costs, and the timeline traps. Be adversarial but constructive. End with a go / no-go verdict.",
  },
  {
    id: "pi",
    pluginId: "pi-studio",
    name: "Pi",
    description: "Ask Pi anything - strategy, build, critique.",
    command: "/pi",
    icon: "Brain",
    template:
      "You are Pi, a direct, high-signal operator. Answer the request below with clear structure, explicit tradeoffs, and zero filler. If the request is vague, ask one sharp clarifying question.",
  },
];

export const PLUGINS: Plugin[] = [
  {
    id: "core",
    name: "Core behaviour",
    description: "Voice, visual output and tool discipline. Keep this on.",
    author: "built in",
    skills: ["ops-voice", "visual-out", "tool-use"],
    enabled: true,
  },
  {
    id: "campaign-ops",
    name: "Campaign Ops",
    description:
      "Influencer activation workflows - trackers, plans, QA, reporting, hooks and replies.",
    author: "Trygc",
    skills: [
      "pmo-tracker",
      "activation-plan",
      "qa-checklist",
      "weekly-report",
      "vision-read",
      "ad-script",
      "hooks",
      "replies",
    ],
    enabled: true,
  },
  {
    id: "process-kit",
    name: "Process Kit",
    description: "SOPs, escalation matrices, RACI, runbooks and retros.",
    author: "Trygc",
    skills: ["escalation", "sop", "actions", "raci", "postmortem", "runbook"],
    enabled: true,
  },
  {
    id: "brand-kit",
    name: "Brand Kit",
    description: "Voice, taglines and palette briefs for consistent brands.",
    author: "Pi",
    skills: ["brand-voice", "tagline", "palette"],
    enabled: true,
  },
  {
    id: "pi-studio",
    name: "Pi Studio",
    description: "Strategy, memos and briefs from the agent's own workshop.",
    author: "Pi",
    skills: ["pi-debrief", "pi-memo", "pi-brief", "pi-critique", "pi"],
    enabled: true,
  },
];

export function skillById(id: string) {
  return SKILLS.find((s) => s.id === id);
}

export function commandSkills(enabledPlugins: string[]) {
  return SKILLS.filter(
    (s) => s.command && (!s.pluginId || enabledPlugins.includes(s.pluginId))
  );
}

export function systemFragments(
  enabledPlugins: string[],
  enabledSkills: string[]
) {
  return SKILLS.filter(
    (s) =>
      s.system &&
      enabledSkills.includes(s.id) &&
      (!s.pluginId || enabledPlugins.includes(s.pluginId))
  ).map((s) => s.system as string);
}
