from __future__ import annotations

import json
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree


TEXT_LIMIT = 12000


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "gb18030", "utf-16"):
        try:
            return content.decode(encoding)[:TEXT_LIMIT]
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")[:TEXT_LIMIT]


def _xlsx_text(content: bytes) -> str:
    with ZipFile(BytesIO(content)) as workbook:
        namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        shared: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall("x:si", namespace):
                shared.append("".join(node.text or "" for node in item.iterfind(".//x:t", namespace)))

        lines: list[str] = []
        sheets = sorted(
            name for name in workbook.namelist()
            if PurePosixPath(name).parent == PurePosixPath("xl/worksheets") and name.endswith(".xml")
        )
        for sheet_name in sheets:
            root = ElementTree.fromstring(workbook.read(sheet_name))
            lines.append(f"[{PurePosixPath(sheet_name).stem}]")
            for row in root.findall(".//x:row", namespace):
                values: list[str] = []
                for cell in row.findall("x:c", namespace):
                    kind = cell.attrib.get("t")
                    value = cell.find("x:v", namespace)
                    inline = cell.find("x:is", namespace)
                    rendered = ""
                    if kind == "s" and value is not None and value.text:
                        index = int(value.text)
                        rendered = shared[index] if 0 <= index < len(shared) else ""
                    elif kind == "inlineStr" and inline is not None:
                        rendered = "".join(node.text or "" for node in inline.iterfind(".//x:t", namespace))
                    elif value is not None and value.text:
                        rendered = value.text
                    values.append(rendered.strip())
                if any(values):
                    lines.append(" | ".join(values))
                if sum(len(line) for line in lines) >= TEXT_LIMIT:
                    return "\n".join(lines)[:TEXT_LIMIT]
        return "\n".join(lines)[:TEXT_LIMIT]


def _docx_text(content: bytes) -> str:
    with ZipFile(BytesIO(content)) as document:
        root = ElementTree.fromstring(document.read("word/document.xml"))
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.iterfind(".//w:t", namespace)).strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)[:TEXT_LIMIT]


def extract_material_text(content: bytes, suffix: str) -> tuple[str, str]:
    """Return extracted text and a user-facing parser status without persisting the file."""
    try:
        if suffix in {"csv", "txt", "md"}:
            return _decode_text(content), "全文已提取"
        if suffix == "json":
            decoded = _decode_text(content)
            try:
                return json.dumps(json.loads(decoded), ensure_ascii=False, indent=2)[:TEXT_LIMIT], "结构化内容已提取"
            except json.JSONDecodeError:
                return decoded, "按普通文本提取，JSON 格式需核对"
        if suffix == "xlsx":
            return _xlsx_text(content), "表格单元格已提取"
        if suffix == "docx":
            return _docx_text(content), "文档正文已提取"
    except (BadZipFile, KeyError, ValueError, ElementTree.ParseError):
        return "", "文件结构无法识别，需人工核对"
    if suffix == "pdf":
        return "", "PDF 需接入文本层解析或 OCR"
    if suffix == "xls":
        return "", "旧版 XLS 需转换为 XLSX 后解析"
    return "", "暂未提取正文"
