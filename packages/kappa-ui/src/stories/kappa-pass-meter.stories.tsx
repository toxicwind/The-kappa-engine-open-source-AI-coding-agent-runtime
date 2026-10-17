/** @jsxImportSource solid-js */
import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { KappaPassMeter } from "../components/kappa-pass-meter"

const meta: Meta<typeof KappaPassMeter> = {
  title: "Components/Kappa Pass Meter",
  component: KappaPassMeter,
  decorators: [
    (Story) => (
      <div style={{ padding: "16px", width: "320px" }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "centered" },
}

export default meta
type Story = StoryObj<typeof KappaPassMeter>

const format = (value: number) => `$${value.toFixed(2)}`
const render = (used: number, paid: number, bonus: number) => (
  <KappaPassMeter
    used={used}
    paid={paid}
    bonus={bonus}
    label="This month's usage"
    paidLabel="Paid"
    bonusLabel="Bonus"
    format={format}
    aria-label="Kappa Pass monthly usage"
  />
)

export const CurrentPlan: Story = { render: () => render(73.27, 199, 99.5) }
export const UsingBonus: Story = { render: () => render(240, 199, 99.5) }
export const PaidOnly: Story = { render: () => render(73.27, 199, 0) }
export const Empty: Story = { render: () => render(0, 0, 0) }
export const OverLimit: Story = { render: () => render(325, 199, 99.5) }
