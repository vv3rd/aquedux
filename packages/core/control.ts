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

export interface Reducer<TVal, TMsg extends Msg = Msg, TCtx = {}> {
    (val: TVal | undefined, msg: TMsg, cmd: Cmd<TVal, TCtx>): TVal;
    getInitialState?: () => TVal;
}

export function Reducer<TVal, TMsg extends Msg.Any = Msg.Any, TCtx = {}>(
    reducer: Reducer<TVal, TMsg, TCtx>,
) {
    return reducer;
}

Reducer.initialize = function initialize<TVal>(reducer: Reducer<TVal, any, any>): TVal {
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

export interface Cmd<TVal, TCtx = {}> {
    (task: Task<void, TVal, TCtx>): void;
}

export interface Task<TResult, TVal, TCtx = {}> {
    (control: Control<TVal, TCtx>): TResult;
}

interface ControlData<TVal, TCtx> {
    snapshot: GetterOf<TVal>;
    context: Immutable<TCtx>;
}
export interface Control<TVal, TCtx = {}> extends ControlData<TVal, TCtx> {
    nextMessage: () => NextMessage;
    lastMessage: () => Msg;
    dispatch: Dispatch;
    catch: (...errors: unknown[]) => void;
}
export declare namespace Control {
    type Any = Control<any, any>;
    type inferCtx<R> = R extends ControlData<any, infer TCtx> ? TCtx : never;
    type inferState<R> = R extends ControlData<infer TVal, any> ? TVal : never;
}

interface NextMessage<TMsg = Msg> {
    then: (onReceive: (msg: TMsg) => void) => void;
}

/* ========================
    creating
   ======================== */

type ControlOverlay<TVal, TCtx> = (
    creator: ControlCreator<TVal, TCtx>,
    final: () => Control<TVal, TCtx>,
) => ControlCreator<TVal, TCtx>;

export function ControlOverlay<TVal, TCtx = {}>(overlay: ControlOverlay<TVal, TCtx>) {
    return overlay;
}

type ControlCreator<TVal, TCtx> = (
    reducer: Reducer<TVal, Msg.Any, TCtx>,
    context: TCtx,
) => Control<TVal, TCtx>;

export function createControl<TVal, TCtx = {}>(
    reducer: Reducer<TVal, Msg.Any, TCtx>,
    {
        context = {} as TCtx,
        overlay = same,
    }: {
        context?: TCtx;
        overlay?: ControlOverlay<TVal, TCtx>;
    } = {},
) {
    const get = () => it;
    const create = overlay(createControlImpl(get), get);
    const it: Control<TVal, TCtx> = create(reducer, context);
    return it;
}

type createControlImpl = (final: () => Control.Any) => ControlCreator<any, any>;
const createControlImpl: createControlImpl = (final) => (reducer, context) => {
    type TVal = Reducer.inferState<typeof reducer>;
    type TMsg = Msg;
    type TCtx = typeof context;
    type TSelf = Control<TVal, TCtx>;
    type TTask = Task<void, TVal, TCtx>;

    let state: TVal = Reducer.initialize(reducer);

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
            let tasks: TTask[] = [];
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

interface ControlObserver<TVal, TCtx> {
    snapshot(): TVal;
    dispatch(msg: Msg): void;
    dispatch<TResult>(task: Task<TResult, TVal, TCtx>): TResult;

    select<TNext>(map: (state: TVal) => TNext): ControlObserver<TNext, TCtx>;
    subscribe(callback: Callback): Subscription;
}

interface Subscription {
    isObserved(): boolean;
    isSingular(): boolean;
    unsubscribe(): void;
}

const OBSERVERS_REGISTRY = new WeakMap<Fn.Any | Control.Any, ControlObserver<any, any>>();

export function createControlObserver<TVal, TCtx = {}>(control: Control<TVal, TCtx>) {
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

    const observer: ControlObserver<TVal, TCtx> = {
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

        dispatch(taskOrMsg: Msg | Task<any, TVal, TCtx>) {
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
