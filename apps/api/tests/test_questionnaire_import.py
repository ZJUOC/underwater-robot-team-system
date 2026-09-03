from unittest import TestCase

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app import models
from app.database import Base
from app.seed import import_questionnaire_records


RECORD = {
    "序号": "1",
    "提交答卷时间": "2026/09/03 12:00:00",
    "1、您的 姓名 学号 是？": "示例同学 3260000099",
    "2、您的专业是？": "自动化",
    "3、您的手机号码是？": "13800000000",
    "4、您对哪些方向感兴趣？": "嵌入式┋控制",
    "5、您最想进入我们的哪个部门？": "电控组",
    "6、在此之前，您有无相关基础？": "做过 STM32 项目",
    "7、为什么想加入我们？（此题不会影响面试，随心所欲作答）": "希望参与水下机器人项目",
    "8、您认为您可以每周付出多少时间参加社团活动？": "5h以上",
}


class QuestionnaireImportTests(TestCase):
    def test_reimport_keeps_one_archive_and_reports_unchanged_row(self) -> None:
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            first = import_questionnaire_records(db, [RECORD], "questionnaire.xlsx")
            second = import_questionnaire_records(db, [RECORD], "questionnaire.xlsx")

            self.assertEqual(first["created_archives"], 1)
            self.assertEqual(second["unchanged_rows"], 1)
            self.assertEqual(db.scalar(select(func.count()).select_from(models.ApplicationArchive)), 1)
