from abc import ABC, abstractmethod
from pydantic import BaseModel, Field


class ExtractedEvidence(BaseModel):
    dimension: str
    direction: str = Field(pattern="^(positive|negative|neutral)$")
    strength: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    description: str
    reasoning_summary: str
    quote: str


class MaterialAnalysisOutput(BaseModel):
    summary: str
    material_types: list[str]
    extracted_facts: list[dict]
    uncertainties: list[str]
    suggested_questions: list[str]


class AIProvider(ABC):
    @abstractmethod
    def extract_interview_evidence(self, transcript: str) -> list[ExtractedEvidence]:
        raise NotImplementedError

    @abstractmethod
    def analyze_materials(self, materials: list[dict], notes: str) -> MaterialAnalysisOutput:
        raise NotImplementedError


class MockAIProvider(AIProvider):
    """可复现的开发 Provider。输出与真实 Provider 使用相同结构。"""

    def extract_interview_evidence(self, transcript: str) -> list[ExtractedEvidence]:
        normalized = transcript.lower()
        evidence: list[ExtractedEvidence] = []

        if any(word in normalized for word in ["供电", "接线", "排查", "先确认"]):
            evidence.append(ExtractedEvidence(
                dimension="Debug 思维",
                direction="positive",
                strength=0.78,
                confidence=0.84,
                description="能够按供电、接线、通信、配置的顺序提出排查路径。",
                reasoning_summary="回答包含分层排查步骤，说明候选人具备基础故障定位框架。",
                quote="我会先看看供电是不是正常，然后确认接线，再看通信协议。",
            ))
        if any(word in normalized for word in ["i2c", "设备地址", "寄存器", "stm32"]):
            evidence.append(ExtractedEvidence(
                dimension="嵌入式基础",
                direction="positive",
                strength=0.72,
                confidence=0.79,
                description="能结合 I2C 地址扫描与寄存器配置说明排查方法。",
                reasoning_summary="提到了具体总线工具和配置层，证据强于泛化自我陈述。",
                quote="如果是 I2C 的话会看看能不能扫描到设备地址，之后再看寄存器配置。",
            ))
        if any(word in normalized for word in ["通信协议", "寄存器", "datasheet", "手册"]):
            evidence.append(ExtractedEvidence(
                dimension="协议与手册意识",
                direction="positive",
                strength=0.64,
                confidence=0.76,
                description="排查过程中关注通信协议与寄存器配置。",
                reasoning_summary="回答显示候选人知道问题可能来自协议和器件配置，但尚无真实项目交付佐证。",
                quote="再看通信协议，之后再看寄存器配置。",
            ))

        if not evidence:
            evidence.append(ExtractedEvidence(
                dimension="问题表达",
                direction="positive",
                strength=0.42,
                confidence=0.48,
                description="能够围绕问题给出相关回应。",
                reasoning_summary="当前逐字稿信息有限，只生成低强度待审核证据。",
                quote=transcript[:120],
            ))
        return evidence

    def analyze_materials(self, materials: list[dict], notes: str) -> MaterialAnalysisOutput:
        suffix_names = {
            "xlsx": "问卷或表格", "xls": "问卷或表格", "csv": "结构化记录",
            "pdf": "PDF 文档", "docx": "文档材料", "txt": "文本记录",
            "md": "文本记录", "json": "结构化数据",
        }
        material_types = list(dict.fromkeys(suffix_names.get(item.get("suffix", ""), "其他资料") for item in materials))
        text = "\n".join([item.get("text", "") for item in materials] + [notes]).lower()
        facts: list[dict] = []
        keyword_map = {
            "STM32 / 嵌入式": ["stm32", "单片机", "嵌入式"],
            "ROS / 机器人软件": ["ros", "机器人操作系统"],
            "机械设计": ["solidworks", "机械设计", "结构设计"],
            "控制与算法": ["pid", "控制", "算法"],
            "团队协作": ["协作", "队友", "团队", "负责人"],
        }
        for label, keywords in keyword_map.items():
            hit = next((keyword for keyword in keywords if keyword in text), None)
            if hit:
                facts.append({"label": label, "value": f"材料中出现“{hit}”相关描述", "source": "上传资料", "confidence": 0.72})
        if not facts:
            facts.append({"label": "资料结构", "value": "已识别文件类型与基础元数据，内容事实需要人工确认", "source": "资料包", "confidence": 0.56})
        unread = [item for item in materials if not item.get("text")]
        uncertainties = []
        if unread:
            details = "；".join(f"{item['filename']}：{item.get('parser_status', '暂未提取正文')}" for item in unread)
            uncertainties.append(f"{len(unread)} 份资料尚未完成正文抽取（{details}）。")
        if not notes.strip():
            uncertainties.append("没有提供材料背景，暂时无法判断不同文件是否属于同一位报名者。")
        return MaterialAnalysisOutput(
            summary=f"已整理 {len(materials)} 份资料，覆盖{'、'.join(material_types)}。系统已将可确认事实、信息缺口和后续面试问题分开保存。",
            material_types=material_types,
            extracted_facts=facts,
            uncertainties=uncertainties or ["材料中的自我陈述尚未由面试或项目记录交叉验证。"],
            suggested_questions=[
                "请选一个材料中提到的经历，说明你本人负责的部分和最终结果。",
                "遇到技术问题时，你通常如何定位原因并验证解决方案？",
                "每周可稳定投入的时间和希望进入的方向是否仍与报名表一致？",
            ],
        )


class MeetingProvider(ABC):
    @abstractmethod
    def fetch_transcript(self, meeting_id: str) -> list[dict]:
        raise NotImplementedError


class MockMeetingProvider(MeetingProvider):
    def fetch_transcript(self, meeting_id: str) -> list[dict]:
        return [
            {"speaker_id": "speaker-1", "speaker_role": "interviewer", "start_time": 0, "end_time": 8,
             "text": "如果一个传感器突然没有数据，你会怎么排查？", "confidence": 0.98},
            {"speaker_id": "speaker-2", "speaker_role": "candidate", "start_time": 8, "end_time": 31,
             "text": "我会先看看供电是不是正常，然后确认接线，再看通信协议。如果是 I2C 的话会看看能不能扫描到设备地址，之后再看寄存器配置。", "confidence": 0.96},
        ]


def get_ai_provider() -> AIProvider:
    return MockAIProvider()
