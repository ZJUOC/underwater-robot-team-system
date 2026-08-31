"use client";

import Link from "next/link";
import { Suspense, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  Environment,
  Html,
  Lightformer,
  Line,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import {
  ArrowRight,
  ArrowsOutCardinal,
  Crosshair,
  CubeTransparent,
  Gauge,
  Lightning,
  Robot,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  Vector3,
} from "three";

type ActionMode = "idle" | "scan" | "explode" | "arm";

const THRUSTER_POSITIONS: [number, number, number][] = [
  [-2.08, 0.42, -0.92],
  [2.08, 0.42, -0.92],
  [-2.08, 0.42, 0.92],
  [2.08, 0.42, 0.92],
];

type ExplodedPartDefinition = {
  id: "top" | "port" | "starboard" | "front" | "rear" | "core";
  code: string;
  title: string;
  detail: string;
  offset: [number, number, number];
  anchor: [number, number, number];
  labelPosition: [number, number, number];
};

const EXPLODED_PARTS: ExplodedPartDefinition[] = [
  { id: "top", code: "FRM-01", title: "上层框架与浮力结构", detail: "承载上层安装面与浮力模块", offset: [0, 1.05, 0], anchor: [0, 1.45, 0], labelPosition: [-.4, 2.55, -.2] },
  { id: "port", code: "THR-L", title: "左舷推进组件", detail: "侧向推进与保护框架", offset: [-1.2, .08, 0], anchor: [-2.15, .35, .25], labelPosition: [-3.55, 1.05, .4] },
  { id: "starboard", code: "THR-R", title: "右舷推进组件", detail: "侧向推进与保护框架", offset: [1.2, .08, 0], anchor: [2.15, .25, .25], labelPosition: [3.65, .9, .45] },
  { id: "front", code: "VIS-01", title: "前视感知组件", detail: "摄像、照明与前端载荷", offset: [0, .05, 1.2], anchor: [0, .35, 2.05], labelPosition: [1.35, 1.55, 3.05] },
  { id: "rear", code: "PWR-01", title: "尾部动力组件", detail: "后端连接与动力支撑", offset: [0, .05, -1.05], anchor: [0, .3, -1.85], labelPosition: [-1.3, 1.4, -2.85] },
  { id: "core", code: "CORE-01", title: "耐压电子舱", detail: "控制、供电与通信核心", offset: [0, -.55, 0], anchor: [0, -.65, .15], labelPosition: [1.3, -1.55, .15] },
];

type AssemblyGroupId = "frame" | "propulsion" | "electronics" | "battery" | "sensor" | "sealing";

type AssemblyGroupDefinition = {
  id: AssemblyGroupId;
  code: string;
  title: string;
  detail: string;
  spec: string;
};

const ASSEMBLY_GROUPS: AssemblyGroupDefinition[] = [
  { id: "frame", code: "FRM-01", title: "框架与浮力结构", detail: "HDPE 主框架、4 组整流罩与浮力泡沫", spec: "457 × 338 × 254 mm" },
  { id: "propulsion", code: "THR-06", title: "六推进器阵列", detail: "4 台矢量推进 + 2 台垂直推进", spec: "6 × T200 · 9 kgf 前向推力" },
  { id: "electronics", code: "CORE-01", title: "控制电子舱", detail: "Navigator、Raspberry Pi 4、Fathom-X 与 ESC", spec: "4 英寸 WTE · 18 × M10" },
  { id: "battery", code: "PWR-01", title: "电池耐压舱", detail: "独立供电舱、XT90 与快速换电结构", spec: "3 英寸 WTE · 14.8 V" },
  { id: "sensor", code: "SNS-01", title: "感知与相机", detail: "Bar30、低照度 1080p 相机与姿态传感", spec: "110° 水下视场 · ±90° 俯仰" },
  { id: "sealing", code: "SEAL-01", title: "密封与穿舱连接", detail: "WetLink 穿舱件、盲堵、端盖与双 PRV", spec: "100–300 m 整机工作深度" },
];

function upgradeMaterial(source: MeshStandardMaterial) {
  const material = source.clone();
  if ("metalness" in material) {
    material.metalness = Math.max(material.metalness ?? 0, .42);
    material.roughness = Math.min(material.roughness ?? .5, .3);
    material.envMapIntensity = 2.15;
  }
  return material;
}

function filteredGeometry(source: BufferGeometry, indices: number[]) {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.morphAttributes = source.morphAttributes;
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
}

function buildExplodedModel(scene: Group) {
  scene.updateMatrixWorld(true);
  const sourceMeshes: Mesh[] = [];
  scene.traverse((object) => { if ((object as Mesh).isMesh) sourceMeshes.push(object as Mesh); });
  const partitioned = sourceMeshes.map((mesh) => {
    const geometry = mesh.geometry as BufferGeometry;
    const position = geometry.getAttribute("position");
    const sourceIndex = geometry.getIndex();
    const finalMatrix = new Matrix4()
      .makeRotationY(-Math.PI / 2)
      .multiply(new Matrix4().makeScale(9.6, 9.6, 9.6))
      .multiply(mesh.matrixWorld);
    const bounds = new Box3();
    const point = new Vector3();
    for (let index = 0; index < position.count; index += 1) {
      bounds.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(finalMatrix));
    }
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const groups = EXPLODED_PARTS.map(() => [] as number[]);
    const vertex = new Vector3();
    const vertexB = new Vector3();
    const vertexC = new Vector3();
    const triangleCount = sourceIndex ? sourceIndex.count : position.count;
    for (let index = 0; index < triangleCount; index += 3) {
      const a = sourceIndex ? sourceIndex.getX(index) : index;
      const b = sourceIndex ? sourceIndex.getX(index + 1) : index + 1;
      const c = sourceIndex ? sourceIndex.getX(index + 2) : index + 2;
      vertex
        .fromBufferAttribute(position, a)
        .add(vertexB.fromBufferAttribute(position, b))
        .add(vertexC.fromBufferAttribute(position, c))
        .multiplyScalar(1 / 3)
        .applyMatrix4(finalMatrix);
      const nx = (vertex.x - center.x) / Math.max(size.x / 2, .001);
      const ny = (vertex.y - center.y) / Math.max(size.y / 2, .001);
      const nz = (vertex.z - center.z) / Math.max(size.z / 2, .001);
      const groupIndex = ny > .34 ? 0 : nx < -.48 ? 1 : nx > .48 ? 2 : nz > .48 ? 3 : nz < -.5 ? 4 : 5;
      groups[groupIndex].push(a, b, c);
    }
    return { geometry, groups };
  });

  return EXPLODED_PARTS.map((definition, partIndex) => {
    const object = scene.clone(true);
    let meshIndex = 0;
    object.traverse((entry) => {
      const mesh = entry as Mesh;
      if (!mesh.isMesh) return;
      const source = partitioned[meshIndex];
      mesh.geometry = filteredGeometry(source.geometry, source.groups[partIndex]);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const upgraded = materials.map((material) => upgradeMaterial(material as MeshStandardMaterial));
      mesh.material = Array.isArray(mesh.material) ? upgraded : upgraded[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshIndex += 1;
    });
    return { ...definition, object };
  });
}

function CausticFloor() {
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.35, 0]} receiveShadow>
      <planeGeometry args={[48, 48, 1, 1]} />
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        side={DoubleSide}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;

          float caustic(vec2 uv, float t) {
            vec2 p = uv;
            float a = sin(p.x * 1.7 + t) * sin(p.y * 1.35 - t * .72);
            float b = sin((p.x + p.y) * 1.1 - t * .58) * sin((p.x - p.y) * 1.8 + t * .4);
            return pow(abs(a + b) * .5, 7.0);
          }

          void main() {
            vec2 p = (vUv - .5) * 34.0;
            float c = caustic(p, uTime * .72) + caustic(p * 1.37, -uTime * .45) * .45;
            float radial = 1.0 - smoothstep(5.0, 23.0, length(p));
            vec3 deep = vec3(.008, .035, .052);
            vec3 glow = vec3(.04, .48, .62);
            vec3 color = deep + glow * c * radial;
            gl_FragColor = vec4(color, .62 * radial + .12);
          }
        `}
      />
    </mesh>
  );
}

function AnimatedPart({
  position,
  offset,
  exploded,
  children,
}: {
  position: [number, number, number];
  offset: [number, number, number];
  exploded: boolean;
  children: ReactNode;
}) {
  const root = useRef<Group>(null);
  useLayoutEffect(() => {
    root.current?.position.set(...position);
  }, [position]);
  useFrame(() => {
    if (!root.current) return;
    root.current.position.x = MathUtils.lerp(root.current.position.x, position[0] + (exploded ? offset[0] : 0), .065);
    root.current.position.y = MathUtils.lerp(root.current.position.y, position[1] + (exploded ? offset[1] : 0), .065);
    root.current.position.z = MathUtils.lerp(root.current.position.z, position[2] + (exploded ? offset[2] : 0), .065);
  });
  return <group ref={root}>{children}</group>;
}

function Thruster({
  position,
  scanning,
  exploded,
}: {
  position: [number, number, number];
  scanning: boolean;
  exploded: boolean;
}) {
  const root = useRef<Group>(null);
  const rotor = useRef<Group>(null);
  const pulse = useRef<MeshBasicMaterial>(null);
  useLayoutEffect(() => {
    root.current?.position.set(...position);
  }, [position]);
  useFrame(({ clock }, delta) => {
    if (root.current) {
      const xOffset = exploded ? Math.sign(position[0]) * 1.15 : 0;
      const yOffset = exploded ? .48 : 0;
      const zOffset = exploded ? Math.sign(position[2]) * .45 : 0;
      root.current.position.x = MathUtils.lerp(root.current.position.x, position[0] + xOffset, .065);
      root.current.position.y = MathUtils.lerp(root.current.position.y, position[1] + yOffset, .065);
      root.current.position.z = MathUtils.lerp(root.current.position.z, position[2] + zOffset, .065);
    }
    if (rotor.current) rotor.current.rotation.z += delta * 5.8;
    if (pulse.current) {
      pulse.current.opacity = .22 + Math.sin(clock.elapsedTime * 4 + position[0]) * .09 + (scanning ? .16 : 0);
    }
  });

  return (
    <group ref={root}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[.48, .48, 1.18, 24]} />
        <meshStandardMaterial color="#182b33" metalness={.9} roughness={.24} />
      </mesh>
      <mesh position={[0, 0, .62]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[.36, .055, 10, 32]} />
        <meshStandardMaterial color="#6b8790" metalness={1} roughness={.2} />
      </mesh>
      <group ref={rotor} position={[0, 0, .65]}>
        {[0, Math.PI / 2].map((rotation) => (
          <mesh key={rotation} rotation={[0, 0, rotation]}>
            <boxGeometry args={[.58, .075, .035]} />
            <meshStandardMaterial color="#5de5f2" emissive="#24cbe2" emissiveIntensity={1.6} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, .73]}>
        <ringGeometry args={[.28, .42, 32]} />
        <meshBasicMaterial
          ref={pulse}
          color="#59eeff"
          transparent
          opacity={.25}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ManipulatorArm({ active }: { active: boolean }) {
  const shoulder = useRef<Group>(null);
  const elbow = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!shoulder.current || !elbow.current) return;
    const idle = Math.sin(clock.elapsedTime * .8) * .045;
    shoulder.current.rotation.x = MathUtils.lerp(
      shoulder.current.rotation.x,
      active ? -.92 + idle : -.46 + idle,
      .055,
    );
    elbow.current.rotation.x = MathUtils.lerp(elbow.current.rotation.x, active ? 1.28 : .72, .055);
  });

  return (
    <group position={[1.24, -.58, 1.08]} rotation={[0, 0, -.15]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[.28, .28, .42, 20]} />
        <meshStandardMaterial color="#e26e27" metalness={.76} roughness={.26} />
      </mesh>
      <group ref={shoulder} position={[0, -.05, .08]} rotation={[-.46, 0, 0]}>
        <mesh position={[0, -.62, 0]} castShadow>
          <cylinderGeometry args={[.13, .18, 1.24, 16]} />
          <meshStandardMaterial color="#d7dde0" metalness={.88} roughness={.22} />
        </mesh>
        <mesh position={[0, -.18, 0]}>
          <boxGeometry args={[.27, .72, .25]} />
          <meshStandardMaterial color="#e26e27" metalness={.78} roughness={.25} />
        </mesh>
        <group ref={elbow} position={[0, -1.22, 0]} rotation={[.72, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[.22, .22, .34, 20]} />
            <meshStandardMaterial color="#182b33" metalness={.9} roughness={.25} />
          </mesh>
          <mesh position={[0, -.58, 0]} castShadow>
            <cylinderGeometry args={[.09, .13, 1.16, 14]} />
            <meshStandardMaterial color="#aebdc1" metalness={.92} roughness={.2} />
          </mesh>
          <group position={[0, -1.18, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[.16, .16, .3, 16]} />
              <meshStandardMaterial color="#e26e27" metalness={.8} roughness={.24} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * .15, -.24, 0]} rotation={[0, 0, side * -.32]}>
                <boxGeometry args={[.09, .5, .12]} />
                <meshStandardMaterial color="#d9e2e4" metalness={.9} roughness={.18} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

function ScanSystem({ active }: { active: boolean }) {
  const shell = useRef<Mesh>(null);
  const shellMaterial = useRef<MeshBasicMaterial>(null);
  const plane = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (shell.current) shell.current.rotation.y += .004;
    if (shellMaterial.current) {
      shellMaterial.current.opacity = MathUtils.lerp(shellMaterial.current.opacity, active ? .16 : .025, .08);
    }
    if (plane.current) {
      plane.current.position.y = active ? Math.sin(clock.elapsedTime * 1.7) * 2.05 : -4;
    }
  });

  return (
    <group>
      <mesh ref={shell} scale={[3.65, 2.35, 2.55]}>
        <sphereGeometry args={[1, 28, 18]} />
        <meshBasicMaterial
          ref={shellMaterial}
          color="#39e7ff"
          wireframe
          transparent
          opacity={.025}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={plane} rotation={[-Math.PI / 2, 0, 0]} position={[0, -4, 0]}>
        <planeGeometry args={[7.8, 5.8]} />
        <meshBasicMaterial color="#55efff" transparent opacity={.13} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function LightCone({ x }: { x: number }) {
  return (
    <group>
      <mesh position={[x, .08, 1.42]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[.24, .29, .2, 24]} />
        <meshStandardMaterial color="#d9fbff" emissive="#70f2ff" emissiveIntensity={3.2} />
      </mesh>
      <mesh position={[x, .08, 3.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[.82, 3.7, 28, 1, true]} />
        <meshBasicMaterial
          color="#62dff1"
          transparent
          opacity={.065}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ScanLabel({ position, title, code }: { position: [number, number, number]; title: string; code: string }) {
  return (
    <Html position={position} center distanceFactor={9} transform sprite style={{ pointerEvents: "none" }}>
      <div className="rov-part-label">
        <span>{code}</span>
        <strong>{title}</strong>
      </div>
    </Html>
  );
}

function RovModel({ mode }: { mode: ActionMode }) {
  const root = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const scanning = mode === "scan";
  const exploded = mode === "explode";
  const armActive = mode === "arm";

  useEffect(() => {
    document.body.style.cursor = hovered ? "crosshair" : "";
    return () => { document.body.style.cursor = ""; };
  }, [hovered]);

  useFrame(({ clock, pointer }) => {
    if (!root.current) return;
    root.current.position.y = .28 + Math.sin(clock.elapsedTime * .75) * .12;
    root.current.rotation.y = MathUtils.lerp(root.current.rotation.y, pointer.x * .12, .03);
    root.current.rotation.x = MathUtils.lerp(root.current.rotation.x, pointer.y * -.04, .03);
  });

  return (
    <group ref={root} rotation={[0, -.12, 0]}>
      <group
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[3.45, 1.3, 2.15]} />
          <meshPhysicalMaterial
            color="#21343d"
            metalness={.88}
            roughness={.23}
            clearcoat={.75}
            clearcoatRoughness={.17}
            emissive={hovered ? "#082c34" : "#000000"}
            emissiveIntensity={hovered ? 1.4 : 0}
          />
        </mesh>
        <AnimatedPart position={[0, .76, -.12]} offset={[0, 1.2, 0]} exploded={exploded}>
          <mesh castShadow>
            <boxGeometry args={[2.7, .28, 1.7]} />
            <meshStandardMaterial color="#e5ecee" metalness={.82} roughness={.2} />
          </mesh>
          <mesh position={[0, .17, 0]}>
            <boxGeometry args={[1.28, .08, .5]} />
            <meshStandardMaterial color="#16272f" metalness={.9} roughness={.2} emissive="#133c46" emissiveIntensity={.45} />
          </mesh>
        </AnimatedPart>
        <AnimatedPart position={[0, -.74, .02]} offset={[0, -.78, 0]} exploded={exploded}>
          <mesh>
            <boxGeometry args={[2.75, .2, 1.72]} />
            <meshStandardMaterial color="#101f26" metalness={.95} roughness={.28} />
          </mesh>
        </AnimatedPart>

        <AnimatedPart position={[0, .05, 1.12]} offset={[0, 0, 1.05]} exploded={exploded}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[.66, .73, .28, 40]} />
            <meshStandardMaterial color="#b6c4c8" metalness={.92} roughness={.16} />
          </mesh>
          <mesh position={[0, 0, .16]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[.54, 40]} />
            <meshPhysicalMaterial color="#08212b" metalness={.22} roughness={.05} transmission={.18} emissive="#0a5360" emissiveIntensity={.7} />
          </mesh>
          <mesh position={[0, 0, .18]}>
            <ringGeometry args={[.25, .33, 40]} />
            <meshBasicMaterial color="#71f4ff" transparent opacity={.78} blending={AdditiveBlending} />
          </mesh>
        </AnimatedPart>

        {[-1, 1].flatMap((ySide) => [-1, 1].map((zSide) => (
          <mesh key={`${ySide}-${zSide}`} position={[0, ySide * 1.02, zSide * 1.23]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[.095, .095, 4.65, 14]} />
            <meshStandardMaterial color={ySide > 0 ? "#90a1a6" : "#455c64"} metalness={.96} roughness={.18} />
          </mesh>
        )))}

        {THRUSTER_POSITIONS.map((position) => (
          <Thruster key={position.join("-")} position={position} scanning={scanning} exploded={exploded} />
        ))}

        <ManipulatorArm active={armActive} />
        <LightCone x={-.78} />
        <LightCone x={.78} />
        <pointLight position={[0, .05, 2.15]} color="#6defff" intensity={7} distance={7} decay={2} />

        <AnimatedPart position={[-1.73, .04, .4]} offset={[-.82, 0, 0]} exploded={exploded}>
          <mesh>
            <boxGeometry args={[.05, .82, .72]} />
            <meshStandardMaterial color="#f28132" emissive="#9d2e07" emissiveIntensity={.65} metalness={.74} roughness={.28} />
          </mesh>
        </AnimatedPart>
        <AnimatedPart position={[1.73, .04, .4]} offset={[.82, 0, 0]} exploded={exploded}>
          <mesh>
            <boxGeometry args={[.05, .82, .72]} />
            <meshStandardMaterial color="#f28132" emissive="#9d2e07" emissiveIntensity={.65} metalness={.74} roughness={.28} />
          </mesh>
        </AnimatedPart>

        <mesh visible={false}>
          <boxGeometry args={[5.5, 3.4, 4]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </group>

      <ScanSystem active={scanning} />
      {(scanning || exploded) && (
        <>
          <ScanLabel position={[-2.45, 1.18, .78]} code="THR-04" title="矢量推进单元" />
          <ScanLabel position={[.18, 1.65, -.1]} code="CORE-01" title="密封控制舱" />
          <ScanLabel position={[1.82, -1.5, 1.16]} code="ARM-02" title="六轴作业机械臂" />
        </>
      )}
    </group>
  );
}

function LoadingCore() {
  const root = useRef<Group>(null);
  useFrame((_, delta) => {
    if (root.current) root.current.rotation.z += delta * .7;
  });
  return (
    <group ref={root}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.1, .018, 8, 96]} />
        <meshBasicMaterial color="#63eafa" transparent opacity={.55} blending={AdditiveBlending} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={.72}>
        <torusGeometry args={[1.1, .012, 8, 96]} />
        <meshBasicMaterial color="#ff7b35" transparent opacity={.48} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}

function ExplodedModelPart({
  object,
  offset,
  exploded,
}: {
  object: Group;
  offset: [number, number, number];
  exploded: boolean;
}) {
  const root = useRef<Group>(null);
  useFrame(() => {
    if (!root.current) return;
    root.current.position.x = MathUtils.lerp(root.current.position.x, exploded ? offset[0] : 0, .075);
    root.current.position.y = MathUtils.lerp(root.current.position.y, exploded ? offset[1] : 0, .075);
    root.current.position.z = MathUtils.lerp(root.current.position.z, exploded ? offset[2] : 0, .075);
  });
  return (
    <group ref={root}>
      <primitive object={object} scale={9.6} rotation={[0, -Math.PI / 2, 0]} />
    </group>
  );
}

function ExplodedCallout({ part }: { part: ExplodedPartDefinition }) {
  return (
    <group>
      <Line points={[part.anchor, part.labelPosition]} color="#7de5ee" lineWidth={.7} transparent opacity={.55} />
      <mesh position={part.anchor}>
        <sphereGeometry args={[.045, 12, 12]} />
        <meshBasicMaterial color="#f18a4d" />
      </mesh>
      <Html position={part.labelPosition} center distanceFactor={5.6} transform sprite style={{ pointerEvents: "none" }}>
        <div className="rov-part-label detailed">
          <span>{part.code}</span>
          <strong>{part.title}</strong>
          <small>{part.detail}</small>
        </div>
      </Html>
    </group>
  );
}

type AssemblyMaterialState = {
  material: MeshStandardMaterial;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
  emissive: Color;
  emissiveIntensity: number;
};

type AssemblyPartState = {
  node: Object3D;
  category: AssemblyGroupId;
  basePosition: Vector3;
  offset: Vector3;
  materials: AssemblyMaterialState[];
};

function assemblyCategory(name: string): AssemblyGroupId | null {
  if (!name.startsWith("EXPLODE__")) return null;
  const id = name.split("__")[1];
  if (id.startsWith("thruster-")) return "propulsion";
  if (["frame", "electronics", "battery", "sensor", "sealing"].includes(id)) return id as AssemblyGroupId;
  return null;
}

function buildOfficialAssembly(source: Group) {
  const object = source.clone(true);
  object.updateMatrixWorld(true);
  const modelCenter = new Box3().setFromObject(object).getCenter(new Vector3());
  const parts: AssemblyPartState[] = [];

  object.traverse((node) => {
    const category = assemblyCategory(node.name);
    if (!category) return;
    const center = new Box3().setFromObject(node).getCenter(new Vector3());
    const materialClones = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    const materials: AssemblyMaterialState[] = [];
    node.traverse((entry) => {
      const mesh = entry as Mesh;
      if (!mesh.isMesh) return;
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const nextMaterials = sourceMaterials.map((sourceMaterial) => {
        const original = sourceMaterial as MeshStandardMaterial;
        let material = materialClones.get(original);
        if (!material) {
          material = original.clone();
          material.envMapIntensity = 1.7;
          material.roughness = Math.min(.68, Math.max(.24, material.roughness));
          materialClones.set(original, material);
          materials.push({
            material,
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
            emissive: material.emissive.clone(),
            emissiveIntensity: material.emissiveIntensity,
          });
        }
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    let offset: Vector3;
    if (category === "propulsion") {
      offset = center.clone().sub(modelCenter);
      offset.y *= .55;
      if (offset.lengthSq() < .0001) offset.set(.08, 0, .08);
      offset.normalize().multiplyScalar(.125);
    } else {
      const fixedOffsets: Record<Exclude<AssemblyGroupId, "propulsion">, Vector3> = {
        frame: new Vector3(0, .09, 0),
        electronics: new Vector3(0, .015, .135),
        battery: new Vector3(0, -.115, -.025),
        sensor: new Vector3(.105, .055, .12),
        sealing: new Vector3(0, .02, -.125),
      };
      offset = fixedOffsets[category].clone();
    }
    parts.push({ node, category, basePosition: node.position.clone(), offset, materials });
  });
  return { object, parts };
}

function BlueRovModel({
  mode,
  selectedGroup,
  onSelectGroup,
}: {
  mode: ActionMode;
  selectedGroup: AssemblyGroupId | null;
  onSelectGroup: (group: AssemblyGroupId | null) => void;
}) {
  const { scene } = useGLTF("/models/bluerov2-r4-exploded.glb");
  const root = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const exploded = mode === "explode" || mode === "scan";
  const assembly = useMemo(() => buildOfficialAssembly(scene), [scene]);

  useEffect(() => {
    for (const part of assembly.parts) {
      const active = !selectedGroup || part.category === selectedGroup;
      for (const state of part.materials) {
        state.material.opacity = active ? state.opacity : Math.min(state.opacity, .1);
        state.material.transparent = active ? state.transparent : true;
        state.material.depthWrite = active ? state.depthWrite : false;
        state.material.emissive.copy(active && selectedGroup ? new Color("#0a5962") : state.emissive);
        state.material.emissiveIntensity = active && selectedGroup ? Math.max(.35, state.emissiveIntensity) : state.emissiveIntensity;
        state.material.needsUpdate = true;
      }
    }
  }, [assembly.parts, selectedGroup]);

  useEffect(() => {
    document.body.style.cursor = hovered ? "grab" : "";
    return () => { document.body.style.cursor = ""; };
  }, [hovered]);

  useFrame(({ clock, pointer }) => {
    if (root.current) {
      root.current.position.x = MathUtils.lerp(root.current.position.x, .68, .025);
      root.current.position.y = .66 + Math.sin(clock.elapsedTime * .55) * .055;
      root.current.rotation.y = -.34 + pointer.x * .045;
      root.current.rotation.x = pointer.y * -.018;
    }
    for (const part of assembly.parts) {
      const target = part.basePosition.clone();
      if (exploded) target.add(part.offset);
      part.node.position.lerp(target, .07);
    }
  });

  return (
    <group
      ref={root}
      scale={10.8}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(event) => {
        event.stopPropagation();
        let node: Object3D | null = event.object;
        while (node && !assemblyCategory(node.name)) node = node.parent;
        const category = node ? assemblyCategory(node.name) : null;
        if (category) onSelectGroup(selectedGroup === category ? null : category);
      }}
    >
      <primitive object={assembly.object} />
    </group>
  );
}

useGLTF.preload("/models/bluerov2-r4-exploded.glb");

function SonarRings({ active }: { active: boolean }) {
  const group = useRef<Group>(null);
  const rings = useMemo(() => [0, 1, 2].map(() => ({ material: { current: null as MeshBasicMaterial | null } })), []);
  useFrame(({ clock }) => {
    rings.forEach((ring, index) => {
      const material = ring.material.current;
      if (!material) return;
      const cycle = (clock.elapsedTime * (active ? .34 : .18) + index * .33) % 1;
      material.opacity = (1 - cycle) * (active ? .32 : .1);
    });
    if (group.current) group.current.rotation.z += .0008;
  });
  return (
    <group ref={group} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
      {rings.map((ring, index) => (
        <mesh key={index} scale={1.5 + index * 1.5}>
          <ringGeometry args={[1.9, 1.92, 96]} />
          <meshBasicMaterial
            ref={(material) => { ring.material.current = material; }}
            color="#35d8ed"
            transparent
            opacity={.1}
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function Scene({
  mode,
  selectedGroup,
  onSelectGroup,
}: {
  mode: ActionMode;
  selectedGroup: AssemblyGroupId | null;
  onSelectGroup: (group: AssemblyGroupId | null) => void;
}) {
  return (
    <>
      <fog attach="fog" args={["#07151b", 14, 34]} />
      <ambientLight intensity={.72} color="#b8d8dc" />
      <hemisphereLight args={["#e7fbfc", "#071116", 1.15]} />
      <directionalLight position={[-7, 9, 6]} color="#f2ffff" intensity={3.1} castShadow />
      <directionalLight position={[7, 3, -5]} color="#4aa7b1" intensity={1.5} />
      <directionalLight position={[0, -2, 7]} color="#ef8d55" intensity={.65} />
      <Suspense fallback={<LoadingCore />}>
        <BlueRovModel mode={mode} selectedGroup={selectedGroup} onSelectGroup={onSelectGroup} />
      </Suspense>
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={7.2}
        maxDistance={17}
        minPolarAngle={Math.PI * .25}
        maxPolarAngle={Math.PI * .65}
        target={[.68, 0, 0]}
        enableDamping
        dampingFactor={.05}
      />
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 4, 0, 0]}>
          <Lightformer intensity={5.2} color="#eaffff" position={[0, 6, -6]} scale={[10, 3, 1]} />
          <Lightformer intensity={2.2} color="#57b9c1" position={[-7, 1, 3]} scale={[5, 8, 1]} />
          <Lightformer intensity={1.4} color="#ed8954" position={[7, -1, -2]} scale={[3, 4, 1]} />
        </group>
      </Environment>
      <EffectComposer multisampling={0}>
        <Bloom intensity={.28} luminanceThreshold={.72} luminanceSmoothing={.65} mipmapBlur />
      </EffectComposer>
      <AdaptiveDpr pixelated />
    </>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rov-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

export function RovLanding() {
  const [mode, setMode] = useState<ActionMode>("explode");
  const [selectedGroup, setSelectedGroup] = useState<AssemblyGroupId | null>(null);
  const scanning = mode === "scan";
  const exploded = mode === "explode";
  const modeText = {
    idle: "ASSEMBLED VIEW / STANDBY",
    scan: "CORE X-RAY / FOCUS",
    explode: "EXPLODED ASSEMBLY / 06 SYSTEMS",
    arm: "PROPULSION ARRAY / FOCUS",
  }[mode];

  return (
    <main className="rov-landing">
      <div className="rov-scene" aria-label="可交互水下机器人三维展示">
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [9.6, 5.2, 11.5], fov: 38, near: .1, far: 80 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        >
          <Scene mode={mode} selectedGroup={selectedGroup} onSelectGroup={setSelectedGroup} />
        </Canvas>
      </div>

      <div className="rov-hud-grid" aria-hidden="true" />
      <div className="rov-noise" aria-hidden="true" />
      <div className="rov-corner rov-corner-tl" aria-hidden="true" />
      <div className="rov-corner rov-corner-br" aria-hidden="true" />

      <header className="rov-nav">
        <Link className="rov-brand" href="/" aria-label="ROV Team 首页">
          <span className="rov-brand-mark"><Robot size={23} weight="duotone" /></span>
          <span><strong>ROV / TEAM</strong><small>UNDERWATER ROBOTICS</small></span>
        </Link>
        <div className="rov-nav-status"><i /> OFFICIAL R4 CAD / LIVE <span>CN · 2026</span></div>
        <Link className="rov-console-link" href="/research">
          进入团队系统 <ArrowRight size={16} weight="bold" />
        </Link>
      </header>

      <section className="rov-copy">
        <div className="rov-kicker"><span>01</span> OFFICIAL R4 CAD / INTERACTIVE BREAKDOWN</div>
        <h1><span>ROV PLATFORM</span>EXPLODED</h1>
        <p>基于 Blue Robotics 官方 R4 装配模型重建。<br />查看真实推进器、耐压舱、框架与穿舱连接细节。</p>
        <div className="rov-copy-actions">
          <button
            className={exploded ? "rov-primary-action active" : "rov-primary-action"}
            type="button"
            onClick={() => { setMode(exploded ? "idle" : "explode"); setSelectedGroup(null); }}
            aria-pressed={exploded}
          >
            <CubeTransparent size={18} weight="bold" />
            {exploded ? "收拢全部组件" : "展开爆炸结构"}
          </button>
          <div className="rov-secondary-actions">
            <button
              className={scanning ? "active" : ""}
              type="button"
              onClick={() => {
                setMode(scanning ? "explode" : "scan");
                setSelectedGroup(scanning ? null : "electronics");
              }}
              aria-pressed={scanning}
            >
              <Crosshair size={17} />
              透视核心
            </button>
            <button
              className={selectedGroup === "propulsion" ? "active" : ""}
              type="button"
              onClick={() => {
                setMode("explode");
                setSelectedGroup(selectedGroup === "propulsion" ? null : "propulsion");
              }}
              aria-pressed={selectedGroup === "propulsion"}
            >
              <Lightning size={17} />
              推进阵列
            </button>
          </div>
        </div>
        <span className="rov-control-hint">拖动旋转 · 滚轮缩放 · 点击模型或右侧索引聚焦</span>
      </section>

      <aside className={exploded ? "rov-detail-index active" : "rov-detail-index"} aria-label="爆炸图组件索引">
        <div className="rov-detail-index-head"><span>SYSTEM INDEX</span><b>06 SYSTEMS / R4 CAD</b></div>
        <ol>{ASSEMBLY_GROUPS.map((part, index) => (
          <li className={selectedGroup === part.id ? "selected" : ""} key={part.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <button
              type="button"
              onClick={() => {
                setMode("explode");
                setSelectedGroup(selectedGroup === part.id ? null : part.id);
              }}
              aria-pressed={selectedGroup === part.id}
            >
              <strong>{part.title}</strong>
              <small>{part.code} · {part.detail}</small>
              <em>{part.spec}</em>
            </button>
          </li>
        ))}</ol>
      </aside>

      <div className="rov-bottom-bar">
        <div className="rov-capabilities">
          <span><Gauge size={16} /> 662 CAD SOURCE MESHES</span>
          <span><Lightning size={16} /> 06 × T200 THRUSTERS</span>
          <span><ShieldCheck size={16} /> BLUE ROBOTICS R4 SOURCE</span>
        </div>
        <div className="rov-mode-indicator">
          <CubeTransparent size={17} />
          <span>{modeText}</span>
          <ArrowsOutCardinal size={16} />
        </div>
      </div>
    </main>
  );
}
