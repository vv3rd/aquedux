import { test, expect } from "bun:test";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
    Boundry,
    sleep,
    Await,
    SusFallbackEl,
    ErrFallbackEl,
    silenceExpectedConsoleError,
} from "./help";
import { createControl, Msg, MsgWith, Cmd } from "../packages/core/definition";
import { combineReducers } from "../packages/core/reducers";
import { Reducer } from "../packages/core/definition";
import { ObjectHTMLAttributes } from "react";

silenceExpectedConsoleError();

test("render", async () => {
    await act(() => render(<Boundry children={<div data-testid="content" />} />));
    expect(screen.getByTestId("content")).toBeInTheDocument();
});

test("suspends and resumes", async () => {
    const time = sleep(50).then(() => <div data-testid="content" />);
    await act(() => render(<Boundry children={<Await the={time} />} />));
    const fallback = screen.getByTestId(SusFallbackEl);
    expect(fallback).toBeInTheDocument();
    const content = await waitFor(() => screen.findByTestId("content"));
    expect(content).toBeInTheDocument();
});

test("catches", async () => {
    const error = Promise.reject(new Error("Expected"));
    await act(() => render(<Boundry children={<Await the={error} />} />));
    expect(screen.getByTestId(ErrFallbackEl)).toBeInTheDocument();
});

const foldCount = Reducer.define<number, Msg<"inc"> | Msg<"dec">, { target: EventTarget }>(
    (model = 0, msg) => {
        return model;
    },
);

type TodoMsg = Msg.Family<{
    add: object;
    check: void;
}>;

const foldTodo = Reducer.define<object[], TodoMsg, { http: typeof fetch }>(
    (model = [], msg, push) => {
        return model;
    },
);

const combi = combineReducers({
    count: foldCount,
    todos: foldTodo,
});

const ctl = createControl(foldCount);
