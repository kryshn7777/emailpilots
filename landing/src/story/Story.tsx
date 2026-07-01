import { C01Hangar } from './C01Hangar'
import { C02FlightPlan } from './C02FlightPlan'
import { C03Takeoff } from './C03Takeoff'
import { C04Cockpit } from './C04Cockpit'

export function Story() {
  return (
    <main className="relative z-10">
      <C01Hangar />
      <C02FlightPlan />
      <C03Takeoff />
      <C04Cockpit />
    </main>
  )
}
