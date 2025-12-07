import { render, defineComponent } from "./core.js";
import "./Counter.js";

export const Parent = defineComponent("./Parent.html", () => ({}));
render(Parent, "#app");