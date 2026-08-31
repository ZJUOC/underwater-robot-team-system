#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  console.error("Usage: node tools/prepare-bluerov2-glb.cjs <input.glb> <output.glb>");
  process.exit(1);
}

function align4(value) {
  return (value + 3) & ~3;
}

function parseGlb(source) {
  if (source.readUInt32LE(0) !== 0x46546c67) throw new Error("Not a GLB file");
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = source.readUInt32LE(binaryHeader);
  return { json, binary: source.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength) };
}

function writeGlb(json, binary) {
  const jsonSource = Buffer.from(JSON.stringify(json), "utf8");
  const jsonLength = align4(jsonSource.length);
  const binaryLength = align4(binary.length);
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binaryLength, 0x20);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonSource.copy(output, 20);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

function collectNodeNames(gltf, nodeIndex, destination) {
  const node = gltf.nodes[nodeIndex];
  if (node.name) destination.push(node.name);
  if (node.mesh !== undefined && gltf.meshes[node.mesh]?.name) destination.push(gltf.meshes[node.mesh].name);
  for (const childIndex of node.children || []) collectNodeNames(gltf, childIndex, destination);
}

function blankDescendantNames(gltf, nodeIndex, isRoot = true) {
  const node = gltf.nodes[nodeIndex];
  if (!isRoot) delete node.name;
  if (node.mesh !== undefined && gltf.meshes[node.mesh]) delete gltf.meshes[node.mesh].name;
  for (const childIndex of node.children || []) blankDescendantNames(gltf, childIndex, false);
}

function findAssemblyRoot(gltf) {
  const sceneRoots = gltf.scenes[gltf.scene || 0].nodes || [];
  let current = sceneRoots[0];
  while (gltf.nodes[current]?.children?.length === 1 && !gltf.nodes[current]?.mesh) {
    const child = gltf.nodes[current].children[0];
    if ((gltf.nodes[child].name || "").includes("BLUEROV2-R4")) return child;
    current = child;
  }
  return current;
}

function classify(signature, thrusterIndex, componentIndex) {
  if (componentIndex === 0) return { id: "frame", kind: "frame", code: "FRM-01", label: "框架与浮力结构" };
  if (componentIndex === 1) return { id: "electronics", kind: "electronics", code: "CORE-01", label: "4 英寸控制电子舱" };
  if (componentIndex === 2) return { id: "battery", kind: "battery", code: "PWR-01", label: "3 英寸电池耐压舱" };
  if (/T200-ASM/i.test(signature)) {
    return { id: `thruster-${thrusterIndex}`, kind: "thruster", code: `THR-${String(thrusterIndex).padStart(2, "0")}`, label: `T200 推进器 ${String(thrusterIndex).padStart(2, "0")}` };
  }
  if (/PRV-|WL-|WLP-|BULKHEAD|PENETRATOR|BLANK/i.test(signature)) return { id: "sealing", kind: "sealing", code: "SEAL-01", label: "密封与穿舱连接" };
  if (/BATTERY/i.test(signature)) return { id: "battery", kind: "battery", code: "PWR-01", label: "3 英寸电池耐压舱" };
  if (/BAR30/i.test(signature)) return { id: "sensor", kind: "sensor", code: "SNS-01", label: "Bar30 深度传感器" };
  if (/ROV-ELEC|ELECTRONIC|NAVIGATOR|RASPBERRY|FATHOM-X|CAMERA/i.test(signature)) return { id: "electronics", kind: "electronics", code: "CORE-01", label: "4 英寸控制电子舱" };
  if (/FRAME|PANEL|FAIRING|BUOYANCY|FOAM|BALLAST/i.test(signature)) return { id: "frame", kind: "frame", code: "FRM-01", label: "框架与浮力结构" };
  return null;
}

const source = fs.readFileSync(path.resolve(inputPath));
const { json: gltf, binary } = parseGlb(source);
const assemblyRoot = findAssemblyRoot(gltf);
const componentNodes = gltf.nodes[assemblyRoot].children || [];
let thrusterIndex = 0;
const groups = [];

for (const [componentIndex, componentNodeIndex] of componentNodes.entries()) {
  const names = [];
  collectNodeNames(gltf, componentNodeIndex, names);
  const signature = names.slice(0, 2000).join(" ");
  if (/T200-ASM/i.test(signature)) thrusterIndex += 1;
  const group = classify(signature, thrusterIndex, componentIndex);
  blankDescendantNames(gltf, componentNodeIndex, true);
  const node = gltf.nodes[componentNodeIndex];
  if (group) {
    node.name = `EXPLODE__${group.id}__${group.label}`;
    node.extras = {
      ...(node.extras || {}),
      assemblyGroup: group.id,
      assemblyKind: group.kind,
      code: group.code,
      label: group.label,
    };
    groups.push({ ...group, node: componentNodeIndex, sourceSample: names.slice(0, 3) });
  } else {
    delete node.name;
  }
}

gltf.asset.generator = `${gltf.asset.generator || "OpenCascade"}; prepared for interactive exploded view`;
gltf.asset.extras = {
  ...(gltf.asset.extras || {}),
  source: "https://cad.bluerobotics.com/BLUEROV2-R4.zip",
  sourceRevision: "R4",
  assemblyGroups: groups.map(({ sourceSample, node, ...group }) => group),
};

const output = writeGlb(gltf, binary);
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), output);
console.log(JSON.stringify({ assemblyRoot, componentCount: componentNodes.length, namedGroups: groups, outputBytes: output.length }, null, 2));
