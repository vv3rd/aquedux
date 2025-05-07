import { sortToString } from "../tools/objects";
import { Cmd, Task, Msg, MsgWith, Control } from "../core/control";
import { todo } from "../tools/errors";
import { memoOne } from "../tools/functions";
import { defineMsgGroup } from "../core/messages";

enum LoadProgress {
    Started = 0,
    GotValue = 1,
    GotError = -1,
}

interface UplinkMeta {
    valueUpdatedAt: number;
    errorUpdatedAt: number;
}

// biome-ignore format:
type UplinkResultsForStatus<R> = {
    [LoadProgress.Started]:  { value: undefined;     error: undefined };
    [LoadProgress.GotValue]: { value: R;             error: undefined };
    [LoadProgress.GotError]: { value: R | undefined; error: Error };
};
interface AbstractUplink<R> extends UplinkMeta {
    progress: LoadProgress;
    value: UplinkResultsForStatus<R>[this["progress"]]["value"];
    error: UplinkResultsForStatus<R>[this["progress"]]["error"];
}
interface UplinkStarted<R> extends AbstractUplink<R> {
    progress: LoadProgress.Started;
}
interface UplinkWithValue<R> extends AbstractUplink<R> {
    progress: LoadProgress.GotValue;
}
interface UplinkWithError<R> extends AbstractUplink<R> {
    progress: LoadProgress.GotError;
}

export type Uplink<R> = UplinkStarted<R> | UplinkWithError<R> | UplinkWithValue<R>;

function createStarted<TVal>(): UplinkStarted<TVal> {
    return {
        value: undefined,
        error: undefined,
        progress: LoadProgress.Started,
        ...createMeta(),
    };
}

function createMeta(): UplinkMeta {
    return {
        valueUpdatedAt: 0,
        errorUpdatedAt: 0,
    };
}

interface UplinkCacheLifetime<TVal, TIn> {
    shouldInvalidate: (instance: Uplink<TVal>, msg: Msg) => boolean;
    shouldUpdate: (instance: Uplink<TVal>, msg: Msg) => msg is MsgWith<TVal>;
    evictKeys: (entries: Array<{ cache: Uplink<TVal>; input: TIn; key: string }>) => string[];
}

interface UplinkValueStructure<TVal, TIn> {
    append: (current: TVal, incomming: TVal, input: TIn) => TVal;
    match: (current: TVal, incomming: TVal) => boolean;
}

interface UplinkSetup<TVal, TIn, TOut = TVal> {
    name: string;
    // TOut can be Response, then I'll have a `parse` func to get the TVal, this
    // will then allow me to have `measure` func in CacheLifetime to get the size of the object
    // from Content-Length. When TOut is something other than Request, other measuring methods can be used
    fetch: (input: TIn) => UplinkFetchTask<TOut>;
    lifetime: UplinkCacheLifetime<TVal, TIn>;
    structure: UplinkValueStructure<TVal, TIn>;
}

type OptionalPromise<T> = void | Promise<void | T>;

type UplinkFetchTask<TVal> = Task<OptionalPromise<TVal>, Uplink<TVal>>;

interface UplinkState<TVal, TIn> {
    results: {
        [key in string]: Uplink<TVal>;
    };
    inputs: {
        [key in string]: TIn;
    };
}

function createUplinkImpl<TVal, TIn, TOut = TVal>(setup: UplinkSetup<TVal, TIn, TOut>) {
    type TUplinkState = UplinkState<TVal, TIn>;
    type TTaskCtl = Control<TUplinkState>;
    type TUplink = Uplink<TVal>;
    const { name: uplinkName, fetch: fetchValue } = setup;

    const theUplinkMessages = defineMsgGroup(uplinkName)<{
        observed: { input: TIn };
        unobserved: { key: string };
        valueWrite: TVal;
        stateWrite: Uplink<TVal>;
        fetchSuccess: TOut;
        fetchFailure: void | TVal;
    }>();

    function createUplinkState(key: string, instance: TUplink): TUplinkState {
        return { results: { [key]: instance }, inputs: {} };
    }

    function resourceIsObserved(_msg: Msg): _msg is MsgWith<{ input: TIn; initialValue?: TVal }> {
        todo();
    }

    function resourceIsUnobserved(_msg: Msg): boolean {
        todo();
    }

    function instanceIsStale(_instance: TUplink): boolean {
        todo();
    }

    const compareInputs = (a: TIn, b: TIn): boolean =>
        createKey({ input: a }) === createKey({ input: b });

    // FIXME: this is not good enough, need to cache for multiple inputs
    // in a weakmap
    const createUplinkHandle = memoOne((input: TIn) => {
        let mountsCount = 0;
        return {
            mount(ctl: TTaskCtl) {
                if (++mountsCount === 1) {
                    ctl.dispatch({ type: "mount", payload: { input } });
                }
            },
            unmount(ctl: TTaskCtl) {
                if (--mountsCount === 0) {
                    ctl.dispatch({ type: "unmount" });
                }
            },
        };
    }, compareInputs);

    function reduceUplink(
        state: TUplinkState | null = null,
        msg: Msg,
        out: Cmd<TVal>,
    ): TUplinkState | null {
        if (resourceIsObserved(msg)) {
            let key = createKey(msg.payload);
            let instance = state && state.results[key];
            if (instance == null) {
                instance = createStarted();
            }
            if (instance.progress === LoadProgress.Started) {
                out(() => {});
                // instance =
            }
            if (state == null) {
                state = createUplinkState(key, instance);
            }
            return state;
        }

        if (resourceIsUnobserved(msg)) {
        }

        return state;
    }
}

function createKey({ input }: { input: unknown }) {
    if (input == null) {
        return "-";
    }
    return sortToString(input);
}

/*
TODO: consider
1. what request to prefer, the one currently pending or the one dispatched later
2. need for manual writes to the cache and what to do with pending requests if a write occurs

*/
