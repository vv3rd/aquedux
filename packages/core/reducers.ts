import { asEntries } from "../tools/objects";
import { isPlainObject } from "../tools/objects";
import { Fn } from "../tools/functions";
import { Cmd, Reducer, MsgWith, Msg } from "./control";
import { defineMsg, TypedMsgFactory } from "./messages";

export function getInitialState<TState>(reducer: Reducer<TState, any, any>): TState {
    return Reducer.initialize(reducer);
}

type combineReducers = <
    T extends {
        [key in string]: Reducer<any, any, any>;
    },
>(
    reducersObject: T,
) => Reducer<
    {
        [K in keyof T]: Reducer.inferState<T[K]>;
    },
    {
        [K in keyof T]: Reducer.inferMsg<T[K]>;
    }[keyof T],
    {
        [K in keyof T]: (_: Reducer.inferCtx<T[K]>) => void;
    }[keyof T] extends (_: infer C) => any
        ? { [K in keyof C]: C[K] }
        : never
>;

export const combineReducers: combineReducers = (reducersObject) => {
    const reducers = asEntries(reducersObject);

    return function combination(current, action, command) {
        let next = current!;
        for (let [key, reducer] of reducers) {
            const scopedCmd = createScopedCmd(command, (s) => s[key]);
            const stateWas = current?.[key];
            const stateNow = reducer(stateWas, action, scopedCmd);
            if (stateWas !== stateNow) {
                if (next === current) {
                    next = { ...current };
                }
                next[key] = stateNow;
            }
        }
        return next;
    };
};

type createScopedCmd = <TStateA, TStateB, TCtx>(
    command: Cmd<TStateA, TCtx>,
    selector: (state: TStateA) => TStateB,
) => Cmd<TStateB, TCtx>;

export const createScopedCmd: createScopedCmd = (cmd, selector) => (task) => {
    cmd((ctl) => task({ ...ctl, snapshot: () => selector(ctl.snapshot()) }));
};

export function createClass<
    T,
    N extends string,
    R extends {
        [key: string]: (...args: any[]) => void | T;
    },
>(reducerName: N, initialState: T, updaters: R & ThisType<Accessor<T>>) {
    type Addressed<K extends string> = `${N}/${K}`;
    type TMsgs = {
        [K in keyof R & string]: TypedMsgFactory<
            Fn.Like<R[K], { returns: MsgWith<Parameters<R[K]>, Addressed<K>> }>
        >;
    };
    type TMsg = ReturnType<TMsgs[keyof TMsgs]>;

    const keys = Object.keys(updaters);
    const messages = Object.fromEntries(
        keys.map((key) => [key, defineMsg(`${reducerName}/${key}`).with<any[]>()]),
    ) as unknown as TMsgs;

    const isMatchingMsg = (msg: Msg): msg is TMsg =>
        Object.values(messages).some(({ match }) => match(msg));

    const reducer: Reducer<T> = (state = initialState, msg, exec) => {
        if (!isMatchingMsg(msg)) {
            return state;
        }
        const key = msg.type.slice(reducerName.length + 1);
        const update = updaters[key];
        if (!update) {
            return state;
        }
        const accessor = ((...args) => {
            if (!args.length) {
                return state;
            }
            let next = args[0];
            if (next instanceof Function) next = next(state);
            if (isPlainObject(state) && isPlainObject(next)) {
                state = { ...state, ...next };
            } else {
                state = next as T;
            }
            return state;
        }) as Accessor<T>;
        accessor.do = exec;
        const outState = update.apply(accessor, msg.payload);
        if (outState !== undefined) {
            state = outState;
        }
        return state;
    };

    // TODO: add matchers for messages group, add getInitialState
    return Object.assign(reducer, {
        message: messages,
        reducer,
        reducerName,
    });
}

interface Accessor<T> {
    (): T;
    (Accessor_state: T | Partial<T>): T;
    (Accessor_update: (state: T) => T | Partial<T>): T;
    do: Cmd<T>;
}
