import { Reducer } from "./Reducer";
import { Task } from "./Task";
import { Msg, SomeMsg } from "./Msg";
import { Pretty } from "./toolkit/ts";

export namespace Store {
    export const create = createStore;
    export const scoped = createScopedStore;
    export const forTask = createStoreForTask;
}

export interface Store<TState, TCtx = {}> {
    dispatch: Dispatch;
    getState: () => TState;

    context: Readonly<TCtx>;

    subscribe: (callback: ListenerCallback) => Subscription;
    unsubscribe: (callback: ListenerCallback) => void;

    execute: <T>(task: Task<T, TState, TCtx>) => T;
    catch: (...errors: unknown[]) => void;
}

export interface StoreInTask<TState, TCtx = {}> extends Store<TState, TCtx> {
    subscribe: (callback?: ListenerCallback) => MsgStream<TState>;
    signal: AbortSignal;
}

interface Unsubscribe {
    (): void;
}

interface Subscription extends Unsubscribe {
    onUnsubscribe: (teardown: () => void) => void;
    nextMessage: () => Promise<Msg>;
    lastMessage: () => Msg;
}

interface MsgStream<TState> extends Subscription, Disposable, AsyncIterable<Msg> {
    query: {
        (checker: (state: TState) => boolean): Promise<TState>;
        <U extends TState>(predicate: (state: TState) => state is U): Promise<U>;
        <T>(selector: (state: TState) => T | null | undefined | false): Promise<T>;
        <M extends Msg>(matcher: Msg.Matcher<M>): Promise<M>;
    };
}

export interface ListenerCallback {
    (): void;
}
export interface Listener {
    notify: ListenerCallback;
    cleanups: Array<() => void>;
}

export interface Dispatch<TMsg = SomeMsg> {
    (action: TMsg): void;
}

type StoreOverlay<TState, TCtx> = (
    creator: StoreCreator<TState, TCtx>,
) => StoreCreator<TState, TCtx>;

type StoreCreator<TState, TCtx> = (
    reducer: Reducer<TState>,
    context: TCtx,
    final: () => Store<TState, TCtx>,
) => Store<TState, TCtx>;

export type AnyStore = Store<any, any>;

const noop = () => {};
const same = <T>(thing: T): T => thing;

function createStore<TState, TCtx = {}>(
    reducer: Reducer<TState>,
    {
        context = {} as TCtx,
        overlay = same,
    }: {
        context?: TCtx;
        overlay?: StoreOverlay<TState, TCtx>;
    } = {},
) {
    const store: Store<TState, TCtx> = overlay(createStoreImpl)(reducer, context, () => store);
    return store;
}

const createStoreImpl: StoreCreator<any, any> = (reducer, context, final) => {
    type TState = Reducer.InferState<typeof reducer>;
    type TMsg = Msg;
    type TCtx = typeof context;
    type TSelf = Store<TState, TCtx>;

    let state: TState = Reducer.initialize(reducer);
    let lastMsg: TMsg;
    let nextMsg: PromiseWithResolvers<TMsg> = Promise.withResolvers();

    const listeners = new Map<ListenerCallback, Listener>();

    const activeStore: TSelf = {
        context,
        getState() {
            return state;
        },

        dispatch(msg) {
            if (msg == null) {
                return;
            }
            const taskPool = Task.pool<void, TState, TCtx>();
            try {
                delegate = lockedStore;
                state = reducer(state, msg, taskPool.getScheduler());
            } finally {
                delegate = activeStore;
                taskPool.lockScheduler();
            }
            lastMsg = msg;
            nextMsg.resolve(msg);
            nextMsg = Promise.withResolvers();

            const self = final();
            const errs: unknown[] = [];
            // biome-ignore format:
            for (const {notify} of listeners.values()) try { notify() } catch (e) { errs.push(e) }
            // biome-ignore format:
            for (const task of taskPool) try { self.execute(task) } catch (e) { errs.push(e) }
            if (errs.length) {
                self.catch(...errs);
            }
        },

        subscribe(callback) {
            const self = final();
            let listener = listeners.get(callback);
            if (listener === undefined) {
                listener = {
                    notify: callback,
                    cleanups: [],
                };
                listeners.set(callback, listener);
            }
            const sub: Subscription = () => self.unsubscribe(callback);
            sub.onUnsubscribe = (teardown) => listener.cleanups.push(teardown);
            sub.lastMessage = () => lastMsg;
            sub.nextMessage = () => nextMsg.promise;
            return sub;
        },

        unsubscribe(callback) {
            const listener = listeners.get(callback);
            if (listener) {
                listeners.delete(callback);
                listener.cleanups.forEach((fn) => fn());
            }
        },

        execute(task) {
            const ac = new AbortController();
            const close = () => ac.abort(new Error(FUCK_TASK_EXITED));
            try {
                const out = task(createStoreForTask(final(), ac.signal));
                if (out instanceof Promise) {
                    out.finally(close);
                }
                return out;
            } finally {
                close();
            }
        },

        catch(...errors) {
            for (const error of errors) {
                reportError(error);
            }
        },
    };

    let delegate: TSelf = activeStore;

    // biome-ignore format: saves space
    const lockedStore: TSelf = {
        context,
        dispatch() { throw new Error(FUCK_STORE_LOCKED); },
        execute() { throw new Error(FUCK_STORE_LOCKED); },
        catch() { throw new Error(FUCK_STORE_LOCKED); },
        getState() { throw new Error(FUCK_STORE_LOCKED); },
        subscribe() { throw new Error(FUCK_STORE_LOCKED); },
        unsubscribe() { throw new Error(FUCK_STORE_LOCKED); },
    };

    // biome-ignore format: better visual
    return {
        context,
		dispatch:    (...a) => delegate.dispatch(...a),
		execute:     (...a) => delegate.execute(...a),
		catch:       (...a) => delegate.catch(...a),
		getState:        () => delegate.getState(),
		subscribe:   (...a) => delegate.subscribe(...a),
		unsubscribe: (...a) => delegate.unsubscribe(...a),
	};
};

function createStoreForTask<TState, TCtx>(
    base: Store<TState, TCtx>,
    signal: AbortSignal,
): StoreInTask<TState, TCtx> {
    return { ...base, subscribe, signal };

    function subscribe(listener: ListenerCallback = noop): MsgStream<TState> {
        {
            const sub = base.subscribe(listener);
            var unsubscribe = () => sub();
            var { onUnsubscribe, lastMessage, nextMessage } = sub;
        }

        signal.addEventListener("abort", unsubscribe);

        const stream: Pretty<MsgStream<TState>> = {
            onUnsubscribe: onUnsubscribe,
            lastMessage: lastMessage,
            nextMessage: () => {
                const resolved = nextMessage();
                const disposed = new Promise<never>((_, reject) => onUnsubscribe(reject));
                return Promise.race([resolved, disposed]);
            },
            query: async (arg: any) => {
                if ("match" in arg) {
                    const matcher = arg;

                    let awaitedMessage: Msg | undefined;
                    while (awaitedMessage === undefined) {
                        const msg = await stream.nextMessage();
                        if (matcher.match(msg)) {
                            awaitedMessage = msg;
                        }
                    }
                    return awaitedMessage;
                } else {
                    const checker = arg;

                    let state = base.getState();
                    let check = checker(state);
                    while (check == null || check === false) {
                        await stream.nextMessage();
                        state = base.getState();
                        check = checker(state);
                    }
                    if (typeof check === "boolean") {
                        return state;
                    } else {
                        return check;
                    }
                }
            },
            [Symbol.dispose]: unsubscribe,
            [Symbol.asyncIterator]: (): AsyncIterator<Msg> => ({
                next: async () => {
                    try {
                        return { value: await stream.nextMessage() };
                    } catch {
                        return { done: true, value: undefined };
                    }
                },
            }),
        };
        return Object.assign(unsubscribe, stream);
    }
}

function createScopedStore<TStateA, TStateB, TCtx>(
    base: Store<TStateA, TCtx>,
    selector: (state: TStateA) => TStateB,
): Store<TStateB, TCtx> {
    const self: Store<TStateB, TCtx> = {
        ...base,
        getState() {
            return selector(base.getState());
        },
        execute(task) {
            return base.execute(({ signal }) => task(createStoreForTask(self, signal)));
        },
    };
    return self;
}

const FUCK_STORE_LOCKED = "Store is locked on dispatch";
const FUCK_TASK_EXITED = "Task function completed, nextMessage rejects.";
