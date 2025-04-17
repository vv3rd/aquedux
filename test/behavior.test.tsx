import { test, expect } from "bun:test";
import { render, screen, act } from "@testing-library/react";
import { Boundry } from "./help";
import { Reducer } from "../lib/Reducer";
import { Store } from "../lib/Store";
import React from "react";

const reducer = Reducer.compose({
    count: Reducer.primitive(0, "setCount"),
});

test("overlay", () => {
    const store = Store.create(reducer, {
        overlay: (createStore) => {
            return (reducer, ctx, final) => {
                const store = createStore(reducer, ctx, final);

                return {
                    ...store,
                };
            };
        },
    });
    //
    //
});

test("render", async () => {
    await act(() => render(<TestBed children={<TestComponent />} />));
    expect(screen.getByTestId("content")).toBeInTheDocument();
});

function TestBed({ children }: { children: React.ReactNode }) {
    return <Boundry>{children}</Boundry>;
}

function TestComponent() {
    return <div data-testid="content"></div>;
}
