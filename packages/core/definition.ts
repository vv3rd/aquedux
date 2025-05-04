import { freeze, Immutable } from "../tools/objects";
import { safe, same, noop, Callback } from "../tools/functions";
import { randomString } from "../tools/strings";
import { panic } from "../tools/errors";

export interface Msg<T extends Msg.Type = Msg.Type> {
    type: T;
}

export interface MsgWith<P, T extends Msg.Type = Msg.Type> extends Msg<T> {
    payload: P;
}

interface MsgUntyped extends Msg {
    [key: string]: any;
}

export interface Dispatch {
    (this: Control<any, any>, message: MsgUntyped): void;
}
export declare namespace Dispatch {
    interface Haver {
        dispatch: Dispatch;
    }
}

export interface Execute {
    <T, TState, TCtx>(this: Control<TState, TCtx>, task: Task<T, TState, TCtx>): T;
}
export declare namespace Execute {
    interface Haver {
        execute: Execute;
    }
}

export interface Select {
    <T, TState, TCtx>(this: Control<TState, TCtx>, map: (state: TState) => T): Control<T, TCtx>;
}
export declare namespace Select {
    interface Haver {
        select: Select;
    }
}

export interface Reducer<TState, TMsg extends Msg = Msg, TCtx = {}> {
    (state: TState | undefined, msg: TMsg, cmd: Cmd<TState, TCtx>): TState;
    getInitialState?: () => TState;
}

export interface Cmd<TState, TCtx = {}> {
    (task: Task<void, TState, TCtx>): void;
}

export interface Task<TResult, TState, TCtx = {}> {
    (control: TaskControl<TState, TCtx>): TResult;
}

export interface TaskControl<TState, TCtx = {}> extends Control<TState, TCtx> {
    signal: AbortSignal;
}

export interface Control<TState, TCtx = {}> {
    context: Immutable<TCtx>;
    getState: () => TState;
    subscribe: (callback: Callback) => Subscription;
    select: Select;
    dispatch: Dispatch;
    execute: Execute;
    catch: (...errors: unknown[]) => void;
}

interface Unsubscribe {
    (): void;
}

export interface Subscription {
    onUnsubscribe: (teardown: () => void) => void;
    nextMessage: () => Promise<Msg>;
    lastMessage: () => Msg;
    unsubscribe: Unsubscribe;
}

export declare namespace Msg {
    type Type = string;
    interface Matcher<TMsg extends Msg> {
        match: (message: Msg) => message is TMsg;
    }

    type inferPayload<TMsg extends Msg> = TMsg extends MsgWith<infer P> ? P : void;
    type inferMatch<TMatcher extends Matcher<any>> = TMatcher extends Matcher<infer T> ? T : never;

    type Family<T extends { [key: string]: any }> = {
        [K in keyof T]: K extends string ? (T[K] extends void ? Msg<K> : MsgWith<T[K], K>) : never;
    }[keyof T];
}

export declare namespace Control {
    type inferCtx<R> = R extends { context: infer TCtx } ? TCtx : never;
    type inferState<R> = R extends { getState: () => infer TState } ? TState : never;
}

export function Reducer<TState, TMsg extends Msg<any> = Msg, TCtx = {}>(
    reducer: Reducer<TState, TMsg, TCtx>,
) {
    return reducer;
}

Reducer.initialize = function initialize<TState>(reducer: Reducer<TState, any, any>): TState {
    if (reducer.getInitialState) {
        return reducer.getInitialState();
    }
    return reducer(undefined, { type: randomString() }, noop);
};

export declare namespace Reducer {
    type Any = Reducer<any, any, any>;
    type inferMsg<R> = R extends Reducer<any, infer TMsg, any> ? TMsg : never;
    type inferCtx<R> = R extends Reducer<any, any, infer TCtx> ? TCtx : never;
    type inferState<R> = R extends Reducer<infer S, any, any> ? S : never;
}

/* ========================
    creating
   ======================== */

type ControlOverlay<TState, TCtx> = (
    creator: ControlCreator<TState, TCtx>,
    final: () => Control<TState, TCtx>,
) => ControlCreator<TState, TCtx>;

export function ControlOverlay<TState, TCtx = {}>(overlay: ControlOverlay<TState, TCtx>) {
    return overlay;
}

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
    type TState = Reducer.inferState<typeof reducer>;
    type TMsg = Msg;
    type TCtx = typeof context;
    type TSelf = Control<TState, TCtx>;

    let state: TState = Reducer.initialize(reducer);
    let lastMsg: TMsg;
    let nextMsg: PromiseWithResolvers<TMsg> = Promise.withResolvers();

    type Listener = {
        notify: Callback;
        cleanups: Array<Callback>;
        count: number;
    };

    const listeners = new Map<Callback, Listener>();

    const activeControl: TSelf = {
        context,

        select(selector) {
            return { ...this, getState: () => selector(this.getState()) };
        },

        getState() {
            return state;
        },

        dispatch(msg) {
            if (msg == null) {
                return;
            }
            let tasks: Task<void, TState, TCtx>[] = [];
            try {
                lockControl();
                state = reducer(state, msg, (t) => tasks.push(t));
            } finally {
                unlockControl();
                freeze(tasks);
            }
            lastMsg = msg;
            nextMsg.resolve(msg);
            nextMsg = Promise.withResolvers();

            const errs: unknown[] = [];
            /* biome-ignore format: */ {
            for (const [_, l] of listeners) try { l.notify() } catch (e) { errs.push(e) }
            for (const t of tasks) try { this.execute(t) } catch (e) { errs.push(e) }
            }
            if (errs.length) {
                this.catch(...errs);
            }
        },

        subscribe(callback) {
            let listener = listeners.get(callback);
            if (listener !== undefined) {
                listener.count += 1;
            } else {
                listener = { notify: callback, cleanups: [], count: 0 };
                listeners.set(callback, listener);
            }

            // FIXME: counting subscriptions might be not the same as counting selector observers
            // i could attach same reference of listener callback to each selector via WeakMap
            // but it doesn't seam like resilient solution
            return {
                onUnsubscribe: (teardown) => listener.cleanups.push(teardown),
                lastMessage: () => lastMsg,
                nextMessage: () => nextMsg.promise,
                unsubscribe: () => {
                    const listener = listeners.get(callback);
                    if (!listener) {
                        return;
                    }
                    if (--listener.count === 0) {
                        listeners.delete(callback);
                        listener.cleanups.forEach((fn) => fn());
                    }
                },
            };
        },

        execute(task) {
            const ac = new AbortController();
            const doTask = safe(task, {
                finally: () => ac.abort(new Error(TASK_EXITED_ERR)),
            });
            const result = doTask(createTaskControl(this, ac.signal));
            return result;
        },

        catch(...errors) {
            for (const error of errors) {
                reportError(error);
            }
        },
    };

    {
        let delegate: TSelf = activeControl;
        var lockControl = () => {
            delegate = lockedControl;
        };
        var unlockControl = () => {
            delegate = activeControl;
        };

        const lockedControl: TSelf = {
            context,
            dispatch: () => panic(CTRL_LOCKED_ERR),
            execute: () => panic(CTRL_LOCKED_ERR),
            catch: () => panic(CTRL_LOCKED_ERR),
            getState: () => panic(CTRL_LOCKED_ERR),
            subscribe: () => panic(CTRL_LOCKED_ERR),
            select: () => panic(CTRL_LOCKED_ERR),
        };

        return {
            context,
            dispatch: (...a) => delegate.dispatch(...a),
            execute: (...a) => delegate.execute(...a),
            select: (...a) => delegate.select(...a),
            catch: (...a) => delegate.catch(...a),
            getState: () => delegate.getState(),
            subscribe: (...a) => delegate.subscribe(...a),
        };
    }
};

export function createTaskControl<TState, TCtx>(
    base: Control<TState, TCtx>,
    signal: AbortSignal,
): TaskControl<TState, TCtx> {
    return {
        ...base,
        signal,
        subscribe(listener: Callback): Subscription {
            const sub = base.subscribe(listener);
            signal.addEventListener("abort", sub.unsubscribe);
            return {
                ...sub,
                nextMessage: () => {
                    const resolved = sub.nextMessage();
                    const disposed = new Promise<never>((_, reject) => sub.onUnsubscribe(reject));
                    return Promise.race([resolved, disposed]);
                },
            };
        },
    };
}

const CTRL_LOCKED_ERR = "Control is locked on dispatch";
const TASK_EXITED_ERR = "Task function completed, nextMessage rejects.";
