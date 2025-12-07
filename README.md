# CoreVersion2
framework JavaScript 

🌱 Core.js

Лёгкий компонентный движок с виртуальным DOM и хуками. Работает прямо в браузере, без сборки.

✨ Features

✅ Виртуальный DOM

✅ useState для состояния

✅ HTML‑шаблоны с интерполяцией {{var}}

✅ Директивы {{#if}}, {{#each}}

✅ Вложенные компоненты <Parent> → <Child>

✅ Привязка данных через bind

🚀 Usage

Counter

Counter.html

<div>
  <h2>{{count}}</h2>
  <button onclick="increment">➕</button>
  <button onclick="decrement">➖</button>
</div>

Counter.js

import { useState, defineComponent, registerComponent } from "./core.js";

export const Counter = defineComponent("./Counter.html", () => {
  const [count, setCount] = useState(0);
  return {
    count,
    increment: () => setCount(c => c + 1),
    decrement: () => setCount(c => c - 1)
  };
});

registerComponent("Counter", Counter);

Parent

Parent.html

<div>
  <h1>Demo</h1>
  <Counter></Counter>
</div>

Parent.js

import { render, defineComponent } from "./core.js";
import "./Counter.js";

export const Parent = defineComponent("./Parent.html", () => ({}));
render(Parent, "#app");

index.html

<div id="app"></div>
<script type="module" src="Parent.js"></script>

📌 Directives

🌿 {{#if}}

{{#if isLoggedIn}}
  <p>Welcome, {{user}}</p>
{{/if}}

🌿 {{#each}}

<ul>
  {{#each items as item}}
    <li>{{item}}</li>
  {{/each}}
</ul>

🌿 bind

<input bind="name" />
<p>{{name}}</p>

📖 API

🌱 defineComponent(path, setupFn)

🌱 registerComponent(name, component)

🌱 useState(initial)

🌱 render(Component, selector)

⚠️ Notes

Импортируй дочерние компоненты в JS родителя до вызова render.

Теги компонентов должны начинаться с заглавной буквы: <Counter>, <Parent>.