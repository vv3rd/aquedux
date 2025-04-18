import { Msg, MsgWith } from "./Msg";
import { StoreInTask } from "./Store";
import { Task, TaskScheduler } from "./Task";
import { isPlainObject } from "../tools/objects";

enum LoadProgress {
    Started = 0,
    GotValue = 1,
    GotError = -1,
}

enum TaskStatus {
    Idle,
    Paused,
    Running,
}

// biome-ignore format:
type UplinkResultsForStatus<R> = {
    [LoadProgress.Started]:  { value: undefined;     error: undefined };
    [LoadProgress.GotValue]: { value: R;             error: undefined };
    [LoadProgress.GotError]: { value: R | undefined; error: Error };
};

type ValueForStatus<S extends LoadProgress, R> = UplinkResultsForStatus<R>[S]["value"];
type ErrorForStatus<S extends LoadProgress, R> = UplinkResultsForStatus<R>[S]["error"];

interface UplinkMeta {
    valueUpdatedAt: number;
    errorUpdatedAt: number;
}

interface UplinkLike<R> {
    taskStatus: TaskStatus;
    progress: LoadProgress;
    value: ValueForStatus<this["progress"], R>;
    error: ErrorForStatus<this["progress"], R>;
}

interface SomeUplink<R> extends UplinkLike<R>, UplinkMeta {}

interface UplinkStarted<R> extends SomeUplink<R> {
    progress: LoadProgress.Started;
}
interface HasValueUplink<R> extends SomeUplink<R> {
    progress: LoadProgress.GotValue;
}
interface HasErrorUplink<R> extends SomeUplink<R> {
    progress: LoadProgress.GotError;
}

export type Uplink<R> =  UplinkStarted<R> | HasErrorUplink<R> | HasValueUplink<R>;

namespace Uplink {
    export const isResolved = <R>(cache: Uplink<R>): cache is HasValueUplink<R> => {
        return cache.progress === LoadProgress.GotValue;
    };
    export const isSettled = <R>(cache: Uplink<R>): cache is HasValueUplink<R> | HasErrorUplink<R> => {
        return  cache.progress !== LoadProgress.Started;
    };
    export const isStarted = <R>(cache: Uplink<R>): cache is UplinkStarted<R> => {
        return !isSettled(cache);
    };

    export const create = <TVal>(): UplinkStarted<TVal> => {
        return {
            value: undefined,
            error: undefined,
            valueUpdatedAt: 0,
            errorUpdatedAt: 0,
            progress: LoadProgress.Started,
            taskStatus: TaskStatus.Idle,
        };
    };
}

interface UplinkCacheLifetime<TVal> {
    shouldInvalidate: (instance: Uplink<TVal>, msg: Msg) => boolean;
    shouldDiscard: (instance: Uplink<TVal>, msg: Msg) => boolean;
    shouldSet: (instance: Uplink<TVal>, msg: Msg) => msg is MsgWith<TVal>;
    untilGarbage: number;
    untilStale: number;
}

interface UplinkValueStructure<TVal, TIn> {
    append: (current: TVal, incomming: TVal, input: TIn) => TVal;
    match: (current: TVal, incomming: TVal) => boolean;
}

interface UplinkSetup<TVal, TIn> {
    name: string;
    fetch: (input: TIn) => UplinkFetchTask<TVal>;
    lifetime: UplinkCacheLifetime<TVal>;
    structure: UplinkValueStructure<TVal, TIn>;
}

interface UplinkSetupFacade<TVal, TIn> {
    name: string;
    fetch: (input: TIn, api: StoreInTask<Uplink<TVal>>) => OptionalPromise<TVal>;
}

type OptionalPromise<T> = void | Promise<void | T>;

type UplinkFetchTask<TVal> = Task<OptionalPromise<TVal>, Uplink<TVal>>;

interface UplinkState<TVal, TIn> {
    caches: {
        [key in string]: Uplink<TVal>;
    };
}

function createUplinkImpl<TVal, TIn>(setup: UplinkSetup<TVal, TIn>) {
    const { name: cacheName, fetch: fetchValue, lifetime, structure } = setup;
    type TUplinkState = UplinkState<TVal, TIn>;
    type TUplink = Uplink<TVal>;

    function createCahceState(key: string, instance: TUplink): TUplinkState {
        return { caches: { [key]: instance } };
    }

    function resourceIsObserved(msg: Msg): msg is MsgWith<{ input: TIn; initialValue?: TVal }> {
        TODO();
    }

    function resourceIsUnobserved(msg: Msg): boolean {
        TODO();
    }

    function instanceIsStale(instance: TUplink): boolean {
        TODO();
    }

    function observe(input: TIn, initialValue?: TVal): UplinkFetchTask<TVal> {
        let key = inputToKey({ input });
        return (scope) => {};
    }

    function reduceUplink(
        state: TUplinkState | null = null,
        msg: Msg,
        schedule: TaskScheduler<TVal>,
    ): TUplinkState | null {
        if (resourceIsObserved(msg)) {
            let key = inputToKey(msg.payload);
            let instance = state && state.caches[key];
            if (instance == null) {
                instance = Uplink.create();
            }
            if (instance.progress === LoadProgress.Started) {
                schedule(({ dispatch }) => {});
                // instance =
            }
            if (state == null) {
                state = createCahceState(key, instance);
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
    if (typeof input === "object") {
        return sortAndJson(input);
    }
    return String(input);
}

export function sortAndJson(object: object) {
    return JSON.stringify(object, (_, original) => {
        if (isPlainObject(original)) {
            const keys = Object.keys(original).sort();
            const sorted: any = {};
            for (const key of keys) {
                sorted[key] = original[key];
            }
            return sorted;
        } else {
            return original;
        }
    });
}

/*
TODO: consider
1. what request to prefer, the one currently pending or the one dispatched later
2. need for manual writes to the cache and what to do with pending requests if a write occurs

*/

function TODO(): never {
    throw new Error("TODO");
}
