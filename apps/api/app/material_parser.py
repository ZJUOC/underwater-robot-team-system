from __future__ import annotations

import json
import re
import threading
from dataclasses import asdict, dataclass, field
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any, Optional
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree


TEXT_LIMIT = 30_000
MAX_PDF_PAGES = 25
MAX_IMAGE_FRAMES = 10
MAX_IMAGE_EDGE = 3_600
MIN_PDF_TEXT_CHARS = 40
MAX_ARCHIVE_ENTRIES = 2_000
MAX_ARCHIVE_UNCOMPRESSED = 80 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000


@dataclass
class MaterialExtractionResult:
    text: str = ""
    status: str = "complete"
    status_label: str = "读取完成"
    method: str = "unknown"
    method_label: str = "未知方式"
    page_count: int = 1
    ocr_page_count: int = 0
    char_count: int = 0
    confidence: Optional[float] = None
    warnings: list[str] = field(default_factory=list)
    segments: list[dict[str, Any]] = field(default_factory=list)

    def report(self, filename: str, suffix: str, size: int) -> dict[str, Any]:
        payload = asdict(self)
        payload.pop("text")
        payload.pop("segments")
        return {"filename": filename, "suffix": suffix, "size": size, **payload}


_ocr_engine: Any = None
_ocr_init_lock = threading.Lock()
_ocr_run_lock = threading.Lock()


def _split_segments(text: str, method: str, confidence: Optional[float] = None) -> list[dict[str, Any]]:
    """Split parser markers into source-addressable sections for reviewer citations."""
    if not text.strip():
        return []
    marker = re.compile(r"^\[(.+)]$")
    segments: list[dict[str, Any]] = []
    locator = "全文"
    lines: list[str] = []
    for line in text.splitlines():
        matched = marker.match(line.strip())
        if matched:
            if lines:
                value = "\n".join(lines).strip()
                if value:
                    segments.append({"locator": locator, "text": value, "method": method, "confidence": confidence})
            locator = matched.group(1)
            lines = []
        else:
            lines.append(line)
    value = "\n".join(lines).strip()
    if value:
        segments.append({"locator": locator, "text": value, "method": method, "confidence": confidence})
    return segments or [{"locator": "全文", "text": text.strip(), "method": method, "confidence": confidence}]


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "gb18030", "utf-16"):
        try:
            return content.decode(encoding)[:TEXT_LIMIT]
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")[:TEXT_LIMIT]


def _validate_archive(archive: ZipFile) -> None:
    entries = archive.infolist()
    if len(entries) > MAX_ARCHIVE_ENTRIES:
        raise ValueError("压缩文档包含过多条目")
    if sum(entry.file_size for entry in entries) > MAX_ARCHIVE_UNCOMPRESSED:
        raise ValueError("压缩文档展开后超过安全限制")


def _xlsx_shared_strings(workbook: ZipFile, namespace: dict[str, str]) -> list[str]:
    if "xl/sharedStrings.xml" not in workbook.namelist():
        return []
    root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.iterfind(".//x:t", namespace))
            for item in root.findall("x:si", namespace)]


def _xlsx_cell_text(cell: Any, shared: list[str], namespace: dict[str, str]) -> str:
    kind = cell.attrib.get("t")
    value = cell.find("x:v", namespace)
    inline = cell.find("x:is", namespace)
    if kind == "s" and value is not None and value.text:
        index = int(value.text)
        return shared[index].strip() if 0 <= index < len(shared) else ""
    if kind == "inlineStr" and inline is not None:
        return "".join(node.text or "" for node in inline.iterfind(".//x:t", namespace)).strip()
    return value.text.strip() if value is not None and value.text else ""


def _xlsx_column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    if not letters:
        return 0
    index = 0
    for letter in letters.group():
        index = index * 26 + ord(letter) - ord("A") + 1
    return index - 1


def extract_xlsx_records(content: bytes) -> list[dict[str, str]]:
    """Read the first non-empty XLSX worksheet as header-keyed text rows."""
    with ZipFile(BytesIO(content)) as workbook:
        _validate_archive(workbook)
        namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        shared = _xlsx_shared_strings(workbook, namespace)
        sheets = sorted(
            name for name in workbook.namelist()
            if PurePosixPath(name).parent == PurePosixPath("xl/worksheets") and name.endswith(".xml")
        )
        for sheet_name in sheets:
            root = ElementTree.fromstring(workbook.read(sheet_name))
            table: list[list[str]] = []
            for row in root.findall(".//x:row", namespace):
                cells = {
                    _xlsx_column_index(cell.attrib.get("r", "")): _xlsx_cell_text(cell, shared, namespace)
                    for cell in row.findall("x:c", namespace)
                }
                if cells:
                    table.append([cells.get(index, "") for index in range(max(cells) + 1)])
            if not table:
                continue
            headers = [value.strip() for value in table[0]]
            return [
                {header: values[index] if index < len(values) else ""
                 for index, header in enumerate(headers) if header}
                for values in table[1:] if any(values)
            ]
    return []


def _xlsx_text(content: bytes) -> tuple[str, int]:
    with ZipFile(BytesIO(content)) as workbook:
        _validate_archive(workbook)
        namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        shared = _xlsx_shared_strings(workbook, namespace)

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
                    values.append(_xlsx_cell_text(cell, shared, namespace))
                if any(values):
                    lines.append(" | ".join(values))
                if sum(len(line) for line in lines) >= TEXT_LIMIT:
                    return "\n".join(lines)[:TEXT_LIMIT], len(sheets)
        return "\n".join(lines)[:TEXT_LIMIT], len(sheets)


def _xls_text(content: bytes) -> tuple[str, int]:
    import xlrd

    workbook = xlrd.open_workbook(file_contents=content, on_demand=True)
    lines: list[str] = []
    for sheet in workbook.sheets():
        lines.append(f"[{sheet.name}]")
        for row_index in range(sheet.nrows):
            values = [str(value).strip() for value in sheet.row_values(row_index)]
            if any(values):
                lines.append(" | ".join(values))
            if sum(len(line) for line in lines) >= TEXT_LIMIT:
                return "\n".join(lines)[:TEXT_LIMIT], workbook.nsheets
    return "\n".join(lines)[:TEXT_LIMIT], workbook.nsheets


def _docx_text(content: bytes) -> str:
    with ZipFile(BytesIO(content)) as document:
        _validate_archive(document)
        root = ElementTree.fromstring(document.read("word/document.xml"))
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.iterfind(".//w:t", namespace)).strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)[:TEXT_LIMIT]


def _pptx_text(content: bytes) -> tuple[str, int]:
    namespace = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    with ZipFile(BytesIO(content)) as presentation:
        _validate_archive(presentation)
        slides = sorted(
            name for name in presentation.namelist()
            if PurePosixPath(name).parent == PurePosixPath("ppt/slides") and name.endswith(".xml")
        )
        lines: list[str] = []
        for index, slide_name in enumerate(slides, start=1):
            root = ElementTree.fromstring(presentation.read(slide_name))
            text = " ".join(node.text or "" for node in root.findall(".//a:t", namespace)).strip()
            if text:
                lines.append(f"[第 {index} 页]\n{text}")
            if sum(len(line) for line in lines) >= TEXT_LIMIT:
                break
    return "\n".join(lines)[:TEXT_LIMIT], len(slides)


def _get_ocr_engine() -> Any:
    global _ocr_engine
    if _ocr_engine is None:
        with _ocr_init_lock:
            if _ocr_engine is None:
                from rapidocr import RapidOCR

                _ocr_engine = RapidOCR()
    return _ocr_engine


def _ocr_image(image: Any) -> tuple[str, list[float]]:
    import numpy as np
    from PIL import ImageOps

    prepared = ImageOps.exif_transpose(image).convert("RGB")
    if max(prepared.size) > MAX_IMAGE_EDGE:
        ratio = MAX_IMAGE_EDGE / max(prepared.size)
        prepared = prepared.resize(
            (max(1, int(prepared.width * ratio)), max(1, int(prepared.height * ratio)))
        )
    with _ocr_run_lock:
        output = _get_ocr_engine()(np.asarray(prepared))

    texts: list[str] = []
    scores: list[float] = []
    if output is None:
        return "", []
    if hasattr(output, "txts"):
        texts = [str(value) for value in (output.txts or []) if value]
        scores = [float(value) for value in (getattr(output, "scores", None) or [])]
    elif isinstance(output, tuple) and output:
        rows = output[0] or []
        for row in rows:
            if isinstance(row, (list, tuple)) and len(row) >= 3:
                texts.append(str(row[1]))
                scores.append(float(row[2]))
    return "\n".join(texts).strip(), scores


def _image_text(content: bytes) -> MaterialExtractionResult:
    from PIL import Image, UnidentifiedImageError

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    warnings: list[str] = []
    texts: list[str] = []
    scores: list[float] = []
    try:
        source = Image.open(BytesIO(content))
        if source.width * source.height > MAX_IMAGE_PIXELS:
            return _failed("image_ocr", "图片 OCR", "图片像素总量超过 4000 万安全限制。")
        frame_count = int(getattr(source, "n_frames", 1))
        processed_frames = min(frame_count, MAX_IMAGE_FRAMES)
        if frame_count > MAX_IMAGE_FRAMES:
            warnings.append(f"图片共 {frame_count} 页，仅处理前 {MAX_IMAGE_FRAMES} 页。")
        for index in range(processed_frames):
            source.seek(index)
            text, frame_scores = _ocr_image(source.copy())
            if text:
                label = f"[第 {index + 1} 页 / OCR]\n" if frame_count > 1 else ""
                texts.append(f"{label}{text}")
                scores.extend(frame_scores)
            else:
                warnings.append(f"第 {index + 1} 页未识别到清晰文字。")
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as exc:
        return _failed("image_ocr", "图片 OCR", f"图片无法读取：{exc}")

    text = "\n".join(texts)[:TEXT_LIMIT]
    confidence = round(sum(scores) / len(scores), 4) if scores else None
    status = "ocr_complete" if text and not warnings else "partial" if text else "failed"
    return MaterialExtractionResult(
        text=text,
        status=status,
        status_label={"ocr_complete": "OCR 已完成", "partial": "部分读取", "failed": "读取失败"}[status],
        method="image_ocr",
        method_label="图片 OCR",
        page_count=frame_count,
        ocr_page_count=processed_frames,
        char_count=len(text),
        confidence=confidence,
        warnings=warnings or ([] if text else ["未识别到可用文字，请检查图片清晰度。"]),
        segments=_split_segments(text, "image_ocr", confidence),
    )


def _pdf_text(content: bytes) -> MaterialExtractionResult:
    import pymupdf
    from PIL import Image

    try:
        document = pymupdf.open(stream=content, filetype="pdf")
    except Exception as exc:
        return _failed("pdf_hybrid", "PDF 文本层 + OCR", f"PDF 无法打开：{exc}")
    if document.needs_pass:
        document.close()
        return _failed("pdf_hybrid", "PDF 文本层 + OCR", "PDF 已加密，需要先移除密码。")

    total_pages = document.page_count
    processed_pages = min(total_pages, MAX_PDF_PAGES)
    warnings: list[str] = []
    texts: list[str] = []
    scores: list[float] = []
    ocr_pages = 0
    if total_pages > MAX_PDF_PAGES:
        warnings.append(f"PDF 共 {total_pages} 页，仅处理前 {MAX_PDF_PAGES} 页。")
    try:
        for index in range(processed_pages):
            page = document.load_page(index)
            layer_text = page.get_text("text", sort=True).strip()
            visible_chars = len("".join(layer_text.split()))
            if visible_chars >= MIN_PDF_TEXT_CHARS:
                texts.append(f"[第 {index + 1} 页 / 文本层]\n{layer_text}")
                continue
            scale = 180 / 72
            if max(page.rect.width * scale, page.rect.height * scale) > MAX_IMAGE_EDGE:
                scale = MAX_IMAGE_EDGE / max(page.rect.width, page.rect.height)
            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csRGB, alpha=False
            )
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            ocr_text, page_scores = _ocr_image(image)
            ocr_pages += 1
            scores.extend(page_scores)
            if ocr_text:
                texts.append(f"[第 {index + 1} 页 / OCR]\n{ocr_text}")
            elif layer_text:
                texts.append(f"[第 {index + 1} 页 / 文本层（内容较少）]\n{layer_text}")
                warnings.append(f"第 {index + 1} 页 OCR 未识别到更多文字。")
            else:
                warnings.append(f"第 {index + 1} 页未识别到清晰文字。")
    except Exception as exc:
        warnings.append(f"解析过程中断：{exc}")
    finally:
        document.close()

    text = "\n".join(texts)[:TEXT_LIMIT]
    confidence = round(sum(scores) / len(scores), 4) if scores else None
    if not text:
        status, label = "failed", "读取失败"
    elif warnings:
        status, label = "partial", "部分读取"
    elif ocr_pages:
        status, label = "ocr_complete", "OCR 已完成"
    else:
        status, label = "complete", "读取完成"
    method = "pdf_hybrid_ocr" if ocr_pages else "pdf_text"
    method_label = "PDF 文本层 + OCR" if ocr_pages else "PDF 文本层"
    return MaterialExtractionResult(
        text=text,
        status=status,
        status_label=label,
        method=method,
        method_label=method_label,
        page_count=total_pages,
        ocr_page_count=ocr_pages,
        char_count=len(text),
        confidence=confidence,
        warnings=warnings or ([] if text else ["PDF 中没有可读取的文字。"]),
        segments=_split_segments(text, method, confidence),
    )


def _complete(text: str, method: str, method_label: str, page_count: int = 1) -> MaterialExtractionResult:
    text = text[:TEXT_LIMIT]
    return MaterialExtractionResult(
        text=text,
        status="complete" if text else "partial",
        status_label="读取完成" if text else "未发现正文",
        method=method,
        method_label=method_label,
        page_count=page_count,
        char_count=len(text),
        warnings=[] if text else ["文件中没有发现可提取的正文。"],
        segments=_split_segments(text, method),
    )


def _failed(method: str, method_label: str, warning: str) -> MaterialExtractionResult:
    return MaterialExtractionResult(
        status="failed",
        status_label="读取失败",
        method=method,
        method_label=method_label,
        page_count=0,
        warnings=[warning],
    )


def extract_material_text(content: bytes, suffix: str) -> MaterialExtractionResult:
    """Extract upload contents in memory and return an auditable report."""
    suffix = suffix.lower()
    try:
        if suffix in {"csv", "txt", "md"}:
            return _complete(_decode_text(content), "text_decode", "文本编码识别")
        if suffix == "json":
            decoded = _decode_text(content)
            try:
                text = json.dumps(json.loads(decoded), ensure_ascii=False, indent=2)
                return _complete(text, "json_parse", "JSON 结构化解析")
            except json.JSONDecodeError:
                result = _complete(decoded, "text_decode", "按普通文本读取")
                result.status = "partial"
                result.status_label = "部分读取"
                result.warnings.append("JSON 结构不完整，已按普通文本读取。")
                return result
        if suffix == "xlsx":
            text, sheets = _xlsx_text(content)
            return _complete(text, "xlsx_xml", "XLSX 单元格解析", sheets)
        if suffix == "xls":
            text, sheets = _xls_text(content)
            return _complete(text, "xls_parse", "XLS 单元格解析", sheets)
        if suffix == "docx":
            return _complete(_docx_text(content), "docx_xml", "DOCX 正文解析")
        if suffix == "pptx":
            text, slides = _pptx_text(content)
            return _complete(text, "pptx_xml", "PPTX 文本解析", slides)
        if suffix == "pdf":
            return _pdf_text(content)
        if suffix in {"png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"}:
            return _image_text(content)
    except (BadZipFile, KeyError, ValueError, ElementTree.ParseError) as exc:
        return _failed("document_parse", "文档结构解析", f"文件结构无法识别：{exc}")
    except ImportError as exc:
        return _failed("dependency_missing", "解析组件", f"服务器缺少解析组件：{exc.name}")
    except Exception as exc:
        return _failed("document_parse", "文档结构解析", f"读取失败：{exc}")
    return _failed("unsupported", "暂不支持", "该文件类型尚未配置解析器。")
