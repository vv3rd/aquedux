import { panic } from "../tools/errors";
import type { Fn } from "../tools/functions";
import { Obj, freeze, sortToString } from "../tools/objects";
import { randomString } from "../tools/strings";
import { primitive } from "../tools/ts";
import { Reducer, Task, Msg, TaskControl, ControlOverlay } from "./definition";
import { getInitialState } from "./reducers";

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
    "very wrong with scoping Cmd or TaskControls-s";

function createWireRegistry() {
    return {
        createWire: <TState, TMsg extends Msg, TCtx = {}>(
            reducer: Reducer<TState, TMsg, TCtx>,
        ) => {},
    };
}

interface WiresContainer {
    [wireKey: `${string}(${string})`]: {
        value: unknown;
        createdBy: Msg<any>;
        refKey: object;
    };
}

const mutableRefsRegistry = new WeakMap();
const mutableRefIdentity = Symbol();
function createMutableRef<T extends primitive>(value: T) {
    const ref = Object.create(null);
    const descriptor = {
        enumerable: false,
        configurable: false,
        value: () => `MutableRef`,
    };
    Object.defineProperties(ref, {
        toJSON: descriptor,
        toString: descriptor,
        valueOf: descriptor,
        [Symbol.toPrimitive]: descriptor,
    });
}

export function createWire<TState, TMsg extends Msg, TCtx = {}, TParams = void>(
    this: {
        registry: Map<string, Reducer.Any>;
        selectContainer: (upperState: WiringRoot) => WiresContainer;
    },
    name: string,
    reducerFactory: (params: TParams) => Reducer<TState, TMsg, TCtx>,
) {
    const { registry, selectContainer } = this;
    registry.set(name, reducerFactory);

    const createKey = (params: TParams, name: string) => {
        let key = sortToString(params);
        if (key === undefined) {
            key = "";
        }
        return `${name}(${key})` as const;
    };

    const existingHandles = new WeakMap();

    function selectWireHandle(params: TParams) {
        type THandle = {
            selectOwnState: (root: WiringRoot) => TState;
            require: (ctl: TaskControl<unknown, unknown>) => void;
            abandon: (ctl: TaskControl<unknown, unknown>) => void;
        };

        let reducer = reducerFactory(params);

        let handle: THandle;

        return (root: WiringRoot): THandle => {
            let key = createKey(params, name);
            let container = selectContainer(root);
            if (key in container && handle) {
                return handle;
            }
            let initialValue: TState;
            let outletsCount = 0;
            return (handle = {
                selectOwnState(root) {
                    let value = selectContainer(root)[key]?.value;
                    if (value === undefined) {
                        if (initialValue === undefined) {
                            initialValue = getInitialState(reducer);
                        }
                        value = initialValue;
                    }
                    return value;
                },
                require(ctl) {
                    if (++outletsCount === 1) {
                    }
                },
                abandon(ctl) {
                    if (--outletsCount === 0) {
                    }
                },
            } as THandle);
        };
    }

    return reducerFactory;
}

const createWiringOverlay = () => {
    return ControlOverlay<Obj, Obj>((createStore) => (reducer, context) => {
        const id = randomString();
        const getInitialState = () => {
            return Reducer.initialize(reducer);
        };

        const wiredReducer = makeWiringRoot(reducer);
        const previousStore = createStore(wiredReducer, { ...context, id });

        return previousStore;
    });
};
