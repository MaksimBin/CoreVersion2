import { useState, defineComponent, registerComponent } from "./core.js";

export const Counter = defineComponent("./Counter.html", () => {
  
  const [count, setCount] = useState(0);
  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);
  
  
  return { count, increment, decrement };
});

registerComponent("Counter", Counter);