import { C01Hangar } from './C01Hangar'
import { C02FlightPlan } from './C02FlightPlan'
import { C04Cockpit } from './C04Cockpit'
import { C05Landing } from './C05Landing'
import { C06WhyFly } from './C06WhyFly'
import { C08BoardingPass } from './C08BoardingPass'

export function Story() {
  return (
    <main className="relative z-10">
      <C01Hangar />
      <C02FlightPlan />
      <C04Cockpit />
      <C05Landing />
      <C06WhyFly />
      <C08BoardingPass />
    </main>
  )
}
