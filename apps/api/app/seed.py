import json
import re
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import models
from .auth import hash_password
from .personality_engine import analyze_personality_signals


def seed_demo(db: Session) -> None:
    if not db.scalar(select(models.User.id).limit(1)):
        db.add(models.User(username="admin", password_hash=hash_password("robot2026"),
                           display_name="开发管理员", role="super_admin", department_scope="all"))
        db.commit()
    _seed_questionnaire_archives(db)
    member = db.scalar(select(models.Member).where(models.Member.student_id == "3260100001"))
    if not member:
        member = models.Member(
            name="张三", student_id="3260100001", major="自动化", grade="2026",
            department="待分配", desired_department="电控组", status="面试中",
            interests=["嵌入式", "自动化控制", "水下机器人"],
            learning_goals=["STM32", "ROS2", "控制"],
            long_term_goal="参与 AUV 电控与系统联调，形成从传感器到控制闭环的工程能力。",
            weekly_commitment="5h以上", lifecycle_stage="applicant",
        )
        db.add(member)
        db.flush()
    else:
        member.lifecycle_stage = "applicant"
    if not member.application_archive:
        db.add(models.ApplicationArchive(
            member_id=member.id, application_no="APP-DEMO-001", recruitment_cycle="开发演示",
            source_type="demo", source_name="系统演示资料", motivation="希望参与水下机器人电控与系统联调。",
            prior_experience="有基础 STM32 与 I2C 调试经历。", available_time="5h以上",
            raw_answers={"submissions": [], "note": "用于演示面试与 Evidence 闭环"},
            profile_completion=0.88, data_quality="demo",
        ))
    interview = db.scalar(select(models.Interview).where(models.Interview.meeting_id == "mock-2026-001"))
    if not interview:
        interview = models.Interview(
            member_id=member.id, title="2026 纳新第一轮面试", status="ready",
            meeting_provider="mock", meeting_id="mock-2026-001",
            recording_consent=True, ai_consent=True, informed_consent=True,
        )
        db.add(interview)
        db.flush()
        question = models.InterviewQuestion(
            interview_id=interview.id, title="传感器故障排查", category="技术题", difficulty="基础",
            content="如果一个传感器突然没有数据，你会怎么排查？",
            evaluation_dimensions=["Debug 思维", "嵌入式基础", "协议与手册意识"],
            reference_points=["供电", "接线", "通信", "寄存器配置"],
            follow_up_questions=["如果 I2C 扫描不到设备地址，你下一步会做什么？"],
        )
        db.add(question)
        db.flush()
        db.add_all([
            models.Utterance(
                interview_id=interview.id, speaker_id="speaker-1", speaker_name="电控部长",
                speaker_role="interviewer", start_time=0, end_time=8,
                text=question.content, question_id=question.id, confidence=0.98,
            ),
            models.Utterance(
                interview_id=interview.id, speaker_id="speaker-2", speaker_name="张三",
                speaker_role="candidate", start_time=8, end_time=31,
                text="我会先看看供电是不是正常，然后确认接线，再看通信协议。如果是 I2C 的话会看看能不能扫描到设备地址，之后再看寄存器配置。",
                question_id=question.id, confidence=0.96,
            ),
        ])
        db.add(models.ActivityEvent(
            member_id=member.id, event_type="questionnaire_submitted", source_type="questionnaire",
            source_id="demo-questionnaire-1", title="提交 2026 纳新问卷",
            payload={"interests": member.interests, "learning_goals": member.learning_goals, "self_report_weight": "low"},
        ))
    if not db.scalar(select(models.Member.id).where(models.Member.student_id == "3220102048")):
        db.add(models.Member(
            name="李婧", student_id="3220102048", major="机械工程", grade="2022",
            phone="", department="机械组", desired_department="机械组", status="在队",
            interests=["机械设计", "密封舱", "结构可靠性"], learning_goals=["项目带教", "结构评审"],
            long_term_goal="负责机器人结构迭代并带教新成员。", weekly_commitment="5h以上",
            lifecycle_stage="member", role_title="机械组骨干", joined_at=datetime(2023, 9, 1),
        ))
    db.flush()
    _refresh_personality_profiles(db)
    db.commit()


def _seed_questionnaire_archives(db: Session) -> None:
    private_source = Path(__file__).with_name("seed_questionnaire.json")
    example_source = Path(__file__).with_name("seed_questionnaire.example.json")
    source_path = private_source if private_source.exists() else example_source
    if not source_path.exists():
        return
    records = json.loads(source_path.read_text(encoding="utf-8"))
    source_name = (
        "380581708_按文本_水下机器人协会纳新问卷_54_54(1).xlsx"
        if source_path == private_source else "synthetic-recruitment-demo.json"
    )
    by_name: dict[str, models.Member] = {}
    for record in records:
        row_no = str(record.get("序号", "")).zfill(3)
        identity = str(record.get("1、您的 姓名 学号 是？", "")).strip()
        match = re.match(r"^(.*?)[ ,，]*(\d{8,12})$", identity)
        name = match.group(1).strip() if match else identity
        student_id = match.group(2) if match else ""
        quality_flags: list[str] = []
        if identity == "1":
            name, student_id = f"待核对记录 {row_no}", f"RAW-2026-{row_no}"
            quality_flags.append("test_value")
        elif not student_id:
            quality_flags.append("missing_student_id")
        elif not name:
            name = f"待补姓名 {row_no}"
            quality_flags.append("missing_name")

        member = db.scalar(select(models.Member).where(models.Member.student_id == student_id)) if student_id else None
        if not member and name:
            member = by_name.get(name) or db.scalar(select(models.Member).where(models.Member.name == name))
        if not member:
            stable_id = student_id or f"RAW-2026-{row_no}"
            interests = [value.strip() for value in str(record.get("4、您对哪些方向感兴趣？", "")).split("┋") if value.strip()]
            member = models.Member(
                name=name or f"待核对记录 {row_no}", student_id=stable_id,
                major=str(record.get("2、您的专业是？", "")), grade="2026",
                phone=str(record.get("3、您的手机号码是？", "")), department="待分配",
                desired_department=str(record.get("5、您最想进入我们的哪个部门？", "")),
                status="待核对" if quality_flags else "待面试", interests=interests,
                learning_goals=[], long_term_goal="",
                weekly_commitment=str(record.get("8、您认为您可以每周付出多少时间参加社团活动？", "")),
                lifecycle_stage="applicant",
            )
            db.add(member)
            db.flush()
        by_name[member.name] = member
        archive = db.scalar(select(models.ApplicationArchive).where(models.ApplicationArchive.member_id == member.id))
        if archive:
            submissions = list(archive.raw_answers.get("submissions", []))
            if not any(str(item.get("序号")) == str(record.get("序号")) for item in submissions):
                submissions.append(record)
                archive.raw_answers = {**archive.raw_answers, "submissions": submissions}
                archive.data_quality = "needs_review"
            continue
        submitted = str(record.get("提交答卷时间", ""))
        try:
            applied_at = datetime.strptime(submitted, "%Y/%m/%d %H:%M:%S")
        except ValueError:
            applied_at = datetime.utcnow()
        core_values = [name, student_id, member.major, member.phone, member.desired_department,
                       member.interests, record.get("6、在此之前，您有无相关基础？"),
                       record.get("7、为什么想加入我们？（此题不会影响面试，随心所欲作答）")]
        completion = round(sum(bool(value) for value in core_values) / len(core_values), 2)
        db.add(models.ApplicationArchive(
            member_id=member.id, application_no=f"APP-2026-{row_no}", recruitment_cycle="2026 秋季纳新",
            source_type="questionnaire", source_name=source_name, applied_at=applied_at,
            motivation=str(record.get("7、为什么想加入我们？（此题不会影响面试，随心所欲作答）", "")),
            prior_experience=str(record.get("6、在此之前，您有无相关基础？", "")),
            available_time=member.weekly_commitment,
            raw_answers={"submissions": [record], "quality_flags": quality_flags},
            profile_completion=completion, data_quality="needs_review" if quality_flags else "ready",
        ))
    db.flush()


def _refresh_personality_profiles(db: Session) -> None:
    archives = db.scalars(select(models.ApplicationArchive).options(
        selectinload(models.ApplicationArchive.member).selectinload(models.Member.interviews).selectinload(models.Interview.utterances),
    )).all()
    for archive in archives:
        interview_text = "\n".join(
            utterance.text
            for interview in archive.member.interviews
            for utterance in interview.utterances
            if utterance.speaker_role == "candidate"
        )
        profile = analyze_personality_signals(
            motivation=archive.motivation, prior_experience=archive.prior_experience,
            available_time=archive.available_time, interview_text=interview_text,
        )
        if archive.member.personality_profile != profile:
            archive.member.personality_profile = profile
