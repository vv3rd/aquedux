import { panic } from "../tools/errors";
import { Fn } from "../tools/functions";
import type { Reducer, Task, Msg } from "./definition";

export namespace Wire {}

const probeMsgType = Math.random().toString(36).substring(2);
const probeMsg = (setterTask: (wireId: string) => Task<void, unknown, unknown>) => ({
    type: probeMsgType,
    wiringSetter: setterTask,
});
probeMsg.match = (msg: Msg): msg is ReturnType<typeof probeMsg> => msg.type === probeMsgType;

const wiringKey = "~~INTERNAL_WIRING";
export interface WiringRoot {
    readonly [wiringKey]?: {
        [key in string]: (state: WiringRoot) => unknown;
    };
}

export interface WiredReducer<TState> extends Reducer<TState> {
    selectOwnState: (root: WiringRoot) => TState;
}

export function makeWire<TState>(reducer: Reducer<TState>): WiredReducer<TState> {
    const wireId = Math.random().toString(36).substring(2);
    const wiredReducer: WiredReducer<TState> = (state, msg, out) => {
        if (probeMsg.match(msg)) {
            out(msg.wiringSetter(wireId));
        }
        return reducer(state, msg, out);
    };

    wiredReducer.selectOwnState = (root: WiringRoot) => {
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

    let tasks: TTask[] = [];
    try {
        reducer(undefined, probe as any, (cmd) => tasks.push(cmd));
    } finally {
        tasks = [...tasks];
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
        throw new Error(
            "This should not happen unless you doing something " +
                "very wrong with scoping Yielder-s or TaskControls-s",
        );
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
