// Shapes of the JSON read models returned by the database functions (see supabase/migrations/*_read_models_*.sql).
export type Difficulty = 'very_easy' | 'easy' | 'somewhat_difficult' | 'difficult' | 'could_not_complete';
export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'info_requested' | 'approved' | 'waitlisted' | 'declined' | 'withdrawn';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
export type TaskType = 'guided_scenario' | 'feature_exploration' | 'usability_assessment' | 'bug_reproduction' | 'comparison'
  | 'comprehension_check' | 'open_exploration' | 'final_review';
export type EvidenceKind = 'screenshot' | 'recording' | 'voice';
export type Severity = 'minor' | 'major' | 'critical';

export interface FormOption { value: string; label: string }
export interface FormQuestion { key: string; label: string; type: 'single' | 'multi' | 'text' | 'country'; required?: boolean; segment?: boolean; options?: FormOption[] }
export interface FormStep { id: string; title: string; intro?: string; questions: FormQuestion[] }
export interface ApplicationForm { steps: FormStep[] }

export interface Stats { cohort_size: number; approved_testers: number; assigned_testers: number; pending_applications: number;
  remaining_places: number; task_count: number; required_task_count: number }
export interface OutlineItem { position: number; title: string; task_type: TaskType; estimated_minutes: number | null; is_required: boolean }

export interface Product { id: string; creator_id?: string; name: string; description: string; category: string; stage: string; stage_label: string | null;
  target_audience: string | null; demo_url: string | null; is_demo: boolean; created_at: string }
export interface Release { id: string; product_id?: string; version: string; notes: string | null; access_url?: string | null; access_instructions?: string | null; released_at?: string }
export interface Asset { id: string; kind: 'logo' | 'screenshot' | 'demo_link'; url: string | null; storage_path: string | null; caption: string | null }
export interface Round { id: string; product_id: string; release_id: string; previous_round_id: string | null; round_number: number; title: string;
  status: 'draft' | 'published' | 'closed' | 'completed' | 'archived'; summary: string; target_audience: string | null; cohort_size: number;
  expected_minutes_min: number; expected_minutes_max: number; supported_devices: string[]; countries: string[];
  application_deadline: string | null; testing_deadline: string | null; reward_type: 'unpaid' | 'paid' | 'perk'; reward_details: string | null;
  privacy_requirements: string | null; beginner_friendly: boolean; instructions?: string | null; access_instructions?: string | null;
  support_contact: string | null; application_form?: ApplicationForm; published_at: string | null; created_at: string }

export interface Listing { round: Round; product: Product; release: Release; creator: { id: string; display_name: string; bio: string | null; is_demo: boolean } | null;
  assets: Asset[]; objectives: string[]; stats: Stats; outline: OutlineItem[] }

export interface Application { id: string; round_id: string; tester_id: string; status: ApplicationStatus; current_step: number; answers: Record<string, any>;
  available_days: string[]; confirm_device_access: boolean; confirm_time_commitment: boolean; confirm_instructions: boolean; accept_terms: boolean;
  consent_screenshots: boolean; consent_recordings: boolean; consent_voice: boolean; creator_message: string | null; is_demo: boolean;
  submitted_at: string | null; decided_at: string | null; created_at: string; updated_at: string }
export interface Assignment { id: string; round_id: string; application_id: string; tester_id: string; release_id: string;
  status: 'invited' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'removed'; assigned_at: string; responded_at: string | null }
export interface RoundDetail extends Listing { application_form: ApplicationForm; is_creator: boolean; my_application: Application | null;
  my_assignment: { id: string; status: Assignment['status'] } | null }

export interface MyTestingItem { application: Omit<Application, 'answers'>; round: Pick<Round, 'id' | 'title' | 'status' | 'testing_deadline' | 'expected_minutes_min' | 'expected_minutes_max'>;
  product: { id: string; name: string; category: string }; release: { version: string }; assignment: Assignment | null;
  session: { id: string; status: Session['status']; started_at: string; completed_at: string | null; tasks_total: number; tasks_done: number } | null;
  verdict: { id: string; verdict: string; rating: number; submitted_at: string } | null }

export interface AssignmentDetail { assignment: Assignment; round: Round; product: Product; release: Release; objectives: string[]; outline: OutlineItem[];
  application_consents: { screenshots: boolean; recordings: boolean; voice: boolean } | null; session_id: string | null }

export interface Session { id: string; assignment_id: string; tester_id: string | null; round_id: string; product_id: string; release_id: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned'; started_at: string; paused_at: string | null; completed_at: string | null; last_activity_at: string }
export interface FeedbackQuestion { key: string; label: string; type: 'text' | 'single'; options?: FormOption[] }
export interface TaskVersion { id: string; task_id: string; version_number: number; title: string; description: string | null; scenario: string | null;
  instructions: string[]; expected_result: string | null; success_criteria: string[]; measures: string[]; estimated_minutes: number | null;
  task_type: TaskType; required_evidence: EvidenceKind[]; feedback_questions: FeedbackQuestion[]; allow_skip: boolean }
export interface Feedback { id: string; session_id: string; task_completion_id: string | null; task_id?: string | null; kind: 'task' | 'general' | 'feature_request';
  difficulty: Difficulty | null; help_requested: boolean | null; comment: string | null; answers: Record<string, any>; created_at: string }
export interface EvidenceFile { id: string; kind: EvidenceKind; storage_path: string; file_name: string | null; mime_type: string | null; created_at: string }
export interface Completion { id: string; session_id: string; task_id: string; task_version_id: string; position: number; is_required: boolean; allow_skip: boolean;
  depends_on_task_id: string | null; status: TaskStatus; started_at: string | null; completed_at: string | null; active_seconds: number;
  help_requested: boolean | null; difficulty: Difficulty | null; had_problem: boolean | null; title?: string }
export interface SessionTask extends Completion { version: TaskVersion; feedback: Feedback[]; evidence: EvidenceFile[] }
export interface Bug { id: string; session_id: string; round_id: string; product_id: string; release_id: string; tester_id: string | null;
  task_completion_id: string | null; task_id: string | null; title: string; expected_result: string; actual_result: string; steps_to_reproduce: string;
  severity: Severity; device: string | null; operating_system: string | null; product_version: string; created_at: string }
export interface Triage { bug_id: string; status: 'new' | 'reviewed' | 'in_progress' | 'needs_info' | 'duplicate' | 'fixed' | 'closed';
  category: string | null; assignee_id: string | null; duplicate_of: string | null; updated_at: string }
export interface BugEvent { id: string; actor_role: 'creator' | 'tester'; event_type: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string }
export interface Verdict { id: string; session_id: string; rating: number; would_use: string; biggest_improvement: string; verdict: string; reason: string; submitted_at: string;
  amendments: { id: string; rating: number | null; would_use: string | null; biggest_improvement: string | null; verdict: string | null; reason: string; created_at: string }[];
  evidence?: EvidenceFile[] }
export interface Consent { screenshots: boolean; recordings: boolean; voice: boolean; granted_at: string }

export interface SessionDetail { session: Session; viewer_role: 'tester' | 'creator';
  round: { id: string; title: string; testing_deadline: string | null; support_contact: string | null; access_instructions: string | null; instructions: string | null;
    expected_minutes_min: number; expected_minutes_max: number };
  product: { id: string; name: string }; release: { id: string; version: string; access_url: string | null }; consent: Consent;
  tasks: SessionTask[]; bugs: (Bug & { triage_status: Triage['status']; attachments: EvidenceFile[] })[]; verdict: Verdict | null }

export interface BugDetail { bug: Bug; viewer_role: 'tester' | 'creator'; triage: Triage; task_title: string | null; reporter: string | null;
  attachments: EvidenceFile[]; events: BugEvent[]; other_bugs: { id: string; title: string }[] }

export interface RoundSummary { id: string; title: string; status: Round['status']; round_number: number; release_id: string; version: string;
  previous_round_id: string | null; created_at: string; published_at: string | null; stats: Stats; sessions_started: number; sessions_completed: number;
  bugs: number; reports: number }
export interface ProjectTask { id: string; product_id: string; round_id: string | null; finding_id: string | null; title: string; description: string | null;
  owner_id: string | null; owner_name: string | null; priority: 'low' | 'medium' | 'high' | 'urgent'; due_date: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'wont_fix'; resolved_in_release_id: string | null; created_at: string }
export interface ProductBundle extends Product { releases: Release[]; assets: Asset[]; rounds: RoundSummary[]; project_tasks: ProjectTask[] }

export interface BuilderTask { id: string; round_id: string; position: number; is_required: boolean; depends_on_task_id: string | null; version: TaskVersion; version_count: number }
export interface CreatorApplication extends Application { profile: { display_name: string; bio: string | null; country: string | null; devices: string[]; skills: string[]; is_demo: boolean };
  completed_tests: number; issues_reported: number }
export interface CreatorRoundData { round: Round & { application_form: ApplicationForm }; product: Product; release: Release; releases: Release[];
  objectives: { id: string; objective: string; sort_order: number }[]; stats: Stats; tasks: BuilderTask[]; applications: CreatorApplication[];
  assignments: Assignment[]; sessions: (Session & { tester_name: string | null; answers: Record<string, any> | null })[]; completions: Completion[];
  feedback: Feedback[]; bugs: (Bug & { triage: Triage; attachment_count: number })[]; verdicts: Verdict[];
  reports: { id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; generator: string | null; created_at: string; completed_at: string | null; error: string | null }[];
  activity: { id: string; event_type: string; payload: Record<string, any>; created_at: string }[] }

export type FindingSection = 'worked_well' | 'usability_problems' | 'technical_problems' | 'feature_requests' | 'task_analysis'
  | 'segment_differences' | 'conflicting_opinions' | 'priorities' | 'next_steps';
export interface Finding { id: string; section: FindingSection; kind: 'tester_statement' | 'aggregated_observation' | 'interpretation' | 'recommendation';
  title: string; body: string; task_id: string | null; task_title: string | null; supporting_tester_count: number; total_testers: number;
  confidence: 'low' | 'medium' | 'high'; limitations: string | null; review_status: 'pending' | 'approved' | 'rejected';
  edited_title: string | null; edited_body: string | null;
  evidence: { id: string; source_type: 'task_feedback' | 'bug_report' | 'verdict' | 'task_completion'; source_id: string; session_id: string; excerpt: string | null }[];
  project_tasks: { id: string; title: string; status: string }[] }
export interface ReportDetail { id: string; round_id: string; product_id: string; release_id: string; status: 'queued' | 'processing' | 'completed' | 'failed';
  generator: string | null; stats: any; executive_summary: string | null; limitations: string[]; error: string | null; created_at: string; completed_at: string | null;
  round_title: string; version: string; findings: Finding[] }

export interface Profile { id: string; display_name: string; bio: string | null; country: string | null; devices: string[]; skills: string[]; is_demo: boolean }
export interface Notification { id: string; type: string; title: string; body: string | null; link: { screen: string; id: string } | null; read_at: string | null; created_at: string }
export interface TaskTemplate { id: string; owner_id: string | null; is_public: boolean; title: string; task_type: TaskType; definition: Partial<TaskVersion> }
export type TaskDefinition = Pick<TaskVersion, 'title' | 'task_type'> & Partial<Omit<TaskVersion, 'id' | 'task_id' | 'version_number'>>;
