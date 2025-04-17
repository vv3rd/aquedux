import { Msg, MsgWith } from "./Msg";
import { StoreInTask } from "./Store";
import { Task, TaskScheduler } from "./Task";
import { isPlainObject } from "./toolkit/objects";

enum CacheStatus {
    Initial,
    Pending,
    GotError,
    GotValue,
}

enum TaskStatus {
    Idle,
    Paused,
    Running,
}

// biome-ignore format:
type CacheResultsForStatus<R> = {
    [CacheStatus.Initial]:  { value: undefined;     error: undefined };
    [CacheStatus.Pending]:  { value: undefined;     error: undefined };
    [CacheStatus.GotValue]: { value: R;             error: undefined };
    [CacheStatus.GotError]: { value: R | undefined; error: Error };
};

type ValueForStatus<S extends CacheStatus, R> = CacheResultsForStatus<R>[S]["value"];
type ErrorForStatus<S extends CacheStatus, R> = CacheResultsForStatus<R>[S]["error"];

interface CacheMeta {
    valueUpdatedAt: number;
    errorUpdatedAt: number;
}

interface CacheLike<R> {
    taskStatus: TaskStatus;
    status: CacheStatus;
    value: ValueForStatus<this["status"], R>;
    error: ErrorForStatus<this["status"], R>;
}

interface SomeCache<R> extends CacheLike<R>, CacheMeta {}

interface InitialCache<R> extends SomeCache<R> {
    status: CacheStatus.Initial;
}
interface PendingCache<R> extends SomeCache<R> {
    status: CacheStatus.Pending;
}
interface HasValueCache<R> extends SomeCache<R> {
    status: CacheStatus.GotValue;
}
interface HasErrorCache<R> extends SomeCache<R> {
    status: CacheStatus.GotError;
}

export type Cache<R> = InitialCache<R> | PendingCache<R> | HasErrorCache<R> | HasValueCache<R>;

namespace Cache {
    type PredicatedBy<Fn> = Fn extends (arg: any) => arg is infer T ? T : never;
    export const isResolved = <R>(
        resource: Cache<R>,
    ): resource is Extract<Cache<R>, { status: CacheStatus.GotValue }> => {
        return resource.status === CacheStatus.GotValue;
    };

    export const isSettled = <R>(
        resource: Cache<R>,
    ): resource is Exclude<Cache<R>, { status: CacheStatus.Initial | CacheStatus.Pending }> => {
        return resource.status !== CacheStatus.Initial && resource.status !== CacheStatus.Pending;
    };
    export const isPending = <R>(
        resource: Cache<R>,
    ): resource is Exclude<Cache<R>, PredicatedBy<typeof isSettled>> => {
        return !isSettled(resource);
    };

    export const create = <TVal>(): InitialCache<TVal> => {
        return {
            value: undefined,
            error: undefined,
            valueUpdatedAt: 0,
            errorUpdatedAt: 0,
            status: CacheStatus.Initial,
            taskStatus: TaskStatus.Idle,
        };
    };
}

interface CacheLifetime<TVal> {
    shouldInvalidate: (instance: Cache<TVal>, msg: Msg) => boolean;
    shouldDiscard: (instance: Cache<TVal>, msg: Msg) => boolean;
    shouldSet: (instance: Cache<TVal>, msg: Msg) => msg is MsgWith<TVal>;
    untilGarbage: number;
    untilStale: number;
}

interface CacheDataStructure<TVal, TIn> {
    append: (current: TVal, incomming: TVal, input: TIn) => TVal;
    match: (current: TVal, incomming: TVal) => boolean;
}

interface CacheSetup<TVal, TIn> {
    name: string;
    fetch: (input: TIn) => CacheFetchTask<TVal>;
    lifetime: CacheLifetime<TVal>;
    structure: CacheDataStructure<TVal, TIn>;
}

interface CacheSetupFacade<TVal, TIn> {
    name: string;
    fetch: (input: TIn, api: StoreInTask<Cache<TVal>>) => OptionalPromise<TVal>;
}

type OptionalPromise<T> = void | Promise<void | T>;

type CacheFetchTask<TVal> = Task<OptionalPromise<TVal>, Cache<TVal>>;

interface CacheState<TVal, TIn> {
    caches: {
        [key in string]: Cache<TVal>;
    };
}

function createCacheImpl<TVal, TIn>(setup: CacheSetup<TVal, TIn>) {
    const { name: cacheName, fetch: fetchValue, lifetime, structure } = setup;
    type TCacheState = CacheState<TVal, TIn>;
    type TCache = Cache<TVal>;

    function createCahceState(key: string, instance: TCache): TCacheState {
        return { caches: { [key]: instance } };
    }

    function resourceIsObserved(msg: Msg): msg is MsgWith<{ input: TIn; initialValue?: TVal }> {
        TODO();
    }

    function resourceIsUnobserved(msg: Msg): boolean {
        TODO();
    }

    function instanceIsStale(instance: TCache): boolean {
        TODO();
    }

    function observe(input: TIn, initialValue?: TVal): CacheFetchTask<TVal> {
        let key = inputToKey({ input });
        return (scope) => {};
    }

    function reduceCache(
        state: TCacheState | null = null,
        msg: Msg,
        schedule: TaskScheduler<TVal>,
    ): TCacheState | null {
        if (resourceIsObserved(msg)) {
            let key = inputToKey(msg.payload);
            let instance = state && state.caches[key];
            if (instance == null) {
                instance = Cache.create();
            }
            if (instance.status === CacheStatus.Initial) {
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
