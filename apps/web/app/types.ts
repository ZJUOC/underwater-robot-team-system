export type EvidenceStatus = "pending" | "accepted" | "rejected" | "modified";

export interface PersonalityTag {
  key: string;
  dimension: string;
  label: string;
  signal_score: number;
  confidence: number;
  evidence_count: number;
  description: string;
  evidence: { source: string; keyword: string; excerpt: string }[];
}

export interface PersonalityProfile {
  framework?: string;
  model_version?: string;
  status?: "preliminary" | "insufficient_data";
  tags: PersonalityTag[];
  dimensions?: PersonalityTag[];
  summary?: string;
  score_note?: string;
  notice?: string;
}

export interface Member {
  id: number;
  name: string;
  student_id: string;
  major: string;
  grade: string;
  department: string;
  desired_department: string;
  status: string;
  interests: string[];
  personality_profile: PersonalityProfile;
  learning_goals: string[];
  lifecycle_stage: "applicant" | "member" | "alumni";
  role_title: string;
  joined_at: string | null;
  created_at: string;
}

export interface ApplicationSummary {
  id: number;
  member_id: number;
  application_no: string;
  name: string;
  student_id: string;
  major: string;
  grade: string;
  desired_department: string;
  status: string;
  interests: string[];
  personality_profile: PersonalityProfile;
  applied_at: string;
  profile_completion: number;
  data_quality: "ready" | "needs_review" | "demo";
  source_type: string;
  source_name: string;
  submission_count: number;
}

export interface MaterialAnalysis {
  id: number;
  member_id: number | null;
  title: string;
  file_names: string[];
  material_types: string[];
  notes: string;
  status: string;
  summary: string;
  extracted_facts: { label: string; value: string; source: string; confidence: number }[];
  extraction_report: MaterialExtractionReport[];
  uncertainties: string[];
  suggested_questions: string[];
  created_at: string;
}

export interface MaterialExtractionReport {
  filename: string;
  suffix: string;
  size: number;
  status: "complete" | "ocr_complete" | "partial" | "failed";
  status_label: string;
  method: string;
  method_label: string;
  page_count: number;
  ocr_page_count: number;
  char_count: number;
  confidence: number | null;
  warnings: string[];
}

export interface ApplicationDetail extends ApplicationSummary {
  phone_masked: string;
  motivation: string;
  prior_experience: string;
  available_time: string;
  raw_answers: { submissions?: Record<string, unknown>[]; quality_flags?: string[]; note?: string };
  tags: MemberTag[];
  evidence: Evidence[];
  interviews: InterviewSummary[];
  material_analyses: MaterialAnalysis[];
}

export interface Evidence {
  id: number;
  member_id: number;
  source_type: string;
  source_id: string;
  dimension: string;
  direction: string;
  strength: number;
  confidence: number;
  description: string;
  reasoning_summary: string;
  status: EvidenceStatus;
  review_note: string;
  created_at: string;
}

export interface MemberTag {
  id: number;
  dimension: string;
  score: number;
  confidence: number;
  trend: "up" | "down" | "stable";
  evidence_count: number;
  updated_at: string;
}

export interface MemberDetail extends Member {
  phone_masked: string;
  long_term_goal: string;
  weekly_commitment: string;
  tags: MemberTag[];
  evidence: Evidence[];
  timeline: { type: string; title: string; occurred_at: string; source_id: string }[];
}

export interface DashboardData {
  members: number;
  pending_interviews: number;
  pending_evidence: number;
  accepted_evidence: number;
  questionnaire_rows: number;
  recent_members: Member[];
}

export interface InterviewSummary {
  id: number;
  member_id: number;
  application_id: number;
  member_name: string;
  title: string;
  status: string;
  scheduled_at: string;
  meeting_provider: string;
  consent_complete: boolean;
  utterance_count: number;
}

export interface InterviewDetail extends InterviewSummary {
  meeting_id: string;
  recording_consent: boolean;
  ai_consent: boolean;
  informed_consent: boolean;
  questions: {
    id: number;
    title: string;
    content: string;
    category: string;
    difficulty: string;
    evaluation_dimensions: string[];
    reference_points: string[];
    follow_up_questions: string[];
  }[];
  utterances: {
    id: number;
    speaker_id: string;
    speaker_name: string;
    speaker_role: string;
    start_time: number;
    end_time: number;
    text: string;
    question_id: number | null;
    confidence: number;
  }[];
}

export type ResearchRecommendation = "recommend_join" | "follow_up" | "insufficient_evidence" | "not_recommended" | "needs_review";

export interface ResearchTask {
  id: number;
  title: string;
  description: string;
  instructions: { team_size?: number; duration_days?: number; team_deliverables?: string[]; individual_deliverables?: string[] };
  rubric: { key: string; label: string; scope: "team" | "individual"; max_score: number }[];
  rubric_version: string;
  duration_days: number;
  status: string;
  starts_at: string;
  due_at: string | null;
  created_at: string;
}

export interface ResearchTeamMember {
  id: number;
  member_id: number;
  name: string;
  student_id: string;
  major: string;
  desired_department: string;
  role_summary: string;
  is_leader: boolean;
}

export interface ResearchSubmissionFile {
  id: number;
  submission_id: number;
  member_id: number | null;
  kind: string;
  original_name: string;
  suffix: string;
  content_type: string;
  size: number;
  sha256: string;
  extraction_status: string;
  extraction_report: MaterialExtractionReport;
  segments: { locator: string; text: string; method: string; confidence: number | null }[];
  created_at: string;
}

export interface ResearchContribution {
  id: number;
  submission_id: number;
  team_member_id: number;
  role_summary: string;
  contribution: string;
  key_findings: string;
  challenges: string;
  source_validation: string;
  preferred_direction: string;
  peer_confirmation: Record<string, unknown>;
  updated_at: string;
}

export interface ResearchCriterion {
  key: string;
  label: string;
  score: number;
  max_score: number;
  confidence: number;
  reasoning: string;
  evidence: { filename: string; locator: string; quote: string }[];
  missing_information: string[];
}

export interface CandidateResearchAssessment {
  id: number;
  member_id: number;
  member_name: string;
  individual_score: number;
  total_score: number;
  contribution_confidence: number;
  recommendation: ResearchRecommendation;
  summary: string;
  criteria: ResearchCriterion[];
  evidence: { filename: string; locator: string; quote: string }[];
  suggested_questions: string[];
}

export interface TeamResearchAssessment {
  id: number;
  status: string;
  model_version: string;
  prompt_version: string;
  summary: string;
  team_score: number;
  criteria: ResearchCriterion[];
  evidence: { filename: string; locator: string; quote: string }[];
  conflicts: { field?: string; detail?: string }[];
  missing_information: string[];
  suggested_questions: string[];
  candidates: CandidateResearchAssessment[];
  created_at: string;
}

export interface HumanResearchReview {
  id: number;
  team_id: number;
  member_id: number;
  reviewer_id: number;
  reviewer_name: string;
  status: string;
  recommendation: ResearchRecommendation;
  criteria_scores: Record<string, number>;
  summary: string;
  concerns: string;
  follow_up_questions: string[];
  submitted_at: string | null;
  updated_at: string;
}

export interface AdmissionDecision {
  id: number;
  team_id: number;
  member_id: number;
  status: ResearchRecommendation;
  reason: string;
  decided_by: number;
  decider_name: string;
  decided_at: string;
}

export interface ResearchSubmission {
  id: number;
  team_id: number;
  version: number;
  status: string;
  note: string;
  submitted_at: string | null;
  files: ResearchSubmissionFile[];
  contributions: ResearchContribution[];
}

export interface ResearchTeamSummary {
  id: number;
  task_id: number;
  task_title: string;
  name: string;
  status: string;
  due_at: string | null;
  members: ResearchTeamMember[];
  file_count: number;
  contribution_count: number;
  team_score: number | null;
  decision_count: number;
  submitted_at: string | null;
  updated_at: string;
}

export interface ResearchTeamDetail extends ResearchTeamSummary {
  task: ResearchTask;
  submission: ResearchSubmission | null;
  assessment: TeamResearchAssessment | null;
  reviews: HumanResearchReview[];
  decisions: AdmissionDecision[];
}
