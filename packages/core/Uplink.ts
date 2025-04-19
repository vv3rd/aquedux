import { Msg, MsgWith } from "./Msg";
import { sortToString } from "../tools/objects";
import { TaskPush, Task, TaskControl } from "./definition";

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
interface StartedUplink<R> extends AbstractUplink<R> {
    progress: LoadProgress.Started;
}
interface HasValueUplink<R> extends AbstractUplink<R> {
    progress: LoadProgress.GotValue;
}
interface HasErrorUplink<R> extends AbstractUplink<R> {
    progress: LoadProgress.GotError;
}

export type Uplink<R> = StartedUplink<R> | HasErrorUplink<R> | HasValueUplink<R>;

function createStarted<TVal>(): StartedUplink<TVal> {
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

interface UplinkCacheLifetime<TVal> {
    shouldInvalidate: (instance: Uplink<TVal>, msg: Msg) => boolean;
    shouldDiscard: (instance: Uplink<TVal>, msg: Msg) => boolean;
    shouldSet: (instance: Uplink<TVal>, msg: Msg) => msg is MsgWith<TVal>;
    untilGarbage: number;
    untilStale: number;
    // maybe instead do something like
    // shouldEvict: (instaces: Uplink<TVal> & UplinkMeta) => string[]
    // scheduleEvictionCheck: (idk) => Task
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
    lifetime: UplinkCacheLifetime<TVal>;
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
    type TTaskCtl = TaskControl<TUplinkState>;
    type TUplink = Uplink<TVal>;

    // const { name: cacheName, fetch: fetchValue, lifetime, structure } = setup;

    function createUplinkState(key: string, instance: TUplink): TUplinkState {
        return { results: { [key]: instance }, inputs: {} };
    }

    function resourceIsObserved(_msg: Msg): _msg is MsgWith<{ input: TIn; initialValue?: TVal }> {
        TODO();
    }

    function resourceIsUnobserved(_msg: Msg): boolean {
        TODO();
    }

    function instanceIsStale(_instance: TUplink): boolean {
        TODO();
    }

    function observe(input: TIn) {
        let key = inputToKey({ input });
        return (ctl: TTaskCtl) => {
            observersCount.increment(ctl.context, key);
        };
    }

    function unobserve(input: TIn) {
        let key = inputToKey({ input });
        return async (ctl: TTaskCtl) => {
            observersCount.decrement(ctl.context, key);
        };
    }

    function reduceUplink(
        state: TUplinkState | null = null,
        msg: Msg,
        out: TaskPush<TVal>,
    ): TUplinkState | null {
        if (resourceIsObserved(msg)) {
            let key = inputToKey(msg.payload);
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

function inputToKey({ input }: { input: unknown }) {
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

function TODO(): never {
    throw new Error("TODO");
}

/**
 * @deprecated
 * it's better to not use this at all, just update cache when new entries are added or special GC msg is dispatched
 */
const observersCount = new (class ObserversCount {
    #maps = new WeakMap<{}, Map<string, number>>();
    increment(scopeKey: {}, inputHash: string) {
        let countMap = this.#maps.get(scopeKey);
        if (countMap == null) {
            countMap = new Map();
            this.#maps.set(scopeKey, countMap);
        }
        let count = (countMap.get(inputHash) ?? 0) + 1;
        countMap.set(inputHash, count);
        return count;
    }
    decrement(scopeKey: {}, inputHash: string) {
        let countMap = this.#maps.get(scopeKey);
        if (countMap == null) {
            return 0;
        }
        let count = countMap.get(inputHash) ?? 0;
        if (count <= 0) {
            return 0;
        }
        count -= 1;
        countMap.set(inputHash, count);
        return count;
    }
})();
