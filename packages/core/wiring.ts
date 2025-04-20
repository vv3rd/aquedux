import { panic } from "../tools/errors";
import type { Fn } from "../tools/functions";
import { freeze } from "../tools/objects";
import type { Reducer, Task, Msg } from "./definition";

function probeMsg(setterTask: (wireId: string) => Task<void, unknown, unknown>) {
    return {
        type: probeMsg.type,
        wiringSetter: setterTask,
    };
}
probeMsg.type = Math.random().toString(36).substring(2);
probeMsg.match = (msg: Msg): msg is ReturnType<typeof probeMsg> => {
    return msg.type === probeMsg.type;
};

const wiringKey = "~~INTERNAL_WIRING";
export interface WiringRoot {
    readonly [wiringKey]?: {
        [key in string]: (state: WiringRoot) => unknown;
    };
}

export interface Wire<TState> {
    selectOwnState: (root: WiringRoot) => TState;
}

export interface WiredReducer<TState> extends Reducer<TState>, Wire<TState> {}

export function withWiring<TState>(reducer: Reducer<TState>): WiredReducer<TState> {
    const wireId = Math.random().toString(36).substring(2);
    const wiredReducer: WiredReducer<TState> = (state, msg, out) => {
        if (probeMsg.match(msg)) {
            out(msg.wiringSetter(wireId));
        }
        return reducer(state, msg, out);
    };

    wiredReducer.selectOwnState = (root) => {
        const output = root[wiringKey]?.[wireId]?.(root);
        if (output === undefined) {
            throw new Error(FUCK_NOT_WIRED);
        } else {
            return output as TState;
        }
    };

    return wiredReducer;
}

export function makeWiringRoot<TState extends object, TMsg extends Msg, TCtx>(
    reducer: Reducer<TState, TMsg, TCtx>,
) {
    type TStateWithWires = WiringRoot & TState;
    type TTask = Task<void, TStateWithWires, TCtx>;

    const wireMeta: Record<string, (state: TStateWithWires) => unknown> = {};
    const probe = probeMsg((wireId) => (api) => {
        wireMeta[wireId] = makeWireSelector(api.getState);
    });

    let tasks: TTask[] | TTask = [];
    try {
        reducer(undefined, probe as any, (t) => tasks.push(t));
    } finally {
        freeze(tasks);
    }

    const stubTaskControl = new Proxy({} as Fn.Arg<TTask>, {
        get: (_, prop: string) => {
            if (prop === "getState") {
                return () => stateGetter();
            } else {
                return () => panic(FUCK_STUB_USED);
            }
        },
    });

    for (const task of tasks) {
        task(stubTaskControl);
    }

    let stateGetter = function lockedStateGetter(): TStateWithWires {
        throw new Error(FUCK_PROBE_MISUSED);
    };

    function makeWireSelector(getState: () => unknown) {
        return (rootState: TStateWithWires) => {
            const previous = stateGetter;
            stateGetter = () => rootState;
            try {
                return getState();
            } finally {
                stateGetter = previous;
            }
        };
    }

    const wiringRootReducer: Reducer<TStateWithWires, TMsg, TCtx> = (state, msg, push) => {
        state = reducer(state, msg, push);
        if (!(wiringKey in state)) {
            state = { ...state, [wiringKey]: wireMeta };
        }
        return state;
    };

    return wiringRootReducer;
}

const FUCK_STUB_USED = "TaskControl on wire probe message is a stub and cannot be used";
const FUCK_NOT_WIRED = "";
const FUCK_PROBE_MISUSED =
    "This should not happen unless you doing something " +
    "very wrong with scoping TaskPush or TaskControls-s";
