from io import BytesIO
from unittest import TestCase

import pymupdf
from PIL import Image, ImageDraw, ImageFont

from app.material_parser import extract_material_text


def make_scan() -> bytes:
    image = Image.new("RGB", (900, 220), "white")
    draw = ImageDraw.Draw(image)
    draw.text((30, 60), "STM32 ROBOT TEAM 2026", font=ImageFont.load_default(size=58), fill="black")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class MaterialParserTests(TestCase):
    def test_image_ocr_returns_text_and_auditable_metrics(self) -> None:
        result = extract_material_text(make_scan(), "png")

        self.assertEqual(result.status, "ocr_complete")
        self.assertEqual(result.method, "image_ocr")
        self.assertEqual(result.ocr_page_count, 1)
        self.assertIn("STM32", result.text)
        self.assertGreater(result.confidence or 0, 0.8)

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
