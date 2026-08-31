#!/usr/bin/env python3
"""Convert the official BlueROV2 R4 STEP assembly to a named binary glTF."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.Message import Message_ProgressRange
from OCP.RWGltf import RWGltf_CafWriter
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.TDF import TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: build-bluerov2-native.py <input.step> <output.glb>", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()

    document = TDocStd_Document(TCollection_ExtendedString("BlueROV2 R4"))
    reader = STEPCAFControl_Reader()
    reader.SetColorMode(True)
    reader.SetNameMode(True)
    reader.SetLayerMode(True)
    reader.SetPropsMode(True)

    read_status = reader.ReadFile(str(input_path))
    if int(read_status) != 1:
        raise RuntimeError(f"STEP read failed with status {int(read_status)}")
    if not reader.Transfer(document, Message_ProgressRange()):
        raise RuntimeError("STEP transfer to XCAF document failed")

    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    free_labels = TDF_LabelSequence()
    shape_tool.GetFreeShapes(free_labels)
    if free_labels.Length() == 0:
        raise RuntimeError("No free assembly shapes found")

    for label_index in range(1, free_labels.Length() + 1):
        shape = XCAFDoc_ShapeTool.GetShape_s(free_labels.Value(label_index))
        mesher = BRepMesh_IncrementalMesh(shape, 1.2, False, 0.35, True)
        mesher.Perform()
        if not mesher.IsDone():
            raise RuntimeError(f"Meshing failed for root shape {label_index}")

    writer = RWGltf_CafWriter(TCollection_AsciiString(str(output_path)), True)
    file_info = TColStd_IndexedDataMapOfStringString()
    file_info.Add(TCollection_AsciiString("Title"), TCollection_AsciiString("BlueROV2 R4 Exploded Assembly"))
    file_info.Add(TCollection_AsciiString("Author"), TCollection_AsciiString("Blue Robotics public CAD; web conversion by Codex"))
    if not writer.Perform(document, file_info, Message_ProgressRange()):
        raise RuntimeError("glTF export failed")

    print(
        json.dumps(
            {
                "success": True,
                "rootShapes": free_labels.Length(),
                "outputBytes": output_path.stat().st_size,
                "elapsedSeconds": round(time.time() - started, 1),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
