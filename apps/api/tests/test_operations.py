from datetime import datetime
from types import SimpleNamespace
from unittest import TestCase

from fastapi import Request
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import Base

from app.operations import balanced_member_groups, create_task, save_attendance


class OperationsTests(TestCase):
    def test_smart_grouping_assigns_every_member_once_and_balances_sizes(self) -> None:
        members = [SimpleNamespace(id=index) for index in range(1, 11)]

        groups = balanced_member_groups(members, team_size=3)

        assigned_ids = [member.id for group in groups for member in group]
        sizes = [len(group) for group in groups]
        self.assertCountEqual(assigned_ids, range(1, 11))
        self.assertEqual(len(assigned_ids), len(set(assigned_ids)))
        self.assertLessEqual(max(sizes), 3)
        self.assertLessEqual(max(sizes) - min(sizes), 1)

    def test_smart_grouping_handles_empty_roster(self) -> None:
        self.assertEqual(balanced_member_groups([], team_size=3), [])

    def test_admin_task_and_attendance_changes_persist(self) -> None:
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            user = models.User(username="admin", password_hash="unused", display_name="管理员", role="admin")
            member = models.Member(name="成员甲", student_id="3260000001", lifecycle_stage="member")
            course = models.CourseSession(title="控制基础", starts_at=datetime(2026, 9, 10, 19, 0))
            db.add_all([user, member, course])
            db.commit()
            request = Request({"type": "http", "headers": []})
            request.state.auth = {"sub": user.id}

            task = create_task(schemas.RoutineTaskWrite(
                title="每周技术复盘", status="published", assignee_ids=[member.id],
            ), request, db)
            save_attendance(course.id, schemas.AttendanceWrite(
                member_id=member.id, status="present", note="准时到课",
            ), request, db)

            stored_task = db.scalar(select(models.RoutineTask).where(models.RoutineTask.id == task["id"]))
            db.refresh(course)
            self.assertEqual(stored_task.assignee_ids, [member.id])
            self.assertEqual(course.attendance[str(member.id)]["status"], "present")
            self.assertEqual(course.attendance[str(member.id)]["note"], "准时到课")
