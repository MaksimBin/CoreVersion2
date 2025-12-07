// ===== VNode =====
export function jsx(type, props, ...children) {
  return { type, props: props || {}, children };
}

// ===== Реестр компонентов =====
const componentRegistry = {};
export function registerComponent(name, fn) {
  componentRegistry[name] = fn;
}

// ===== Состояние рендера =====
let states = [];
let stateIndex = 0;
let AppRoot = null;
let container = null;

export function render(Component, target) {
  AppRoot = Component;
  container = typeof target === "string" ? document.querySelector(target) : target;
  if (!container) throw new Error("Core: контейнер не найден");
  rerender();
}

function rerender() {
  stateIndex = 0;
  const v = AppRoot();
  Promise.resolve(v).then(newVNode => {
    const oldNode = container.firstChild;
    diff(container, newVNode, oldNode);
  });
}

function isText(v) {
  return typeof v === "string" || typeof v === "number";
}

// ===== Diff =====
function diff(parent, newVNode, oldNode) {
  if (newVNode == null) {
    if (oldNode) parent.removeChild(oldNode);
    return;
  }
  if (isText(newVNode)) {
    const t = String(newVNode);
    if (!oldNode) {
      parent.appendChild(document.createTextNode(t));
    } else if (oldNode.nodeType === 3) {
      if (oldNode.textContent !== t) oldNode.textContent = t;
    } else {
      parent.replaceChild(document.createTextNode(t), oldNode);
    }
    return;
  }
  if (Array.isArray(newVNode)) {
    const frag = document.createDocumentFragment();
    newVNode.forEach(child => frag.appendChild(createElement(child)));
    if (oldNode) parent.replaceChild(frag, oldNode);
    else parent.appendChild(frag);
    return;
  }
  if (typeof newVNode?.type === "function") {
    const compVNode = newVNode.type({ ...(newVNode.props || {}), children: newVNode.children });
    diff(parent, compVNode, oldNode);
    return;
  }
  if (!oldNode) {
    parent.appendChild(createElement(newVNode));
    return;
  }
  if (oldNode.nodeName.toLowerCase() !== newVNode.type) {
    parent.replaceChild(createElement(newVNode), oldNode);
    return;
  }
  updateProps(oldNode, newVNode.props);
  const oldChildren = Array.from(oldNode.childNodes);
  const newChildren = newVNode.children || [];
  const max = Math.max(oldChildren.length, newChildren.length);
  for (let i = 0; i < max; i++) {
    diff(oldNode, newChildren[i], oldChildren[i]);
  }
}

// ===== Создание узла =====
function createElement(vnode) {
  if (vnode == null || vnode === false) return document.createTextNode("");
  if (isText(vnode)) return document.createTextNode(String(vnode));
  if (Array.isArray(vnode)) {
    const frag = document.createDocumentFragment();
    vnode.forEach(child => frag.appendChild(createElement(child)));
    return frag;
  }
  if (typeof vnode.type === "function") {
    const compVNode = vnode.type({ ...(vnode.props || {}), children: vnode.children });
    return createElement(compVNode);
  }
  const el = document.createElement(vnode.type);
  updateProps(el, vnode.props);
  (vnode.children || []).forEach(child => el.appendChild(createElement(child)));
  return el;
}

function updateProps(el, props = {}) {
  [...el.attributes].forEach(attr => {
    if (!(attr.name in props)) el.removeAttribute(attr.name);
  });
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;

    // style
    if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value);
      continue;
    }

    // events
    if (key.startsWith("on") && typeof value === "function") {
      const evt = key.slice(2).toLowerCase();
      if (el[`__handler_${evt}`]) el.removeEventListener(evt, el[`__handler_${evt}`]);
      el.addEventListener(evt, value);
      el[`__handler_${evt}`] = value;
      continue;
    }

    // form props
    if (key === "value" && "value" in el) { el.value = value; continue; }
    if (key === "checked" && "checked" in el) { el.checked = !!value; continue; }

    // attributes or direct props
    if (key in el && typeof value !== "object") el[key] = value;
    else el.setAttribute(key, value);
  }
}

// ===== Хуки =====
export function useState(initialValue) {
  const idx = stateIndex++;
  if (states[idx] === undefined) states[idx] = initialValue;
  function setValue(next) {
    states[idx] = typeof next === "function" ? next(states[idx]) : next;
    rerender();
  }
  return [states[idx], setValue];
}

// ===== HTML → VNode с компонентами и директивами =====
const htmlTags = new Set([
  "div","span","p","h1","h2","h3","h4","h5","h6",
  "button","input","select","option","ul","li","ol",
  "table","tr","td","th","thead","tbody","form","label",
  "section","article","nav","header","footer","main",
  "img","a","iframe","canvas","svg","path","circle","rect","textarea"
]);

export function htmlToVNode(htmlString, context = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString((htmlString || "").trim(), "text/html");
  const els = Array.from(doc.body.children);
  if (els.length === 0) return null;
  if (els.length === 1) return domNodeToVNode(els[0], context);
  return els.map(el => domNodeToVNode(el, context));
}

function domNodeToVNode(node, context) {
  if (!node) return null;

  // текст: интерполяция и блочные директивы
  if (node.nodeType === 3) {
    const text = node.textContent || "";
    const trimmed = text.trim();

    // {{#if expr}} ... {{/if}}
    if (trimmed.startsWith("{{#if")) {
      const expr = trimmed.slice(5, -2).trim();
      const block = collectBlock(node, "/if");
      const pass = evalInContext(expr, context);
      return pass ? processChildren(block, context) : null;
    }

    // {{#each list as item}} ... {{/each}}
    if (trimmed.startsWith("{{#each")) {
      const inside = trimmed.slice(7, -2).trim();
      let listPath = inside, itemName = "item";
      const asIdx = inside.indexOf(" as ");
      if (asIdx !== -1) {
        listPath = inside.slice(0, asIdx).trim();
        itemName = inside.slice(asIdx + 4).trim();
      }
      const block = collectBlock(node, "/each");
      const arr = get(context, listPath) || [];
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        const local = Object.create(context);
        local[itemName] = item;
        local.index = i;
        const chunk = processChildren(block, local);
        if (Array.isArray(chunk)) out.push(...chunk);
        else if (chunk != null && chunk !== false && chunk !== "") out.push(chunk);
      }
      return out;
    }

    if (trimmed.startsWith("{{/if}}") || trimmed.startsWith("{{/each}}")) return null;

    return interpolateText(text, context);
  }

  // комментарии → игнор
  if (node.nodeType === 8) return null;

  // теги и компоненты
  const tagName = node.tagName; // DOM даёт UPPERCASE
  const lower = tagName.toLowerCase();
  const isComponent = tagName[0] === tagName[0].toUpperCase() && !htmlTags.has(lower);
  let type = lower;

  if (isComponent) {
    // ищем и "COUNTER", и "Counter"
    const properName = lower.charAt(0).toUpperCase() + lower.slice(1);
    const Comp = componentRegistry[tagName] || componentRegistry[properName];
    if (!Comp) return jsx("div", { style: { color: "red" } }, `Компонент ${tagName} не найден`);
    type = function Wrapped(props) { return Comp(props); };
  }

  const props = {};
  const children = [];

  // атрибуты: интерполяция, события, bind
  [...node.attributes].forEach(attr => {
    const name = attr.name;
    const rawVal = attr.value;
    const val = interpolateAttr(rawVal, context);

    if (name.startsWith("on")) {
      const fn = get(context, val.trim());
      if (typeof fn === "function") props[name] = fn;
      return;
    }

    if (name === "bind") {
      const key = val.trim();
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const setter =
        get(context, `set${cap}`) ||
        get(context, `${key}Set`) ||
        get(context, `${key}Setter`);

      const tag = node.tagName.toLowerCase();
      const typeAttr = node.getAttribute("type") || "";
      const isCheckbox = tag === "input" && typeAttr.toLowerCase() === "checkbox";
      const isSelect = tag === "select";
      const isTextarea = tag === "textarea";

      if (isCheckbox) {
        props.checked = !!get(context, key);
        props.onChange = (e) => {
          const next = !!e.target.checked;
          if (typeof setter === "function") setter(next);
          else { setInContext(context, key, next); rerender(); }
        };
      } else if (isSelect) {
        props.value = get(context, key);
        props.onChange = (e) => {
          const next = e.target.value;
          if (typeof setter === "function") setter(next);
          else { setInContext(context, key, next); rerender(); }
        };
      } else {
        props.value = get(context, key);
        props.onInput = (e) => {
          const next = e.target.value;
          if (typeof setter === "function") setter(next);
          else { setInContext(context, key, next); rerender(); }
        };
      }
      return;
    }

    props[name] = val;
  });

  const processedChildren = processChildren(Array.from(node.childNodes), context);
  if (Array.isArray(processedChildren)) children.push(...processedChildren);
  else if (processedChildren != null && processedChildren !== false && processedChildren !== "") children.push(processedChildren);

  return jsx(type, props, ...children);
}

// ===== Обработка детей и блоков =====
function processChildren(nodes, context) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];

    if (n.nodeType === 3) {
      const t = (n.textContent || "").trim();

      if (t.startsWith("{{#if")) {
        const expr = t.slice(5, -2).trim();
        const block = collectBlock(n, "/if");
        const pass = evalInContext(expr, context);
        if (pass) {
          const chunk = processChildren(block, context);
          if (Array.isArray(chunk)) out.push(...chunk);
          else if (chunk != null && chunk !== false && chunk !== "") out.push(chunk);
        }
        continue;
      }

      if (t.startsWith("{{#each")) {
        const inside = t.slice(7, -2).trim();
        let listPath = inside, itemName = "item";
        const asIdx = inside.indexOf(" as ");
        if (asIdx !== -1) {
          listPath = inside.slice(0, asIdx).trim();
          itemName = inside.slice(asIdx + 4).trim();
        }
        const block = collectBlock(n, "/each");
        const arr = get(context, listPath) || [];
        for (let j = 0; j < arr.length; j++) {
          const item = arr[j];
          const local = Object.create(context);
          local[itemName] = item;
          local.index = j;
          const chunk = processChildren(block, local);
          if (Array.isArray(chunk)) out.push(...chunk);
          else if (chunk != null && chunk !== false && chunk !== "") out.push(chunk);
        }
        continue;
      }

      if (t.startsWith("{{/if}}") || t.startsWith("{{/each}}")) continue;
    }

    const v = domNodeToVNode(n, context);
    if (Array.isArray(v)) out.push(...v);
    else if (v != null && v !== false && v !== "") out.push(v);
  }
  return out;
}

function collectBlock(startTextNode, closingName) {
  const parent = startTextNode.parentNode;
  const siblings = Array.from(parent.childNodes);
  const block = [];
  let depth = 0;
  const startIdx = siblings.indexOf(startTextNode);
  for (let i = startIdx + 1; i < siblings.length; i++) {
    const n = siblings[i];
    if (n.nodeType === 3) {
      const t = (n.textContent || "").trim();
      if (t.startsWith("{{#")) depth++;
      if (t.startsWith(`{{${closingName}}}`)) {
        if (depth === 0) return block;
        depth--;
        continue;
      }
    }
    block.push(n);
  }
  return block;
}

// ===== Интерполяция и eval =====
function interpolateText(text, context) {
  return (text || "").replace(/\{\{\s*([a-zA-Z0-9_.$]+)\s*\}\}/g, (_, key) => {
    const v = get(context, key.trim());
    return v == null ? "" : String(v);
  });
}
function interpolateAttr(text, context) {
  return (text || "").replace(/\{\{\s*([a-zA-Z0-9_.$]+)\s*\}\}/g, (_, key) => {
    const v = get(context, key.trim());
    return v == null ? "" : String(v);
  });
}
function evalInContext(expr, context) {
  try {
    const keys = Object.keys(context);
    const vals = keys.map(k => context[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `return (${expr});`);
    return !!fn(...vals);
  } catch {
    return false;
  }
}

// ===== Утилиты контекста =====
function get(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setInContext(obj, path, value) {
  if (!obj || !path) return;
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

// ===== Кэш шаблонов и автозагрузка =====
const templateCache = new Map(); // path -> { status, html?, error? }

async function ensureTemplate(path) {
  const rec = templateCache.get(path);
  if (rec && (rec.status === "loading" || rec.status === "ready")) return rec;
  const loading = { status: "loading" };
  templateCache.set(path, loading);
  try {
    const res = await fetch(path);
    const html = await res.text();
    templateCache.set(path, { status: "ready", html });
    queueMicrotask(() => rerender());
  } catch (e) {
    templateCache.set(path, { status: "error", error: e });
    queueMicrotask(() => rerender());
  }
  return templateCache.get(path);
}
function getTemplate(path) {
  const rec = templateCache.get(path);
  return rec && rec.status === "ready" ? rec.html : null;
}

// ===== Определение компонента (синхронный API, асинхронно под капотом) =====
export function defineComponent(htmlPath, setupFn) {
  ensureTemplate(htmlPath); // запускаем загрузку один раз
  return function Component(props = {}) {
    const html = getTemplate(htmlPath);
    const context = setupFn() || {};
    context.children = props.children || [];

    // показываем заглушку, пока шаблон не готов
    if (!html) return jsx("div", { "data-loading": "true" }, []);

    return htmlToVNode(html, context);
  };
}