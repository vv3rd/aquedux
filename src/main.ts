import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const app = document.getElementById("app")!;

const root = createRoot(app);

root.render(createElement(App));

interface Fn {
    inputs: unknown;
    return: unknown;
    args: this["inputs"] extends infer args extends unknown[] ? args : never;
}

type Apply<fn extends Fn, args extends unknown[]> = (fn & {
    ["inputs"]: args;
})["return"];

interface CustomOmitFn extends Fn {
    return: Omit<this["args"][0], this["args"][1]>;
}

type _Omited = Apply<CustomOmitFn, [{ a: any; b: any }, "a"]>;

function use<F extends Fn, A extends F["args"]>(actor: F, ...inputs: A): Apply<F, A> {
    throw 0;
}

interface UseState extends Fn {
    inputs: [unknown];
    return: this["args"][0] extends infer T | (() => infer T) ? T : never;
}

declare const state: UseState;

const result = use(state, () => "123");
