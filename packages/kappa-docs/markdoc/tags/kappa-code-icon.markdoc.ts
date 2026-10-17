import { KappaCodeIcon } from "../../components"

export const kappaCodeIcon = {
  render: KappaCodeIcon,
  selfClosing: true,
  attributes: {
    size: {
      type: String,
      default: "1.2em",
      description: "Size of the icon (CSS height value)",
    },
  },
}
