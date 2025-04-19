import type { Reducer, TaskPush, TaskControl, Control, Task } from "./definition";
import { Msg } from "./Msg";

export namespace Wire {}

const probeKey = Symbol();
const probeMsg = Msg.define(`wire-${Math.round(Math.random() * 100)}`).with(
    (task: (wireId: string) => (ctl: Control<any, any>) => void) => ({
        [probeKey]: task,
    }),
);

const wiringKey = Symbol();
export interface WiringRoot {
    readonly [wiringKey]?: Record<string, (state: WiringRoot) => unknown>;
}

export interface WiredReducer<TState> extends Reducer<TState> {
    select: (root: WiringRoot) => TState;
}

export function createWireUtils<TState>() {
    const wireId = Math.random().toString(36).substring(2);
    function connectWire(msg: Msg, exec: TaskPush<TState>) {
        if (probeMsg.match(msg)) {
            exec(msg.payload[probeKey](wireId));
        }
    }
    function selectSelf(root: WiringRoot) {
        const wiringMeta = root[wiringKey];
        const selector = wiringMeta?.[wireId];
        const output = selector?.(root);
        return output as TState;
    }

    return [connectWire, selectSelf] as const;
}

export function createWire<TState>(reducer: Reducer<TState>): WiredReducer<TState> {
    const [connect, selectSelf] = createWireUtils<TState>();
    const wiredReducer: WiredReducer<TState> = (state, msg, out) => {
        connect(msg, out);
        return reducer(state, msg, out);
    };
    wiredReducer.select = selectSelf;
    return wiredReducer;
}

export function createWiringRoot<TState extends object, TCtx>(reducer: Reducer<TState, Msg, TCtx>) {
    type WiredState = WiringRoot & TState;
    const wireMeta: Record<string, (state: WiredState) => unknown> = {};
    const probe = probeMsg((wireId) => (api) => {
        wireMeta[wireId] = createWireSelector(api.getState);
    });
    let tasks: Task<any, WiredState, TCtx>[] = [];
    try {
        reducer(undefined, probe as any, (cmd) => tasks.push(cmd));
    } finally {
        tasks = [...tasks];
    }
    for (const task of tasks) {
        task({ ...stubTaskControls, getState: () => stateGetter() });
    }

    let stateGetter = function lockedStateGetter(): WiredState {
        throw new Error(
            "This should not happen unless you doing something " +
                "very wrong with scoping Yielder-s or TaskControls-s",
        );
    };

    function createWireSelector(getState: () => unknown) {
        return (rootState: WiredState) => {
            const previous = stateGetter;
            stateGetter = () => rootState;
            try {
                return getState();
            } finally {
                stateGetter = previous;
            }
        };
    }

    const wiringRootReducer: Reducer<WiredState, Msg, TCtx> = (state, msg, push) => {
        state = reducer(state, msg, push);
        if (!(wiringKey in state)) {
            state = { ...state, [wiringKey]: wireMeta };
        }
        return state;
    };

    return wiringRootReducer;
}

// biome-ignore format:
const stubTaskControls: TaskControl<any, any> = {
    context: {},
    signal: AbortSignal.abort(),
    execute() { throw new Error(FUCK_TASK_NOT_REAL); },
    catch() { throw new Error(FUCK_TASK_NOT_REAL); },
    dispatch() { throw new Error(FUCK_TASK_NOT_REAL); },
    getState() { throw new Error(FUCK_TASK_NOT_REAL); },
    subscribe() { throw new Error(FUCK_TASK_NOT_REAL); },
    unsubscribe() { throw new Error(FUCK_TASK_NOT_REAL); }
    // lastMessage() { throw new Error(FUCK_TASK_NOT_REAL); },
    // nextMessage() { throw new Error(FUCK_TASK_NOT_REAL); },
};

const FUCK_TASK_NOT_REAL = "Task api on wire probe message is a stub";
