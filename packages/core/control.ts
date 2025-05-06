import { freeze, Immutable } from "../tools/objects";
import { safe, same, noop, Callback, GetterOf } from "../tools/functions";
import { randomString } from "../tools/strings";
import { panic } from "../tools/errors";
import { Pretty } from "../tools/ts";

export interface Msg<T extends Msg.Type = Msg.Type> {
    type: T;
}

export interface MsgWith<P, T extends Msg.Type = Msg.Type> extends Msg<T> {
    payload: P;
}

export declare namespace Msg {
    type Any = Msg<any> & { [key: string]: any };
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

export interface Dispatch {
    (this: Control.Any, message: Msg.Any): void;
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

export function Reducer<TState, TMsg extends Msg.Any = Msg.Any, TCtx = {}>(
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

export interface Cmd<TState, TCtx = {}> {
    (task: Task<void, TState, TCtx>): void;
}

export interface Task<TResult, TState, TCtx = {}> {
    (control: TaskControl<TState, TCtx>): TResult;
}

export interface TaskControl<TState, TCtx = {}> extends Control<TState, TCtx> {
    signal: AbortSignal;
}

type ControlType<TState, TCtx> = Pretty<
    {
        [key in keyof { readonly "~TState": unique symbol }]?: TState;
    } & {
        [key in keyof { readonly "~TCtx": unique symbol }]?: TCtx;
    }
>;

interface ControlData<TState, TCtx> {
    snapshot: GetterOf<TState>;
    context: Immutable<TCtx>;
}
export interface Control<TState, TCtx = {}> extends ControlData<TState, TCtx> {
    subscribe: (callback: Callback) => Subscription;
    select: Select;
    dispatch: Dispatch;
    execute: Execute;
    catch: (...errors: unknown[]) => void;
}
export declare namespace Control {
    type Any = Control<any, any>;
    type inferCtx<R> = R extends ControlData<any, infer TCtx> ? TCtx : never;
    type inferState<R> = R extends ControlData<infer TState, any> ? TState : never;
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
    reducer: Reducer<TState, Msg.Any, TCtx>,
    context: TCtx,
) => Control<TState, TCtx>;

export function createControl<TState, TCtx = {}>(
    reducer: Reducer<TState, Msg.Any, TCtx>,
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

type createControlImpl = (final: () => Control.Any) => ControlCreator<any, any>;
const createControlImpl: createControlImpl = (final) => (reducer, context) => {
    type TState = Reducer.inferState<typeof reducer>;
    type TMsg = Msg;
    type TCtx = typeof context;
    type TSelf = Control<TState, TCtx>;

    let state: TState = Reducer.initialize(reducer);

    type Listener = { notify: Callback; cleanups: Array<Callback>; count: number };
    const listeners = new Map<Callback, Listener>();
    let lastMsg: TMsg;
    let nextMsg: PromiseWithResolvers<TMsg> = Promise.withResolvers();

    const activeControl: TSelf = {
        context,

        select(selector) {
            // TODO: add per-selector registries of listeners, continue thinking on how nextMessage should work
            return { ...this, snapshot: () => selector(this.snapshot()) };
        },

        snapshot() {
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
            /* biome-ignore format: */
            for (const [_, l] of listeners) try { l.notify() } catch (e) { errs.push(e) }
            /* biome-ignore format: */
            for (const t of tasks) try { this.execute(t) } catch (e) { errs.push(e) }
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
            snapshot: () => panic(CTRL_LOCKED_ERR),
            subscribe: () => panic(CTRL_LOCKED_ERR),
            select: () => panic(CTRL_LOCKED_ERR),
        };

        return {
            context,
            dispatch: (...a) => delegate.dispatch(...a),
            execute: (...a) => delegate.execute(...a),
            select: (...a) => delegate.select(...a),
            catch: (...a) => delegate.catch(...a),
            snapshot: () => delegate.snapshot(),
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
