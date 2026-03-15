/**
 * mushi-kit — Core types
 *
 * Zero-dependency type definitions for the crystallization engine.
 */

/** Standard event types */
export type EventType = 'timer' | 'message' | 'change' | 'alert' | 'scheduled' | 'startup' | 'custom';

/** Triage actions */
export type Action = 'skip' | 'wake' | 'quick';

/** How the decision was made */
export type Method = 'rule' | 'llm' | 'error';

/** An incoming event to be triaged */
export interface TriageEvent {
  type: EventType | string;
  source?: string;
  context?: Record<string, unknown>;
}

/** Result of a triage decision */
export interface TriageResult {
  action: Action;
  reason: string;
  method: Method;
  latencyMs: number;
  ruleId?: string;
}

/** A crystallized rule */
export interface Rule {
  id: string;
  match: RuleMatch;
  action: Action;
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
export interface DecisionLog {
  ts: string;
  event: TriageEvent;
  action: Action;
  reason: string;
  method: Method;
  latencyMs: number;
}

/** A crystallization candidate — a pattern stable enough to become a rule */
export interface CrystallizationCandidate {
  /** Proposed rule match conditions */
  match: RuleMatch;
  /** The action the LLM consistently chose */
  suggestedAction: Action;
  /** Human-readable description of the pattern */
  description: string;
  /** How many times this pattern was seen */
  occurrences: number;
  /** Consistency ratio (0-1) — how often the LLM chose the same action */
  consistency: number;
  /** Sample reasons from the LLM decisions */
  sampleReasons: string[];
}

/** Configuration for createMushi */
export interface MushiConfig {
  /** Your LLM function — called only when no rule matches */
  llm: (event: TriageEvent) => Promise<{ action: Action; reason: string }>;
  /** Path to rules JSON file (default: './mushi-rules.json') */
  rulesPath?: string;
  /** Path to decision log JSONL file (default: './mushi-decisions.jsonl') */
  logPath?: string;
  /** Whether to auto-log all decisions (default: true) */
  autoLog?: boolean;
  /** Whether to fail-open on errors (default: true) */
  failOpen?: boolean;
  /** Default action when failing open (default: 'wake') */
  failOpenAction?: Action;
  /** Crystallization thresholds */
  crystallize?: {
    /** Minimum occurrences before a pattern is eligible (default: 10) */
    minOccurrences?: number;
    /** Minimum consistency ratio (default: 0.95) */
    minConsistency?: number;
  };
}

/** The mushi-kit instance */
export interface Mushi {
  /** Triage an event — returns a decision */
  triage: (event: TriageEvent) => Promise<TriageResult>;
  /** Find patterns stable enough to crystallize */
  getCandidates: (opts?: { minOccurrences?: number; minConsistency?: number }) => CrystallizationCandidate[];
  /** Promote a candidate to a permanent rule */
  crystallize: (candidate: CrystallizationCandidate) => Rule;
  /** Get current stats */
  stats: () => MushiStats;
  /** Get all current rules */
  getRules: () => Rule[];
  /** Add a rule manually */
  addRule: (rule: Omit<Rule, 'id' | 'createdAt' | 'hitCount'>) => Rule;
  /** Remove a rule by ID */
  removeRule: (id: string) => boolean;
}

/** Statistics about the mushi instance */
export interface MushiStats {
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
