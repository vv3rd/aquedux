import { noop, safe } from "../tools/functions";
import { randomString } from "../tools/strings";

export interface Fold<TVal, TCtx = {}, TMsg extends Mesg = Mesg> {
    (val: TVal | undefined, msg: TMsg, cmd: Cmnd<TCtx>): TVal;
}

export interface Cmnd<TCtx = {}> {
    (task: Task<TCtx>): void;
}

export interface Mesg<T extends string = string> {
    type: T;
}

interface Task<TCtx = {}, TResult = void> {
    (duct: Duct<TCtx>): TResult;
}

interface Duct<TCtx> {
    context: TCtx;
    read: <T>(wire: Wire<T>) => T;
    send: (msg: Mesg) => void;
    next: () => Promise<Mesg>;
    catch: (...errors: unknown[]) => void;
}

interface Wire<TVal, TCtx = {}> {
    path: string[];
    make: (read: Read) => TVal;
    fold: Fold<TVal, TCtx>;
}

type AnyWire = Wire<any>;

interface Read {
    <A>(wire: Wire<A>): A;
}

function createStore() {
    const boxedValues = new WeakMap<AnyWire, { val: any }>();
    const wireSources = new WeakMap<AnyWire, Set<AnyWire>>();

    interface SelectingContext {
        subject: AnyWire;
        sources: Set<AnyWire>;
        parent: null | SelectingContext;
    }

    let selectCtx: SelectingContext | null = null;

    function select<T>(wire: Wire<T>): T {
        if (selectCtx && selectCtx.subject !== wire) {
            selectCtx.sources.add(wire);
        }
        const box = boxedValues.get(wire);
        if (box) {
            return box.val;
        }
        if (wire.fold) {
            const val = wire.fold(undefined, { type: randomString() });
            mountWire(wire, val);
            return val;
        }

        selectCtx = { subject: wire, sources: new Set(), parent: selectCtx };
        try {
            const val = wire.make(select);
            mountWire(wire, val, selectCtx.sources);
            return val;
        } finally {
            selectCtx = selectCtx.parent;
        }
    }

    function mountWire<T>(wire: Wire<T>, val: T, sources?: Set<AnyWire>) {
        boxedValues.set(wire, { val });
        if (sources) {
            wireSources.set(wire, sources);
        }
    }

    function dispatch() {}

    function observe() {}
}

function createBox<TVal, TCtx>(wire: Wire<TVal, TCtx>, store: Duct<TCtx>) {
    type TTask = Task<TCtx>;

    let dispatchedMessages: Mesg[] = [];
    let scheduledTasks: TTask[] = [];

    let state = wire.fold(undefined, { type: randomString() }, cmd);

    // const nextMessage = {
    //     then(onFulfilled: (msg: Mesg) => void, onRejected: (error: unknown) => void) {
    //         nextMessageWaiters.push({
    //             fulfill: safe(onFulfilled, { catch: store.catch }),
    //             reject: safe(onRejected, { catch: store.catch }),
    //         });
    //     },
    // };
    // const nextMessageWaiters: Array<{
    //     fulfill: (msg: Mesg) => void;
    //     reject: (error: unknown) => void;
    // }> = [];

    function cmd(task: TTask) {
        scheduledTasks.push(task);
    }

    function snapshot() {
        state = dispatchedMessages.splice(0).reduce((next, msg) => {
            return wire.fold(next, msg, cmd);
        }, state);

        scheduledTasks.splice(0).forEach((task) => {
            try {
                task(store);
            } catch (error) {
                store.catch(error);
            }
        });

        return state;
    }

    function dispatch(msg: Mesg) {
        dispatchedMessages.push(msg);
    }
}
