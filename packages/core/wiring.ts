import { panic } from "../tools/errors";
import type { Fn } from "../tools/functions";
import { Obj, freeze, sortToString } from "../tools/objects";
import { randomString } from "../tools/strings";
import { primitive } from "../tools/ts";
import { Reducer, Task, Msg, ControlOverlay, Control } from "./control";
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

export interface Wire<TVal> {
    selectOwnState: (root: WiringRoot) => TVal;
}

export interface WiredReducer<TVal> extends Reducer<TVal>, Wire<TVal> {}

export function withWiring<TVal>(reducer: Reducer<TVal>): WiredReducer<TVal> {
    const wireId = Math.random().toString(36).substring(2);
    const wiredReducer: WiredReducer<TVal> = (state, msg, out) => {
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
            return output as TVal;
        }
    };

    return wiredReducer;
}

export function makeWiringRoot<TVal extends object, TMsg extends Msg, TCtx>(
    reducer: Reducer<TVal, TMsg, TCtx>,
) {
    type TValWithWires = WiringRoot & TVal;
    type TTask = Task<void, TValWithWires, TCtx>;

    const wireMeta: Record<string, (state: TValWithWires) => unknown> = {};
    const probe = probeMsg((wireId) => (api) => {
        wireMeta[wireId] = makeWireSelector(api.snapshot);
    });

    let tasks: TTask[] | TTask = [];
    try {
        reducer(undefined, probe as any, (t) => tasks.push(t));
    } finally {
        freeze(tasks);
    }

    const stubTaskControl = new Proxy({} as Fn.Args<TTask>[0], {
        get: (_, prop: string) => {
            if (prop === ("snapshot" satisfies keyof Control.Any)) {
                return () => stateGetter();
            } else {
                return () => panic(FUCK_STUB_USED);
            }
        },
    });

    for (const task of tasks) {
        task(stubTaskControl );
    }

    let stateGetter = function lockedStateGetter(): TValWithWires {
        throw new Error(FUCK_PROBE_MISUSED);
    };

    function makeWireSelector(getState: () => unknown) {
        return (rootState: TValWithWires) => {
            const previous = stateGetter;
            stateGetter = () => rootState;
            try {
                return getState();
            } finally {
                stateGetter = previous;
            }
        };
    }

    const wiringRootReducer: Reducer<TValWithWires, TMsg, TCtx> = (state, msg, push) => {
        state = reducer(state, msg, push);
        if (!(wiringKey in state)) {
            state = { ...state, [wiringKey]: wireMeta };
        }
        return state;
    };

    return wiringRootReducer;
}

function createWireRegistry() {
    return {
        createWire: <TVal, TMsg extends Msg, TCtx = {}>(
            reducer: Reducer<TVal, TMsg, TCtx>,
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

export function createWire<TVal, TMsg extends Msg, TCtx = {}, TParams = void>(
    this: {
        registry: Map<string, Reducer.Any>;
        selectContainer: (upperState: WiringRoot) => WiresContainer;
    },
    name: string,
    reducerFactory: (params: TParams) => Reducer<TVal, TMsg, TCtx>,
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
            selectOwnState: (root: WiringRoot) => TVal;
            require: (ctl: Control.Any) => void;
            abandon: (ctl: Control.Any) => void;
        };

        let reducer = reducerFactory(params);

        let handle: THandle;

        return (root: WiringRoot): THandle => {
            let key = createKey(params, name);
            let container = selectContainer(root);
            if (key in container && handle) {
                return handle;
            }
            let initialValue: TVal;
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

const FUCK_STUB_USED = "TaskControl on wire probe message is a stub and cannot be used";
const FUCK_NOT_WIRED = "";
const FUCK_PROBE_MISUSED =
    "This should not happen unless you doing something " +
    "very wrong with scoping Cmd or TaskControls-s";
