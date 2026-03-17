/**
 * myelin — Core types
 *
 * Zero-dependency type definitions for the crystallization engine.
 */

/** Standard event types */
export type EventType = 'timer' | 'message' | 'change' | 'alert' | 'scheduled' | 'startup' | 'custom';

/** Default triage actions (backward compatible) */
export type DefaultAction = 'skip' | 'wake' | 'quick';

/** Action type — defaults to skip/wake/quick, but can be any string via generics */
export type Action = DefaultAction;

/** How the decision was made */
export type Method = 'rule' | 'llm' | 'error' | 'observe' | 'heuristic';

/** An incoming event to be triaged */
export interface TriageEvent {
  type: EventType | string;
  source?: string;
  context?: Record<string, unknown>;
}

/** Result of a triage/process decision */
export interface TriageResult<A extends string = DefaultAction> {
  action: A;
  reason: string;
  method: Method;
  latencyMs: number;
  ruleId?: string;
  /** Optional strategy metadata — carries contextual info about how the decision was made */
  strategy?: {
    name: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  };
}

/** A crystallized rule */
export interface Rule<A extends string = DefaultAction> {
  id: string;
  match: RuleMatch;
  action: A;
  reason: string;
  createdAt: string;
  /** How many times this rule has been applied */
  hitCount: number;
}

/** Conditions for a rule to match */
export interface RuleMatch {
  /** Event type to match (exact or regex pattern) */
  type?: string;
  /** Source to match (exact or regex pattern) */
  source?: string;
  /** Context conditions — values are matched with simple equality or range checks */
  context?: Record<string, MatchCondition>;
}

/** A match condition for a context value */
export type MatchCondition =
  | string | number | boolean           // exact match
  | { lt?: number; lte?: number; gt?: number; gte?: number }  // numeric range
  | { pattern: string }                 // regex pattern
  | { includes: string | number | boolean }   // array contains element
  | { includesAny: (string | number | boolean)[] }  // array contains any of these
  | { includesAll: (string | number | boolean)[] }; // array contains all of these

/** A decision log entry for crystallization analysis */
export interface DecisionLog<A extends string = DefaultAction> {
  ts: string;
  event: TriageEvent;
  action: A;
  reason: string;
  method: Method;
  latencyMs: number;
}

/** A crystallization candidate — a pattern stable enough to become a rule */
export interface CrystallizationCandidate<A extends string = DefaultAction> {
  /** Proposed rule match conditions */
  match: RuleMatch;
  /** The action/output the LLM consistently chose */
  suggestedAction: A;
  /** Human-readable description of the pattern */
  description: string;
  /** How many times this pattern was seen */
  occurrences: number;
  /** Consistency ratio (0-1) — how often the LLM chose the same action */
  consistency: number;
  /** Sample reasons from the LLM decisions */
  sampleReasons: string[];
}

/** Configuration for createMyelin */
export interface MyelinConfig<A extends string = DefaultAction> {
  /** Your LLM function — called only when no rule matches (and heuristic didn't match) */
  llm: (event: TriageEvent) => Promise<{ action: A; reason: string }>;
  /** Optional heuristic function — cheap keyword/rule-based classifier between rules and LLM.
   *  Return { action, reason } to use heuristic result, or null to fall through to LLM. */
  heuristic?: (event: TriageEvent) => { action: A; reason: string } | null;
  /** Path to rules JSON file (default: './myelin-rules.json') */
  rulesPath?: string;
  /** Path to decision log JSONL file (default: './myelin-decisions.jsonl') */
  logPath?: string;
  /** Whether to auto-log all decisions (default: true) */
  autoLog?: boolean;
  /** Whether to fail-open on errors (default: true) */
  failOpen?: boolean;
  /** Default action when failing open (default: 'wake') */
  failOpenAction?: A;
  /** Crystallization thresholds */
  crystallize?: {
    /** Minimum occurrences before a pattern is eligible (default: 10) */
    minOccurrences?: number;
    /** Minimum consistency ratio (default: 0.95) */
    minConsistency?: number;
    /** Decision methods to include in crystallization analysis (default: ['llm']) */
    methods?: Method[];
  };
}

/** The myelin instance */
export interface Myelin<A extends string = DefaultAction> {
  /** Process an input — returns a decision (primary API) */
  process: (event: TriageEvent) => Promise<TriageResult<A>>;
  /** Triage an event — alias for process() (backward compatible) */
  triage: (event: TriageEvent) => Promise<TriageResult<A>>;
  /** Observe an event without triggering rules or LLM — just log it */
  observe: (event: TriageEvent, metadata?: Record<string, unknown>) => void;
  /** Safe triage — never throws, always returns a result */
  triageSafe: (event: TriageEvent) => Promise<TriageResult<A>>;
  /** Find patterns stable enough to crystallize */
  getCandidates: (opts?: { minOccurrences?: number; minConsistency?: number }) => CrystallizationCandidate<A>[];
  /** Promote a candidate to a permanent rule */
  crystallize: (candidate: CrystallizationCandidate<A>) => Rule<A>;
  /** Get current stats */
  stats: () => MyelinStats;
  /** Get all current rules */
  getRules: () => Rule<A>[];
  /** Add a rule manually */
  addRule: (rule: Omit<Rule<A>, 'id' | 'createdAt' | 'hitCount'>) => Rule<A>;
  /** Remove a rule by ID */
  removeRule: (id: string) => boolean;
  /** Layer 2: Extract templates from current rules */
  getTemplates: () => Template<A>[];
  /** Layer 3: Extract methodology from templates */
  getMethodology: () => Methodology;
  /** Full three-layer distillation: rules → templates → methodology */
  distill: () => DistillResult<A>;
  /** Compress rules using templates — N specific rules → 1 broad rule */
  optimize: (opts?: { minTemplateHits?: number }) => OptimizeResult<A>;
  /** Full evolution cycle: distill → optimize → detect changes → return guidance */
  evolve: (prev?: Methodology) => EvolutionResult<A>;
  /** Format rules/templates/methodology as a structured prompt block for LLM injection */
  toPromptBlock: (opts?: PromptBlockOptions) => string;
  /** Record an episode (multi-step experience sequence) */
  recordEpisode: (episode: Omit<Episode<A>, 'id'>) => Episode<A>;
  /** Get all recorded episodes */
  getEpisodes: () => Episode<A>[];
  /** Crystallize rules from episode patterns */
  crystallizeEpisodes: (opts?: { minEpisodes?: number; minSuccessRate?: number }) => ExperienceRule[];
  /** Auto-distill scheduler — runs distill() if enough new decisions accumulated */
  maybeDistill: (opts?: { minNewDecisions?: number; minIntervalMs?: number }) => DistillResult<A> | null;
  /** Format methodology for small/fast models (shorter, structured) */
  toSmallModelPrompt: () => string;
}

/** Statistics about the myelin instance */
export interface MyelinStats {
  ruleCount: number;
  totalDecisions: number;
  ruleDecisions: number;
  llmDecisions: number;
  heuristicDecisions: number;
  errorDecisions: number;
  observeCount: number;
  /** Percentage of decisions made by rules (0-100) */
  ruleCoverage: number;
  /** Average latency for rule decisions */
  avgRuleLatencyMs: number;
  /** Average latency for LLM decisions */
  avgLlmLatencyMs: number;
  /** Average latency for heuristic decisions */
  avgHeuristicLatencyMs: number;
}

// ── Layer 2: Templates ──────────────────────────────────

/** A template groups similar rules into an abstract decision pattern */
export interface Template<A extends string = DefaultAction> {
  id: string;
  /** Human-readable name (e.g. "Small low-risk PRs → approve") */
  name: string;
  /** IDs of rules that compose this template */
  ruleIds: string[];
  /** The common action across all rules in this group */
  action: A;
  /** Structural invariants — what's always the same */
  invariants: TemplateInvariants;
  /** Context keys that vary across rules — these are NOT decision-critical */
  variables: string[];
  /** Number of rules in this template */
  ruleCount: number;
  /** Aggregate hitCount across all rules */
  totalHits: number;
  createdAt: string;
  /** Optional skill metadata — populated when template tracks execution performance */
  skillMeta?: TemplateSkillMeta;
}

/** Performance metadata for a template acting as a skill */
export interface TemplateSkillMeta {
  /** Average duration of actions matching this template (ms) */
  avgDurationMs: number;
  /** Success rate of actions matching this template (0-1) */
  successRate: number;
  /** Number of executions tracked */
  executionCount: number;
  /** Last execution timestamp */
  lastExecutedAt?: string;
}

/** What's structurally identical across all rules in a template */
export interface TemplateInvariants {
  eventType?: string;
  source?: string;
  /** Context keys present in ALL rules, with their condition type */
  stableContext: Record<string, 'boolean' | 'numeric_range' | 'exact_string' | 'pattern'>;
}

// ── Layer 3: Methodology ────────────────────────────────

/** A decision dimension — an axis along which decisions vary */
export interface Dimension {
  /** Name of the dimension (e.g. "scope", "risk", "confidence_source") */
  name: string;
  /** How to assess this dimension */
  description: string;
  /** Context keys that indicate this dimension */
  indicators: string[];
  /** Observed levels from data (e.g. ["low", "medium", "high"]) */
  levels: string[];
  /** Relative importance — fraction of templates that use this dimension */
  weight: number;
}

/** A decision principle — a crystallized guideline */
export interface Principle {
  /** Human-readable rule (e.g. "Automated dependency updates can be auto-approved") */
  description: string;
  /** Conditions that trigger this principle */
  when: string;
  /** Recommended action */
  then: string;
  /** Confidence based on supporting evidence (0-1) */
  confidence: number;
  /** Templates supporting this principle */
  supportingTemplates: string[];
}

/** A methodology — the complete decision framework */
export interface Methodology {
  /** Decision dimensions identified across all templates */
  dimensions: Dimension[];
  /** Decision principles derived from templates */
  principles: Principle[];
  /** Decision matrix — maps dimension combinations to actions */
  matrix: MatrixCell[];
  /** Stats about the methodology's coverage */
  templateCount: number;
  ruleCount: number;
  totalHits: number;
  generatedAt: string;
}

/** A cell in the decision matrix */
export interface MatrixCell {
  /** Dimension name → observed level */
  conditions: Record<string, string>;
  /** Recommended action */
  action: string;
  /** How confident we are (0-1) */
  confidence: number;
  /** How many rules/hits support this cell */
  support: number;
}

/** Full distillation result — all three layers */
export interface DistillResult<A extends string = DefaultAction> {
  rules: Rule<A>[];
  templates: Template<A>[];
  methodology: Methodology;
  /** Formatted methodology as human-readable text (for LLM injection) */
  methodologyText: string;
}

// ── Closed Loop: Feedback ──────────────────────────────

/** Result of rule optimization (template compression) */
export interface OptimizeResult<A extends string = DefaultAction> {
  /** New rule set after merging */
  rules: Rule<A>[];
  /** Rules that were merged into broader rules */
  mergedRuleIds: string[];
  /** New broader rules created from templates */
  newMergedRules: Rule<A>[];
  /** Compression ratio (original count / new count) */
  compressionRatio: number;
}

/** A detected change in the methodology between distillations */
export interface EvolutionEvent {
  type: 'principle_emerged' | 'principle_retired' | 'dimension_emerged' | 'dimension_retired' | 'rules_compressed';
  description: string;
  details?: Record<string, unknown>;
}

/** Result of a full evolution cycle (distill + feedback + optimize) */
export interface EvolutionResult<A extends string = DefaultAction> {
  distill: DistillResult<A>;
  optimized: OptimizeResult<A>;
  events: EvolutionEvent[];
  /** Formatted methodology for LLM prompt injection */
  guidance: string;
}

// ── Episodes ──────────────────────────────────────────────

/** A single step in an episode */
export interface EpisodeStep<A extends string = DefaultAction> {
  event: TriageEvent;
  result: TriageResult<A>;
  timestamp: string;
}

/** A multi-step experience sequence (e.g. an OODA cycle, a task execution) */
export interface Episode<A extends string = DefaultAction> {
  id: string;
  steps: EpisodeStep<A>[];
  outcome: 'success' | 'failure' | 'partial';
  metadata?: Record<string, unknown>;
  startedAt: string;
  endedAt?: string;
}

// ── Experience Rules ──────────────────────────────────────

/** A rule derived from episode patterns — richer than a crystallized Rule */
export interface ExperienceRule {
  id: string;
  /** Human-readable pattern description */
  pattern: string;
  /** Recommended action */
  action: string;
  /** Confidence based on episode evidence (0-1) */
  confidence: number;
  /** Number of episodes supporting this rule */
  episodeCount: number;
  /** Success rate across supporting episodes (0-1) */
  successRate: number;
  /** When this rule was last applied */
  lastApplied?: string;
  /** Number of counter-examples observed */
  counterExamples: number;
}

// ── Prompt Block ──────────────────────────────────────────

/** Options for toPromptBlock() */
export interface PromptBlockOptions {
  /** Include crystallized rules (default: true) */
  includeRules?: boolean;
  /** Include templates (default: true) */
  includeTemplates?: boolean;
  /** Include methodology (default: true) */
  includeMethodology?: boolean;
  /** Include experience rules (default: true) */
  includeExperience?: boolean;
  /** Maximum number of rules to include (default: 10) */
  maxRules?: number;
  /** Maximum number of experience rules to include (default: 5) */
  maxExperienceRules?: number;
  /** Format: 'xml' for XML tags, 'markdown' for markdown sections */
  format?: 'xml' | 'markdown';
}

// ── Fleet ─────────────────────────────────────────────────

/** Configuration for a fleet member */
export interface FleetMemberConfig<A extends string = DefaultAction> {
  name: string;
  instance: Myelin<A>;
}

/** Aggregated fleet statistics */
export interface FleetStats {
  members: { name: string; stats: MyelinStats }[];
  totalRules: number;
  totalDecisions: number;
  overallRuleCoverage: number;
}

// ── Stack ─────────────────────────────────────────────────

/** Configuration for a hierarchical crystallization stack */
export interface MyelinStackConfig<A extends string = DefaultAction> {
  /** The myelin instances to stack, from L1 (most specific) to Ln (most abstract) */
  layers: Myelin<A>[];
  /** Auto-distill interval in milliseconds (default: disabled) */
  autoDistillIntervalMs?: number;
}

/** Result of a stack-wide distillation */
export interface StackDistillResult<A extends string = DefaultAction> {
  layers: DistillResult<A>[];
  /** Cross-layer evolution events */
  crossLayerEvents: EvolutionEvent[];
}
