import { Msg, type SomeMsg } from "./Msg";
import type { Reducer } from "./Reducer";
import type { AnyStore, StoreInTask } from "./Store";
import { Task, type TaskScheduler } from "./Task";

export namespace Wire {}

const probeKey = Symbol();
const probeMsg = Msg.ofType(`wire-${Math.round(Math.random() * 100)}`).withPayload(
    (task: (wireId: string) => (api: AnyStore) => void) => ({
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
    function connectWire(msg: Msg, exec: TaskScheduler<TState>) {
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
    const wiredReducer: WiredReducer<TState> = (state, msg, schedule) => {
        connect(msg, schedule);
        return reducer(state, msg, schedule);
    };
    wiredReducer.select = selectSelf;
    return wiredReducer;
}

export function createWiringRoot<TState extends object, TCtx>(
    reducer: Reducer<TState, SomeMsg, TCtx>,
) {
    type WiredState = WiringRoot & TState;
    const wireMeta: Record<string, (state: WiredState) => unknown> = {};
    const probe = probeMsg((wireId) => (api) => {
        wireMeta[wireId] = createWireSelector(api.getState);
    });
    const tasks = Task.pool<any, WiredState, TCtx>();
    try {
        reducer(undefined, probe as any, tasks.getScheduler());
    } finally {
        tasks.lockScheduler();
    }
    for (const task of tasks) {
        task({ ...stubTaskControls, getState: () => stateGetter() });
    }

    let stateGetter = function lockedStateGetter(): WiredState {
        throw new Error(
            "This should not happen unless you doing something " +
                "very wrong with scoping TaskScheduler-s or TaskControls-s",
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

    const wiringRootReducer: Reducer<WiredState, SomeMsg, TCtx> = (state, msg, schedule) => {
        state = reducer(state, msg, schedule);
        if (!(wiringKey in state)) {
            state = { ...state, [wiringKey]: wireMeta };
        }
        return state;
    };

    return wiringRootReducer;
}

// biome-ignore format:
const stubTaskControls: StoreInTask<any, any> = {
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
