import { freeze, Immutable } from "../tools/objects";
import { same, noop, GetterOf, Callback, Fn } from "../tools/functions";
import { randomString } from "../tools/strings";

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
    (message: Msg.Any): void;
}
export declare namespace Dispatch {
    interface Haver {
        dispatch: Dispatch;
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
    (control: Control<TState, TCtx>): TResult;
}

interface ControlData<TState, TCtx> {
    snapshot: GetterOf<TState>;
    context: Immutable<TCtx>;
}
export interface Control<TState, TCtx = {}> extends ControlData<TState, TCtx> {
    nextMessage: () => NextMessage;
    lastMessage: () => Msg;
    dispatch: Dispatch;
    catch: (...errors: unknown[]) => void;
}
export declare namespace Control {
    type Any = Control<any, any>;
    type inferCtx<R> = R extends ControlData<any, infer TCtx> ? TCtx : never;
    type inferState<R> = R extends ControlData<infer TState, any> ? TState : never;
}

interface NextMessage<TMsg = Msg> {
    then: (onReceive: (msg: TMsg) => void) => void;
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

    let waiters: Array<(msg: TMsg) => void> = [];
    let lastMsg: TMsg;
    let nextMsg: NextMessage<TMsg> | undefined;

    const control: TSelf = {
        context,
        snapshot() {
            return state;
        },
        lastMessage() {
            return lastMsg;
        },
        nextMessage() {
            return nextMsg ?? (nextMsg = { then: waiters.push.bind(waiters) });
        },
        catch(...errors) {
            for (const error of errors) {
                reportError(error);
            }
        },

        dispatch(msg) {
            if (msg == null) {
                return;
            }
            let tasks: Task<void, TState, TCtx>[] = [];
            try {
                state = reducer(state, msg, (t) => tasks.push(t));
            } finally {
                freeze(tasks);
            }
            const callbacks = waiters;
            waiters = [];
            nextMsg = undefined;
            lastMsg = msg;

            const self = final();
            const errs: unknown[] = [];
            /* biome-ignore format: */
            for (const notify of callbacks) try { notify(msg) } catch (e) { errs.push(e) }
            /* biome-ignore format: */
            for (const task of tasks) try { task(self) } catch (e) { errs.push(e) }
            if (errs.length) {
                self.catch(...errs);
            }
        },
    };

    return control;
};

interface ControlObserver<TState, TCtx> {
    snapshot(): TState;
    dispatch(msg: Msg): void;
    dispatch<TResult>(task: Task<TResult, TState, TCtx>): TResult;

    select<TNext>(map: (state: TState) => TNext): ControlObserver<TNext, TCtx>;
    subscribe(callback: Callback): Subscription;
}

interface Subscription {
    isObserved(): boolean;
    isSingular(): boolean;
    unsubscribe(): void;
}

const OBSERVERS_REGISTRY = new WeakMap<Fn.Any | Control.Any, ControlObserver<any, any>>();

export function createControlObserver<TState, TCtx = {}>(control: Control<TState, TCtx>) {

    const listeners = new Map<
        Callback,
        {
            notify: Callback;
            count: number;
        }
    >();

    let nextMsg: NextMessage | undefined;

    const updateNextMsg = () => {
        nextMsg = control.nextMessage();
        nextMsg.then(notify);
    };

    const notify = () => {
        for (const listener of listeners.values()) {
            if (listener.count !== 0) {
                listener.notify();
            }
        }
        updateNextMsg();
    };

    const observer: ControlObserver<TState, TCtx> = {
        snapshot() {
            return control.snapshot();
        },

        select(selector) {
            const existing = OBSERVERS_REGISTRY.get(selector);
            if (existing) {
                return existing;
            }
            const observer = createControlObserver({
                ...control,
                snapshot: () => selector(control.snapshot()),
            });

            OBSERVERS_REGISTRY.set(selector, observer);

            return observer;
        },

        dispatch(taskOrMsg: Msg | Task<any, TState, TCtx>) {
            if (typeof taskOrMsg === "function") {
                const task = taskOrMsg;
                return task(control);
            } else {
                const msg = taskOrMsg;
                control.dispatch(msg);
            }
        },

        subscribe(callback) {
            if (nextMsg === undefined) {
                updateNextMsg();
            }
            let listener = listeners.get(callback);
            if (listener === undefined) {
                listener = { notify: callback, count: 0 };
                listeners.set(callback, listener);
            } else {
                listener.count++;
            }
            const subscription: Subscription = {
                unsubscribe() {
                    if (--listener.count !== 0) {
                        return;
                    }
                    listeners.delete(callback);
                },
                isObserved() {
                    return listener.count > 0;
                },
                isSingular() {
                    return listener.count === 1;
                },
            };
            return subscription;
        },
    };

    return observer;
}
