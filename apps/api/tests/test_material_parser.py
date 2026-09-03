from io import BytesIO
from unittest import TestCase

from zipfile import ZipFile
import pymupdf
from PIL import Image, ImageDraw, ImageFont

from app.material_parser import extract_material_text, extract_xlsx_records


def make_scan() -> bytes:
    image = Image.new("RGB", (900, 220), "white")
    draw = ImageDraw.Draw(image)
    draw.text((30, 60), "STM32 ROBOT TEAM 2026", font=ImageFont.load_default(size=58), fill="black")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_xlsx() -> bytes:
    worksheet = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>姓名</t></is></c><c r="B1" t="inlineStr"><is><t>学号</t></is></c><c r="C1" t="inlineStr"><is><t>专业</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>张三</t></is></c><c r="C2" t="inlineStr"><is><t>自动化</t></is></c></row>
</sheetData></worksheet>"""
    buffer = BytesIO()
    with ZipFile(buffer, "w") as workbook:
        workbook.writestr("xl/worksheets/sheet1.xml", worksheet)
    return buffer.getvalue()


class MaterialParserTests(TestCase):
    def test_image_ocr_returns_text_and_auditable_metrics(self) -> None:
        result = extract_material_text(make_scan(), "png")

        self.assertEqual(result.status, "ocr_complete")
        self.assertEqual(result.method, "image_ocr")
        self.assertEqual(result.ocr_page_count, 1)
        self.assertIn("STM32", result.text)
        self.assertGreater(result.confidence or 0, 0.8)

    def test_xlsx_records_preserve_blank_columns(self) -> None:
        records = extract_xlsx_records(make_xlsx())

        self.assertEqual(records, [{"姓名": "张三", "学号": "", "专业": "自动化"}])

    def test_pdf_prefers_a_usable_text_layer(self) -> None:
        document = pymupdf.open()
        page = document.new_page()
        page.insert_text((72, 90), "STM32 robot team candidate project control systems 2026")
        payload = document.tobytes()
        document.close()

        result = extract_material_text(payload, "pdf")

        self.assertEqual(result.method, "pdf_text")
        self.assertEqual(result.ocr_page_count, 0)
        self.assertIn("candidate project", result.text)

    def test_scanned_pdf_automatically_falls_back_to_ocr(self) -> None:
        document = pymupdf.open()
        page = document.new_page(width=600, height=180)
        page.insert_image(page.rect, stream=make_scan())
        payload = document.tobytes()
        document.close()

        result = extract_material_text(payload, "pdf")

        self.assertEqual(result.method, "pdf_hybrid_ocr")
        self.assertEqual(result.ocr_page_count, 1)
        self.assertIn("ROBOT TEAM", result.text)

    def test_invalid_json_is_read_as_text_with_a_warning(self) -> None:
        result = extract_material_text(b'{"candidate": "A"', "json")

        self.assertEqual(result.status, "partial")
        self.assertEqual(result.method, "text_decode")
        self.assertTrue(result.warnings)
