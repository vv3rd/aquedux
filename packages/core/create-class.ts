import { Msg, MsgWith } from "./Msg";
import { isPlainObject } from "../tools/objects";
import { Fn } from "../tools/functions";
import { TaskPush, Reducer } from "./definition";

export function createClass<
    T,
    N extends string,
    R extends {
        [key: string]: (...args: any[]) => void | T;
    },
>(reducerName: N, initialState: T, updaters: R & ThisType<Accessor<T>>) {
    type Addressed<K extends string> = `${N}/${K}`;
    type TMsgs = {
        [K in keyof R & string]: Msg.TypedFactory<
            Fn.Like<R[K], { returns: MsgWith<Parameters<R[K]>, Addressed<K>> }>
        >;
    };
    type TMsg = ReturnType<TMsgs[keyof TMsgs]>;

    const keys = Object.keys(updaters);
    const messages = Object.fromEntries(
        keys.map((key) => [key, Msg.define(`${reducerName}/${key}`).with<any[]>()]),
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
    do: TaskPush<T>;
}
