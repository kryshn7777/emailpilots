import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { useState } from 'react'
import { GlobeDots } from './GlobeDots'
import { FlightRibbon } from './FlightRibbon'

/**
 * Flight Path hero scene. Full 3D on every device, with an adaptive-DPR net:
 * PerformanceMonitor trims resolution before frames drop (pattern from R3F docs).
 */
export default function FlightScene() {
  const [dpr, setDpr] = useState(1.5)

  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 0, 16], fov: 45 }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <PerformanceMonitor
        onChange={({ factor }) => setDpr(Math.round((1 + factor) * 10) / 10)}
        onFallback={() => setDpr(1)}
      >
        <color attach="background" args={['#0a1430']} />
        <fog attach="fog" args={['#0a1430', 17, 33]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 6, 8]} intensity={1.1} />
        <group rotation={[0.12, 0, 0]}>
          <GlobeDots />
          <FlightRibbon />
        </group>
      </PerformanceMonitor>
    </Canvas>
  )
}
