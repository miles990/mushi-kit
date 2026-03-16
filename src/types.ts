/**
 * myelinate — Core types
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
export type Method = 'rule' | 'llm' | 'error';

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
  | { pattern: string };                 // regex pattern

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

/** Configuration for createMyelinate */
export interface MyelinateConfig<A extends string = DefaultAction> {
  /** Your LLM function — called only when no rule matches */
  llm: (event: TriageEvent) => Promise<{ action: A; reason: string }>;
  /** Path to rules JSON file (default: './myelinate-rules.json') */
  rulesPath?: string;
  /** Path to decision log JSONL file (default: './myelinate-decisions.jsonl') */
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
  };
}

/** The myelinate instance */
export interface Myelinate<A extends string = DefaultAction> {
  /** Process an input — returns a decision (primary API) */
  process: (event: TriageEvent) => Promise<TriageResult<A>>;
  /** Triage an event — alias for process() (backward compatible) */
  triage: (event: TriageEvent) => Promise<TriageResult<A>>;
  /** Find patterns stable enough to crystallize */
  getCandidates: (opts?: { minOccurrences?: number; minConsistency?: number }) => CrystallizationCandidate<A>[];
  /** Promote a candidate to a permanent rule */
  crystallize: (candidate: CrystallizationCandidate<A>) => Rule<A>;
  /** Get current stats */
  stats: () => MyelinateStats;
  /** Get all current rules */
  getRules: () => Rule<A>[];
  /** Add a rule manually */
  addRule: (rule: Omit<Rule<A>, 'id' | 'createdAt' | 'hitCount'>) => Rule<A>;
  /** Remove a rule by ID */
  removeRule: (id: string) => boolean;
}

/** Statistics about the myelinate instance */
export interface MyelinateStats {
  ruleCount: number;
  totalDecisions: number;
  ruleDecisions: number;
  llmDecisions: number;
  errorDecisions: number;
  /** Percentage of decisions made by rules (0-100) */
  ruleCoverage: number;
  /** Average latency for rule decisions */
  avgRuleLatencyMs: number;
  /** Average latency for LLM decisions */
  avgLlmLatencyMs: number;
}
