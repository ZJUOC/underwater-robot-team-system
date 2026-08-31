from types import SimpleNamespace
from unittest import TestCase

from fastapi import HTTPException
from app.material_parser import extract_material_text
from app.providers import MockAIProvider, ResearchCitation
from app.research import _require_editable, _validated_output


MATERIALS = [{
    "filename": "水下机器人调研.md",
    "suffix": "md",
    "text": "ROV 通过脐带缆通信，AUV 依赖自主导航。参考资料来自制造商官网。",
    "segments": [{
        "locator": "系统对比",
        "text": "ROV 通过脐带缆通信，AUV 依赖自主导航。参考资料来自制造商官网。",
        "method": "text_decode",
        "confidence": None,
    }],
    "extraction": {"status": "complete"},
}]

MEMBERS = [{
    "member_id": index,
    "name": f"候选人{index}",
    "role_summary": "ROV 通信" if index == 1 else "AUV 导航",
    "contribution": "查阅官网并比较推进、导航、通信与密封方案，交叉验证来源。",
    "key_findings": "ROV 适合水池调试，AUV 适合自主任务。",
    "challenges": "不同来源参数口径不一致。",
    "source_validation": "优先核对制造商官网与论文。",
    "preferred_direction": "控制与导航",
} for index in (1, 2, 3)]


class ResearchAssessmentTests(TestCase):
    def test_decided_team_is_read_only(self) -> None:
        with self.assertRaises(HTTPException) as captured:
            _require_editable(SimpleNamespace(status="decided"))

        self.assertEqual(captured.exception.status_code, 409)

    def test_text_material_is_split_into_addressable_segments(self) -> None:
        result = extract_material_text("[技术路线]\nROV 与 AUV 对比\n[资料来源]\n制造商官网".encode(), "md")

        self.assertEqual([item["locator"] for item in result.segments], ["技术路线", "资料来源"])
        self.assertIn("ROV", result.segments[0]["text"])

    def test_mock_assessment_keeps_team_and_individual_scores_separate(self) -> None:
        output = MockAIProvider().analyze_research_submission(MATERIALS, MEMBERS, {"title": "水下机器人调研"})

        self.assertLessEqual(output.team_score, 40)
        self.assertEqual({item.member_id for item in output.candidates}, {1, 2, 3})
        self.assertTrue(all(0 <= item.individual_score <= 60 for item in output.candidates))
        self.assertEqual(sum(item.max_score for item in output.criteria), 40)
        self.assertTrue(all(sum(row.max_score for row in item.criteria) == 60 for item in output.candidates))

    def test_non_verbatim_citations_are_removed(self) -> None:
        output = MockAIProvider().analyze_research_submission(MATERIALS, MEMBERS, {"title": "水下机器人调研"})
        output.evidence.append(ResearchCitation(
            filename="水下机器人调研.md", locator="系统对比", quote="材料中不存在的推断",
        ))

        validated = _validated_output(output, MATERIALS)

        self.assertNotIn("材料中不存在的推断", [item.quote for item in validated.evidence])
        for citation in validated.evidence:
            self.assertIn(citation.quote, MATERIALS[0]["segments"][0]["text"])
