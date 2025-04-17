import { TaskScheduler } from "./Task";
import { Msg, MsgWith, SomeMsg } from "./Msg";
import { isPlainObject } from "./toolkit/objects";
import { Fn } from "./toolkit/functions";

export interface Reducer<TState, TMsg = SomeMsg, TCtx = {}> {
    (
        Reducer_currentState: TState | undefined,
        Reducer_message: TMsg,
        Reducer_taskScheduler: TaskScheduler<TState, TCtx>,
    ): TState;
}

type AnyReducer = Reducer<any, any>;

export function Reducer<TState>(reducer: Reducer<TState>) {
    return reducer;
}

export namespace Reducer {
    const InitAction = { type: "INIT-" + Math.random() };

    export const build = createSlice;

    export function initialize<TState>(reducer: Reducer<TState>) {
        return reducer(undefined, InitAction, () => {});
    }

    export const primitive = createPrimitiveReducerImpl;

    export const compose = composeReducersImpl as <M extends Dict<AnyReducer>>(
        reducersDict: M,
    ) => ReducerFromCombination<M>;

    type ReducerFromCombination<
        M extends Dict<AnyReducer>,
        var_State = { [P in keyof M]: InferState<M[P]> },
    > = keyof M extends never ? Reducer<{}> : Reducer<var_State>;

    export type InferMsg<R> = R extends Reducer<any> ? Msg : never;
    export type InferState<R> = R extends Reducer<infer S> ? S : never;
}

function composeReducersImpl(reducersObject: Record<string, AnyReducer>) {
    type TState = any;
    type TMsg = any;

    const reducers = Object.entries(reducersObject);

    if (reducers.length === 0) {
        const emptyState = {};
        return () => emptyState;
    }

    return function composedReducer(
        current: TState | undefined,
        action: TMsg,
        schedule: TaskScheduler<TState>,
    ): TState {
        let next: TState = current;
        for (let [key, reducer] of reducers) {
            const scheduleScoped = TaskScheduler.scoped(schedule, (s) => s[key]);
            const stateWas = current?.[key];
            const stateNow = reducer(stateWas, action, scheduleScoped);
            if (stateWas !== stateNow) {
                if (next === current) {
                    next = { ...current };
                }
                next[key] = stateNow;
            }
        }
        return next;
    };
}

interface Accessor<T> {
    (): T;
    (Accessor_state: T | Partial<T>): T;
    (Accessor_update: (state: T) => T | Partial<T>): T;
    do: TaskScheduler<T>;
}

type Updaters<T> = {
    [key: string]: (this: Accessor<T>, ...args: any[]) => void | T;
};

const buildSlice =
    <TState>() =>
    <U extends Updaters<TState>>(updaters: U) => ({
        withInitialState: (initialState: TState) => ({
            withPrefix: <TName extends string>(name: TName) =>
                createSlice(name, initialState, updaters),
        }),
    });

type todo = { description: string; completed: boolean };

const itemsSlice = buildSlice<{ todos: todo[] }>()({
    itemAdded(item: todo) {},
    itemRemoved(item: todo) {},
    itemsCleared() {},
})
    .withInitialState({
        todos: [],
    })
    .withPrefix("todos");

export function createSlice<T, N extends string, R extends Updaters<T>>(
    reducerName: N,
    initialState: T,
    updaters: R,
) {
    type Addressed<K extends string> = `${N}/${K}`;
    type TMsgs = {
        [K in keyof R & string]: Msg.TypedFactory<
            Fn.Like<R[K], { returns: MsgWith<Parameters<R[K]>, Addressed<K>> }>
        >;
    };
    type TMsg = ReturnType<TMsgs[keyof TMsgs]>;

    const keys = Object.keys(updaters);
    const messages = Object.fromEntries(
        keys.map((key) => [key, Msg.ofType(`${reducerName}/${key}`).withPayload<any[]>()]),
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

function createPrimitiveReducerImpl<T, S extends string>(initialState: T, updType: S) {
    const updateMsg = Msg.ofType(updType).withPayload<T | ((current: T) => T)>();

    const primitiveReducer = (state = initialState, msg: Msg) => {
        if (updateMsg.match(msg)) {
            if (msg.payload instanceof Function) {
                return msg.payload(state);
            } else {
                return msg.payload;
            }
        }
        return state;
    };
    primitiveReducer.update = updateMsg;
    return primitiveReducer;
}

type Todo = {
    text: string;
    completed: boolean;
};

const initialState = {
    todos: [] as Todo[],
};

const { reducer, message } = createSlice("todos", initialState, {
    addTodo(todo: Todo) {
        this({ todos: [todo] });
    },
});

