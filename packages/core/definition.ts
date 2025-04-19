import { Pretty } from "../tools/ts";
import { Immutable } from "../tools/objects";
import { safe, same, noop, Is } from "../tools/functions";

export interface Msg<T extends string = string> {
    type: T;
}

export interface MsgWith<P, T extends string = string> extends Msg<T> {
    payload: P;
}

export interface MsgToken<TMsg extends Msg = Msg, TArgs extends any[] = any[]> {
    type: TMsg["type"] & {
        [key in { readonly TMsg: unique symbol }["TMsg"]]: TMsg;
    };
    init: (...args: TArgs) => TMsg;
    match: Is<TMsg>;
}

interface Dispatch {
    <T extends MsgToken>(token: T, ...args: Parameters<T["init"]>): void;
}

export interface Reducer<TState, TMsg = Msg, TCtx = {}> {
    (state: TState | undefined, msg: TMsg, push: TaskPush<TState, TCtx>): TState;
}

export interface TaskPush<TState, TCtx = {}> {
    (task: Task<void, TState, TCtx>): void;
}

export interface Task<TResult, TState, TCtx = {}> {
    (control: TaskControl<TState, TCtx>): TResult;
}

export interface TaskControl<TState, TCtx = {}> extends Control<TState, TCtx> {
    subscribe: (callback?: ListenerCallback) => MsgStream<TState>;
    signal: AbortSignal;
}

export interface Control<TState, TCtx = {}> {
    dispatch: Dispatch;
    getState: () => TState;

    context: Immutable<TCtx>;

    subscribe: (callback: ListenerCallback) => Subscription;
    unsubscribe: (callback: ListenerCallback) => void;

    execute: <T>(task: Task<T, TState, TCtx>) => T;
    catch: (...errors: unknown[]) => void;
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
        <M extends Msg>(matcher: MsgToken<M>): Promise<M>;
    };
}

interface ListenerCallback {
    (): void;
}
interface Listener {
    notify: ListenerCallback;
    cleanups: Array<() => void>;
}

export namespace Reducer {
    export function initialize<TState>(reducer: Reducer<TState>): TState {
        return reducer(undefined, { type: Math.random().toString(36).substring(2) }, noop);
    }

    export type InferMsg<R> = R extends Reducer<any> ? Msg : never;
    export type InferState<R> = R extends Reducer<infer S> ? S : never;
}

type ControlOverlay<TState, TCtx> = (
    creator: ControlCreator<TState, TCtx>,
    final: () => Control<TState, TCtx>,
) => ControlCreator<TState, TCtx>;

type ControlCreator<TState, TCtx> = (
    reducer: Reducer<TState, Msg<any>, TCtx>,
    context: TCtx,
) => Control<TState, TCtx>;

export function createControl<TState, TCtx = {}>(
    reducer: Reducer<TState, Msg<any>, TCtx>,
    {
        context = {} as TCtx,
        overlay = same,
    }: {
        context?: TCtx;
        overlay?: ControlOverlay<TState, TCtx>;
    } = {},
) {
    const get = () => it;
    const create = overlay(createControlImpl(get), get);
    const it: Control<TState, TCtx> = create(reducer, context);
    return it;
}

type createControlImpl = (final: () => Control<any, any>) => ControlCreator<any, any>;
const createControlImpl: createControlImpl = (final) => (reducer, context) => {
    type TState = Reducer.InferState<typeof reducer>;
    type TMsg = Msg;
    type TCtx = typeof context;
    type TSelf = Control<TState, TCtx>;

    let state: TState = Reducer.initialize(reducer);
    let lastMsg: TMsg;
    let nextMsg: PromiseWithResolvers<TMsg> = Promise.withResolvers();

    const listeners = new Map<ListenerCallback, Listener>();

    const activeControl: TSelf = {
        context,
        getState() {
            return state;
        },

        dispatch(token, ...args) {
            let msg = token.init(...args);
            if (msg == null) {
                return;
            }
            let tasks: Task<void, TState, TCtx>[] = [];
            try {
                delegate = lockedControl;
                state = reducer(state, msg, (cmd) => tasks.push(cmd));
            } finally {
                delegate = activeControl;
                tasks = [...tasks];
            }
            lastMsg = msg;
            nextMsg.resolve(msg);
            nextMsg = Promise.withResolvers();

            const self = final();
            const errs: unknown[] = [];
            // biome-ignore format:
            for (const {notify} of listeners.values()) try { notify() } catch (e) { errs.push(e) }
            // biome-ignore format:
            for (const task of tasks) try { self.execute(task) } catch (e) { errs.push(e) }
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
            const doTask = safe(task, {
                finally: () => ac.abort(new Error(TASK_EXITED_ERR)),
            });
            const result = doTask(createTaskControl(final(), ac.signal));
            return result;
        },

        catch(...errors) {
            for (const error of errors) {
                reportError(error);
            }
        },
    };

    let delegate: TSelf = activeControl;

    // biome-ignore format: saves space
    const lockedControl: TSelf = {
        context,
        dispatch() { throw new Error(CTRL_LOCKED_ERR); },
        execute() { throw new Error(CTRL_LOCKED_ERR); },
        catch() { throw new Error(CTRL_LOCKED_ERR); },
        getState() { throw new Error(CTRL_LOCKED_ERR); },
        subscribe() { throw new Error(CTRL_LOCKED_ERR); },
        unsubscribe() { throw new Error(CTRL_LOCKED_ERR); },
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

export function createTaskControl<TState, TCtx>(
    base: Control<TState, TCtx>,
    signal: AbortSignal,
): TaskControl<TState, TCtx> {
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

const CTRL_LOCKED_ERR = "Control is locked on dispatch";
const TASK_EXITED_ERR = "Task function completed, nextMessage rejects.";
