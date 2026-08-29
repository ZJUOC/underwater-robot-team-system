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
  uncertainties: string[];
  suggested_questions: string[];
  created_at: string;
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
