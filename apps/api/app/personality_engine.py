from __future__ import annotations

from typing import Any


DIMENSIONS = (
    {
        "key": "openness", "dimension": "开放性", "label": "探索开放",
        "keywords": ("好奇", "探索", "学习", "想学", "尝试", "创新", "新知识", "知识", "技能", "提升", "感兴趣", "喜欢", "好玩", "有趣", "实践", "接触", "了解", "研究"),
        "description": "在当前材料中表现出接触新知识、尝试新方法或主动探索的倾向。",
    },
    {
        "key": "conscientiousness", "dimension": "尽责性", "label": "行动落实",
        "keywords": ("负责", "完成", "坚持", "计划", "规划", "认真", "稳定投入", "自律", "按时", "落实", "积累", "准备", "实操"),
        "description": "在当前材料中表现出规划、持续投入或把任务落实到结果的倾向。",
    },
    {
        "key": "extraversion", "dimension": "外向性", "label": "主动表达",
        "keywords": ("沟通", "交流", "表达", "分享", "组织", "宣传", "外联", "活跃", "认识朋友", "认识同学", "结识", "交朋友", "交友", "人脉", "学长学姐"),
        "description": "在当前材料中表现出主动沟通、组织互动或公开表达的倾向。",
    },
    {
        "key": "agreeableness", "dimension": "宜人性", "label": "协作共情",
        "keywords": ("团队", "合作", "协作", "帮助", "共同", "贡献", "一起", "互相", "服务", "配合", "志同道合"),
        "description": "在当前材料中表现出关注合作、共同目标或支持他人的倾向。",
    },
    {
        "key": "emotional_stability", "dimension": "情绪稳定性", "label": "压力稳定",
        "keywords": ("困难", "挑战", "冷静", "耐心", "压力", "失败", "排查", "解决问题", "复盘"),
        "description": "在当前材料中表现出面对困难、压力或不确定性时继续处理问题的倾向。",
    },
)


def _excerpt(text: str, keyword: str, radius: int = 28) -> str:
    index = text.find(keyword)
    if index < 0:
        return ""
    start = max(0, index - radius)
    end = min(len(text), index + len(keyword) + radius)
    value = " ".join(text[start:end].split())
    return f"…{value}…" if start or end < len(text) else value


def analyze_personality_signals(
    motivation: str = "", prior_experience: str = "", available_time: str = "", interview_text: str = "",
) -> dict[str, Any]:
    """Create preliminary, auditable Big Five language signals, not a hiring score."""
    sources = (
        ("报名动机", motivation or ""),
        ("相关经历", prior_experience or ""),
        ("时间投入", available_time or ""),
        ("面试表达", interview_text or ""),
    )
    dimensions: list[dict[str, Any]] = []
    for config in DIMENSIONS:
        evidence: list[dict[str, str]] = []
        matched_keywords: set[str] = set()
        matched_sources: set[str] = set()
        for source_name, source_text in sources:
            for keyword in config["keywords"]:
                if keyword in source_text:
                    matched_keywords.add(keyword)
                    matched_sources.add(source_name)
                    if len(evidence) < 3:
                        evidence.append({"source": source_name, "keyword": keyword, "excerpt": _excerpt(source_text, keyword)})
        if not evidence:
            continue
        signal_score = round(min(0.52 + len(matched_keywords) * 0.045 + len(matched_sources) * 0.025, 0.82), 2)
        confidence = round(min(0.30 + len(evidence) * 0.08 + len(matched_sources) * 0.05, 0.68), 2)
        dimensions.append({
            "key": config["key"], "dimension": config["dimension"], "label": config["label"],
            "signal_score": signal_score, "confidence": confidence,
            "evidence_count": len(evidence), "description": config["description"], "evidence": evidence,
        })

    dimensions.sort(key=lambda item: (item["confidence"], item["signal_score"]), reverse=True)
    tags = dimensions[:3]
    return {
        "framework": "Big Five 行为维度",
        "model_version": "big5-language-signals-v1",
        "status": "preliminary" if tags else "insufficient_data",
        "tags": tags,
        "dimensions": dimensions,
        "summary": f"从现有自述材料中识别到 {len(tags)} 个初步人格信号。" if tags else "现有材料不足以形成可解释的人格标签。",
        "score_note": "信号强度只表示当前材料中的语言特征，不是常模百分位，也不是心理诊断分数。",
        "notice": "人格标签用于理解沟通与协作方式，不得单独用于筛选、排序或决定录取。",
    }
